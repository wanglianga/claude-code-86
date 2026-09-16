import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SpoiledReport, BatchRecall, RecallTask, Redelivery,
} from '../../entities/spoiled.entity';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { Archive, Feedback } from '../../entities/archive.entity';
import { Delivery } from '../../entities/delivery.entity';
import { User, UserRole, ROLE_NAMES } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';

/** 下架任务处理时限（小时） */
const RECALL_DEADLINE_HOURS = 2;
/** 同批次跨店匹配：生产时间误差（分钟） */
const BATCH_MATCH_MIN = 90;
/** 运营催办最小间隔（分钟） */
const REMIND_INTERVAL_MIN = 30;
/** 未配送团餐的订单状态 */
const UNDELIVERED_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'];

@Injectable()
export class SpoiledService {
  constructor(
    @InjectRepository(SpoiledReport) private reportRepo: Repository<SpoiledReport>,
    @InjectRepository(BatchRecall) private recallRepo: Repository<BatchRecall>,
    @InjectRepository(RecallTask) private taskRepo: Repository<RecallTask>,
    @InjectRepository(Redelivery) private redeliveryRepo: Repository<Redelivery>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentLog) private incidentLogRepo: Repository<IncidentLog>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    @InjectRepository(Feedback) private feedbackRepo: Repository<Feedback>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notify: NotificationService,
  ) {}

  private genNo(prefix: string) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${prefix}${ymd}${Math.floor(10000 + Math.random() * 89999)}`;
  }

  /** 责任班次：按当前小时划分 */
  private currentShift(date = new Date()) {
    const h = date.getHours();
    if (h >= 6 && h < 14) return '早班（06:00-14:00）';
    if (h >= 14 && h < 22) return '中班（14:00-22:00）';
    return '晚班（22:00-06:00）';
  }

  private async adminReviewer() {
    return this.userRepo.findOne({ where: { role: UserRole.ADMIN, active: true } });
  }

  /** 反馈上下文：订单商品 + 供餐门店批次（含已售罄批次），供企业员工选择商品批次 */
  async reportContext(orderId: number, user: User) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权反馈其它企业的订单');
    }
    const plan = await this.planRepo.findOne({ where: { orderId }, order: { version: 'DESC' } });
    const delivery = await this.deliveryRepo.findOne({ where: { orderId } });
    const productIds = Array.from(new Set((plan?.items || []).map((i: any) => i.productId)));
    const batches = await this.batchRepo.find({
      where: { storeId: order.storeId, productId: In(productIds.length ? productIds : [0]) },
      order: { producedAt: 'DESC' },
      take: 100,
    });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    return {
      order: {
        id: order.id, orderNo: order.orderNo, status: order.status,
        storeId: order.storeId, contactName: order.contactName,
      },
      deliveredAt: delivery?.deliveredAt || delivery?.pickedAt || order.deliverAt,
      items: (plan?.items || []).map((i: any) => ({
        productId: i.productId, name: i.name, category: i.category,
        unitPrice: i.unitPrice, vegetarian: i.vegetarian,
      })),
      batches: batches.map(b => ({
        batchId: b.id, batchNo: b.batchNo, productId: b.productId,
        productName: pmap.get(b.productId)?.name,
        producedAt: b.producedAt, expiresAt: b.expiresAt,
        quantity: b.quantity, tempZone: b.tempZone, status: b.status,
      })),
    };
  }

  /** 第一步：企业员工反馈餐食变质，收集批次/签收时间/温控照片/食用人员 */
  async create(dto: any, user: User) {
    const order = await this.orderRepo.findOne({ where: { id: +dto.orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权反馈其它企业的订单');
    }
    if (![OrderStatus.DELIVERED, OrderStatus.SIGNED, OrderStatus.COMPLETED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('仅已送达/签收的团餐可提交变质售后');
    }
    const items: any[] = (dto.items || []).filter((i: any) => i.productId && +i.qty > 0);
    if (!items.length) throw new BadRequestException('请至少选择一种变质商品及数量');
    if (items.some(i => !i.batchId)) throw new BadRequestException('每种问题商品都必须选择生产批次，以便定位同批次下架范围');
    const photos: any[] = (dto.photos || []).filter((p: any) => p.fileName);
    const diners: any[] = (dto.diners || []).filter((p: any) => p.name);

    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const batches = await this.batchRepo.find({ where: { id: In(items.map(i => +i.batchId).filter(Boolean)) } });
    const bmap = new Map(batches.map(b => [b.id, b]));
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: order.id } });

    const fullItems = items.map((i: any) => {
      const p = pmap.get(+i.productId);
      const b = bmap.get(+i.batchId);
      return {
        productId: +i.productId,
        name: p?.name || i.name,
        category: p?.category,
        unitPrice: Number(p?.price || i.unitPrice || 0),
        qty: +i.qty,
        issueType: i.issueType || dto.issueType || 'SPOILED',
        batchId: b?.id ?? null,
        batchNo: b?.batchNo || i.batchNo || '批次待门店核对',
      };
    });

    const report = this.reportRepo.create({
      reportNo: this.genNo('SH'),
      orderId: order.id,
      enterpriseId: order.enterpriseId,
      storeId: order.storeId,
      issueType: dto.issueType || 'SPOILED',
      items: fullItems,
      deliveredAt: delivery?.deliveredAt || order.deliverAt,
      photos,
      diners,
      description: dto.description || '',
      status: 'OPEN',
      refundMultiplier: +dto.refundMultiplier || 2,
      createdBy: user.id,
    });
    const saved = await this.reportRepo.save(report);

    // 员工反馈记录（变质）
    await this.feedbackRepo.save(this.feedbackRepo.create({
      orderId: order.id, rating: 1, comment: dto.description || '餐食变质售后',
      spoiled: true, createdBy: user.id,
    }));

    // 联动高优先级（食安紧急）异常工单
    const incident = await this.incidentRepo.save(this.incidentRepo.create({
      ticketNo: `GD${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
      orderId: order.id,
      type: 'SPOILED',
      title: '餐食变质售后',
      description: `售后单 ${saved.reportNo}：${fullItems.map(i => `${i.name}${i.qty}份(${i.issueType === 'ODOR' ? '异味' : '变质'})`).join('、')}；`
        + `涉及食用人员 ${diners.length} 人，温控照片 ${photos.length} 张。${dto.description || ''}`,
      status: 'OPEN', priority: 'URGENT',
      createdBy: user.id, createdByRole: user.role,
    }));
    saved.incidentId = incident.id;
    await this.reportRepo.save(saved);
    await this.incidentLog(incident.id, user, 'CREATED', `企业提交变质售后单 ${saved.reportNo}（批次/签收时间/温控照片/食用人员已收集）`);

    order.hasException = true;
    await this.orderRepo.save(order);

    const dinerNames = diners.map((x: any) => x.name).join('、') || '未登记';
    await this.notify.send({
      role: 'SERVICE',
      title: '🚨 食安售后：餐食变质待处理',
      content: `团餐单 ${order.orderNo} 售后单 ${saved.reportNo}：${fullItems.length} 类商品变质/异味，食用人员 ${diners.length} 人（${dinerNames}），请客服尽快受理，可批量退款、补送或触发同批次下架`,
      type: 'INCIDENT', orderId: order.id,
    });
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '食安预警：本店供餐出现变质反馈',
      content: `团餐单 ${order.orderNo} 售后单 ${saved.reportNo} 反馈商品变质/异味（批次 ${fullItems.map(i => i.batchNo).join('、')}），请门店立即留样核查、检查同批次温控`,
      type: 'INCIDENT', orderId: order.id,
    });
    return this.detail(saved.id);
  }

  async list(user: User, query: any) {
    // 运营/客服查看时懒触发超时催办
    if ([UserRole.SERVICE, UserRole.ADMIN].includes(user.role)) {
      await this.autoRemind();
    }
    const qb = this.reportRepo.createQueryBuilder('r').orderBy('r.id', 'DESC').take(200);
    if (user.role === UserRole.ENTERPRISE) qb.where('r.enterpriseId = :eid', { eid: user.enterpriseId });
    else if (user.role === UserRole.STORE) qb.where('r.storeId = :sid', { sid: user.storeId });
    else if (user.role === UserRole.LOGISTICS) qb.where('1=0');
    if (query.status) qb.andWhere('r.status = :st', { st: query.status });
    if (query.orderId) qb.andWhere('r.orderId = :oid', { oid: +query.orderId });
    const list = await qb.getMany();
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    return list.map(r => ({ ...r, orderNo: omap.get(r.orderId)?.orderNo }));
  }

  async detail(id: number, user?: User) {
    const r = await this.reportRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('售后单不存在');
    if (user?.role === UserRole.ENTERPRISE && r.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权查看其它企业的售后单');
    }
    if (user?.role === UserRole.STORE && r.storeId !== user.storeId) {
      throw new BadRequestException('无权查看其它门店的售后单');
    }
    const order = await this.orderRepo.findOne({ where: { id: r.orderId } });
    const incident = r.incidentId ? await this.incidentRepo.findOne({ where: { id: r.incidentId } }) : null;
    const logs = r.incidentId
      ? await this.incidentLogRepo.find({ where: { incidentId: r.incidentId }, order: { id: 'ASC' } })
      : [];
    const recalls = await this.recallRepo.find({ where: { reportId: id }, order: { id: 'ASC' } });
    const recallIds = recalls.map(x => x.id);
    const tasks = recallIds.length
      ? await this.taskRepo.find({ where: { recallId: In(recallIds) }, order: { id: 'ASC' } })
      : [];
    const storeIds = Array.from(new Set(tasks.map(t => t.storeId)));
    const stores = await this.storeRepo.find({ where: { id: In(storeIds.length ? storeIds : [0]) } });
    const smap = new Map(stores.map(s => [s.id, s.name]));
    const redelivery = r.redeliveryId
      ? await this.redeliveryRepo.findOne({ where: { id: r.redeliveryId } })
      : null;
    let courierName: string = null;
    if (redelivery?.courierId) {
      courierName = (await this.userRepo.findOne({ where: { id: redelivery.courierId } }))?.name;
    }
    return {
      ...r,
      order,
      incident,
      logs,
      recalls: recalls.map(rc => ({
        ...rc,
        tasks: tasks.filter(t => t.recallId === rc.id).map(t => ({ ...t, storeName: smap.get(t.storeId) })),
      })),
      redelivery: redelivery ? { ...redelivery, courierName } : null,
    };
  }

  /** 客服受理 */
  async claim(id: number, user: User) {
    const r = await this.mustGet(id);
    r.status = 'PROCESSING';
    r.handledBy = user.id;
    await this.reportRepo.save(r);
    if (r.incidentId) {
      await this.incidentRepo.update({ id: r.incidentId }, { status: 'PROCESSING' });
      await this.incidentLog(r.incidentId, user, 'CLAIM', '客服受理变质售后，开始处置');
    }
    return this.detail(id);
  }

  /** 客服提出批量退款（按商品售价 × 倍数，默认食安 2 倍） */
  async proposeRefund(id: number, dto: any, user: User) {
    const r = await this.mustGet(id);
    const multiplier = dto.multiplier ? +dto.multiplier : r.refundMultiplier || 2;
    const base = (r.items || []).reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const amount = Math.round(base * multiplier * 100) / 100;
    r.refundAmount = amount;
    r.refundMultiplier = multiplier;
    r.refundStatus = 'PROPOSED';
    r.refundProposedBy = user.id;
    r.status = 'PROCESSING';
    await this.reportRepo.save(r);
    if (r.incidentId) await this.incidentLog(r.incidentId, user, 'COMPENSATE_PROPOSE',
      `批量退款：${r.items.reduce((s, i) => s + i.qty, 0)} 份问题餐食 × ${multiplier} 倍 = ¥${amount}，待财务确认`);
    await this.notify.send({
      role: 'FINANCE',
      title: '变质售后批量退款待确认',
      content: `售后单 ${r.reportNo} 提出批量退款 ¥${amount}（${multiplier} 倍食安赔付），请财务审核确认`,
      type: 'FINANCE', orderId: r.orderId,
    });
    return this.detail(id);
  }

  /** 财务确认退款 → 计入交付档案赔付 */
  async confirmRefund(id: number, user: User) {
    const r = await this.mustGet(id);
    if (r.refundStatus !== 'PROPOSED') throw new BadRequestException('客服尚未提出退款');
    r.refundStatus = 'CONFIRMED';
    r.refundConfirmedBy = user.id;
    r.refundConfirmedAt = new Date();
    await this.reportRepo.save(r);
    const archive = await this.archiveRepo.findOne({ where: { orderId: r.orderId } });
    if (archive) {
      archive.compensation = Math.round((Number(archive.compensation) + Number(r.refundAmount)) * 100) / 100;
      await this.archiveRepo.save(archive);
    }
    if (r.incidentId) await this.incidentLog(r.incidentId, user, 'COMPENSATE_CONFIRM',
      `财务确认批量退款 ¥${r.refundAmount}，已计入交付档案赔付`);
    await this.notify.send({
      enterpriseId: r.enterpriseId,
      title: '变质餐食退款已确认',
      content: `售后单 ${r.reportNo} 的批量退款 ¥${r.refundAmount} 已由财务确认，将按合同账期原路退回，请注意查收`,
      type: 'FINANCE', orderId: r.orderId,
    });
    return this.detail(id);
  }

  /** 客服发起补送：按问题商品同数量生成补送单 */
  async createRedelivery(id: number, dto: any, user: User) {
    const r = await this.mustGet(id);
    if (r.redeliveryId) throw new BadRequestException('该售后已生成补送单');
    const items = (dto.items?.length ? dto.items : r.items).map((i: any) => ({
      productId: i.productId, name: i.name, quantity: +i.quantity || i.qty, unitPrice: i.unitPrice,
    }));
    if (!items.length) throw new BadRequestException('补送商品为空');
    const redelivery = await this.redeliveryRepo.save(this.redeliveryRepo.create({
      redeliveryNo: this.genNo('BC'),
      reportId: r.id, orderId: r.orderId, enterpriseId: r.enterpriseId,
      storeId: r.storeId, items, status: 'PENDING',
    }));
    r.redeliveryId = redelivery.id;
    r.status = 'PROCESSING';
    await this.reportRepo.save(r);
    if (r.incidentId) await this.incidentLog(r.incidentId, user, 'COMMENT',
      `客服发起补送单 ${redelivery.redeliveryNo}：${items.map(i => `${i.name}×${i.quantity}`).join('、')}`);
    await this.notify.send({
      role: 'STORE', storeId: r.storeId,
      title: '变质餐食补送：请立即备货',
      content: `售后单 ${r.reportNo} 补送单 ${redelivery.redeliveryNo}：${items.map(i => `${i.name}×${i.quantity}`).join('、')}，请用新鲜批次优先备货，完成后在「售后任务」中通知骑手取货`,
      type: 'INCIDENT', orderId: r.orderId,
    });
    return this.detail(id);
  }

  /** 门店补送备货完成：扣减新鲜批次、指派骑手 */
  async redeliveryReady(redeliveryId: number, user: User) {
    const rd = await this.redeliveryRepo.findOne({ where: { id: redeliveryId } });
    if (!rd) throw new NotFoundException('补送单不存在');
    if (user.role === UserRole.STORE && rd.storeId !== user.storeId) throw new BadRequestException('非本店补送单');
    if (rd.status !== 'PENDING') throw new BadRequestException('补送单当前状态不可备货');

    // 新鲜批次优先（到期时间晚的优先），逐商品核验扣减
    const allocations: { batchId: number; use: number }[] = [];
    for (const it of rd.items) {
      let remain = it.quantity;
      const batches = await this.batchRepo.find({
        where: { storeId: rd.storeId, productId: it.productId, status: 'AVAILABLE' },
        order: { expiresAt: 'DESC' },
      });
      for (const b of batches) {
        if (remain <= 0) break;
        const use = Math.min(b.quantity, remain);
        if (use <= 0) continue;
        remain -= use;
        allocations.push({ batchId: b.id, use });
      }
      if (remain > 0) throw new BadRequestException(`补送商品「${it.name}」新鲜库存不足 ${remain} 份，请紧急生产或发起调拨后重试`);
    }
    for (const a of allocations) {
      const affected = await this.batchRepo.createQueryBuilder()
        .update(InventoryBatch)
        .set({ quantity: () => `quantity - ${a.use}` })
        .where('id = :id AND quantity >= :use', { id: a.batchId, use: a.use })
        .execute();
      if (!affected.affected) throw new BadRequestException('补送库存刚被占用，请重试');
      await this.batchRepo.createQueryBuilder()
        .update(InventoryBatch).set({ status: 'DEPLETED' })
        .where('id = :id AND quantity = 0', { id: a.batchId }).execute();
    }

    // 指派最闲骑手
    const couriers = await this.userRepo.find({ where: { role: UserRole.LOGISTICS, active: true } });
    let courier: User = null;
    if (couriers.length) {
      const counts = await Promise.all(couriers.map(async c => ({
        c, n: await this.deliveryRepo.createQueryBuilder('d')
          .where('d.courierId = :id', { id: c.id })
          .andWhere("d.status NOT IN ('SIGNED','DELIVERED')").getCount(),
      })));
      counts.sort((a, b) => a.n - b.n);
      courier = counts[0].c;
    }
    rd.courierId = courier?.id ?? null;
    rd.readyAt = new Date();
    rd.status = 'READY';
    await this.redeliveryRepo.save(rd);
    const report = await this.reportRepo.findOne({ where: { id: rd.reportId } });
    if (courier) {
      await this.notify.send({
        userId: courier.id,
        title: '补送任务：变质餐食补发',
        content: `补送单 ${rd.redeliveryNo}（团餐售后 ${report?.reportNo}）已备货完成，请尽快到店取货并送回企业，签收人 ${(await this.orderRepo.findOne({ where: { id: rd.orderId } }))?.contactName}`,
        type: 'INCIDENT', orderId: rd.orderId,
      });
    }
    return this.detail(rd.reportId);
  }

  /** 骑手取货 / 送达 */
  async redeliveryPickup(redeliveryId: number, user: User) {
    const rd = await this.mustRedelivery(redeliveryId, user);
    if (rd.status !== 'READY') throw new BadRequestException('补送商品尚未备货完成');
    rd.pickedAt = new Date();
    rd.status = 'PICKED';
    await this.redeliveryRepo.save(rd);
    return this.detail(rd.reportId);
  }

  async redeliveryDeliver(redeliveryId: number, dto: any, user: User) {
    const rd = await this.mustRedelivery(redeliveryId, user);
    if (rd.status !== 'PICKED') throw new BadRequestException('请先取货');
    rd.deliveredAt = new Date();
    rd.receivedBy = dto.receivedBy || '企业签收人';
    rd.status = 'DELIVERED';
    await this.redeliveryRepo.save(rd);
    const report = await this.reportRepo.findOne({ where: { id: rd.reportId } });
    if (report?.incidentId) {
      await this.incidentLog(report.incidentId, user, 'COMMENT',
        `补送单 ${rd.redeliveryNo} 已送达，签收人：${rd.receivedBy}`);
    }
    await this.notify.send({
      enterpriseId: rd.enterpriseId,
      title: '变质餐食已补送到店',
      content: `售后补送单 ${rd.redeliveryNo} 已送达，签收人 ${rd.receivedBy}，请核对补送商品`,
      type: 'INCIDENT', orderId: rd.orderId,
    });
    return this.detail(rd.reportId);
  }

  private async mustRedelivery(id: number, user: User) {
    const rd = await this.redeliveryRepo.findOne({ where: { id } });
    if (!rd) throw new NotFoundException('补送单不存在');
    if (user.role === UserRole.LOGISTICS && rd.courierId && rd.courierId !== user.id) {
      throw new BadRequestException('该补送任务未指派给您');
    }
    return rd;
  }

  /**
   * 客服触发「同批次下架」：
   * 对售后涉及的每个生产批次，扫描全部门店的同批次在架库存与未配送团餐，
   * 逐店生成下架任务（含处理截止时间、责任班次、运营复核人）。
   */
  async triggerRecall(id: number, user: User) {
    const r = await this.mustGet(id);
    if (!r.items?.some(i => i.batchId)) {
      throw new BadRequestException('售后商品缺少批次信息，无法定位同批次');
    }
    const reviewer = await this.adminReviewer();
    const now = new Date();
    const dueAt = new Date(now.getTime() + RECALL_DEADLINE_HOURS * 3600 * 1000);
    const shift = this.currentShift(now);
    const stores = await this.storeRepo.find();

    const batchGroups = new Map<number, any[]>();
    for (const it of r.items) {
      if (!it.batchId) continue;
      const list = batchGroups.get(it.batchId) || [];
      list.push(it);
      batchGroups.set(it.batchId, list);
    }
    const sourceBatches = await this.batchRepo.find({ where: { id: In(Array.from(batchGroups.keys())) } });

    const recalls: BatchRecall[] = [];
    let totalTasks = 0;
    for (const src of sourceBatches) {
      const affected: any[] = [];
      for (const store of stores) {
        // 同批次判定：同商品、同温控、生产时间相差 ≤ 90 分钟
        const same = (await this.batchRepo.find({
          where: { storeId: store.id, productId: src.productId, status: 'AVAILABLE' },
        })).filter(b =>
          b.tempZone === src.tempZone
          && Math.abs(b.producedAt.getTime() - src.producedAt.getTime()) <= BATCH_MATCH_MIN * 60000);
        const stockQty = same.reduce((s, b) => s + b.quantity, 0);

        // 该店未配送团餐中使用该商品的份数
        const undelivered: any[] = [];
        const activeOrders = await this.orderRepo.find({
          where: { storeId: store.id, status: In(UNDELIVERED_STATUSES) },
        });
        for (const o of activeOrders) {
          const plan = await this.planRepo.findOne({ where: { orderId: o.id, status: 'ACCEPTED' }, order: { version: 'DESC' } })
            || await this.planRepo.findOne({ where: { orderId: o.id }, order: { version: 'DESC' } });
          const hit = (plan?.items || []).find((i: any) => i.productId === src.productId);
          if (hit) undelivered.push({ orderId: o.id, orderNo: o.orderNo, qty: hit.quantity, deliverAt: o.deliverAt });
        }
        const undeliveredQty = undelivered.reduce((s, u) => s + u.qty, 0);
        if (stockQty > 0 || undeliveredQty > 0) {
          affected.push({ storeId: store.id, storeName: store.name, stockQty, undeliveredQty, undelivered, batchIds: same.map(b => b.id) });
        }
      }

      const product = await this.productRepo.findOne({ where: { id: src.productId } });
      const recall = await this.recallRepo.save(this.recallRepo.create({
        recallNo: this.genNo('RC'),
        productId: src.productId,
        productName: product?.name || `商品${src.productId}`,
        batchNo: src.batchNo,
        producedAt: src.producedAt,
        expiresAt: src.expiresAt,
        reportId: r.id,
        orderId: r.orderId,
        status: 'ISSUED',
        affectedStores: affected,
        totalStockQty: affected.reduce((s, a) => s + a.stockQty, 0),
        totalUndeliveredQty: affected.reduce((s, a) => s + a.undeliveredQty, 0),
        taskTotal: affected.length,
        taskDone: 0,
        reviewerId: reviewer?.id ?? null,
        reviewerName: reviewer?.name ?? '平台运营',
      }));

      // 逐店生成下架任务
      for (const a of affected) {
        await this.taskRepo.save(this.taskRepo.create({
          recallId: recall.id,
          storeId: a.storeId,
          stockQty: a.stockQty,
          undelivered: a.undelivered,
          status: 'PENDING',
          dueAt,
          responsibleShift: shift,
          reviewerId: reviewer?.id ?? null,
          reviewerName: reviewer?.name ?? '平台运营',
        }));
        totalTasks++;
        await this.notify.send({
          role: 'STORE', storeId: a.storeId,
          title: `🚨 食安下架任务：${recall.productName}（批次 ${recall.batchNo}）`,
          content: `同批次商品被反馈变质，请于 ${this.fmt(dueAt)} 前完成下架报损（在架 ${a.stockQty} 份）并拦截未配送团餐 ${a.undeliveredQty} 份。责任班次：${shift}，运营复核人：${reviewer?.name || '平台运营'}。`,
          type: 'INCIDENT', orderId: r.orderId,
        });
      }
      recalls.push(recall);
    }

    if (!recalls.length) throw new BadRequestException('未匹配到可下架的同批次库存');
    r.recallId = recalls[0].id;
    r.status = 'PROCESSING';
    await this.reportRepo.save(r);
    if (r.incidentId) {
      await this.incidentLog(r.incidentId, user, 'COMMENT',
        `触发同批次下架 ${recalls.length} 个批次，共生成 ${totalTasks} 个门店任务（截止 ${this.fmt(new Date(Date.now() + RECALL_DEADLINE_HOURS * 3600000))}，责任班次 ${shift}）`);
    }
    await this.notify.send({
      role: 'ADMIN',
      title: '同批次下架任务已下发，请跟进复核',
      content: `售后单 ${r.reportNo} 已触发同批次下架，${totalTasks} 家门店任务待处理，截止 ${RECALL_DEADLINE_HOURS} 小时，超时未处理门店将自动催办`,
      type: 'INCIDENT', orderId: r.orderId,
    });
    return this.detail(r.id);
  }

  /** 门店执行下架：批次报损 + 拦截未配送团餐登记 */
  async handleTask(taskId: number, dto: any, user: User) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('下架任务不存在');
    if (user.role === UserRole.STORE && task.storeId !== user.storeId) throw new BadRequestException('非本店任务');
    if (task.status === 'DONE') throw new BadRequestException('任务已处理');
    const recall = await this.recallRepo.findOne({ where: { id: task.recallId } });
    const affected = (recall.affectedStores as any[]).find(a => a.storeId === task.storeId);

    // 同批次在架批次执行报损下架
    const batchIds: number[] = affected?.batchIds || [];
    let disposed = 0;
    for (const bid of batchIds) {
      const b = await this.batchRepo.findOne({ where: { id: bid } });
      if (b && b.status === 'AVAILABLE') {
        disposed += b.quantity;
        b.quantity = 0;
        b.status = 'DISPOSED';
        await this.batchRepo.save(b);
      }
    }
    task.status = 'DONE';
    task.disposedQty = dto.disposedQty != null ? +dto.disposedQty : disposed;
    task.heldOrderQty = dto.heldOrderQty != null ? +dto.heldOrderQty : task.undelivered.reduce((s, u) => s + u.qty, 0);
    task.handleNote = dto.note || '同批次商品已全部下架报损，未配送团餐已拦截更换';
    task.handledBy = user.id;
    task.handledAt = new Date();
    await this.taskRepo.save(task);

    // 更新召回进度
    recall.taskDone = await this.taskRepo.count({ where: { recallId: recall.id, status: 'DONE' } });
    recall.status = recall.taskDone >= recall.taskTotal ? 'ALL_DONE' : 'PARTIAL_DONE';
    await this.recallRepo.save(recall);

    const report = await this.reportRepo.findOne({ where: { id: recall.reportId } });
    if (report?.incidentId) {
      await this.incidentLog(report.incidentId, user, 'COMMENT',
        `门店完成下架任务：报损 ${task.disposedQty} 份，拦截未配送团餐 ${task.heldOrderQty} 份（${recall.recallNo}）`);
    }
    if (recall.status === 'ALL_DONE') {
      await this.notify.send({
        role: 'ADMIN',
        title: '同批次下架任务全部完成，请复核关闭',
        content: `召回单 ${recall.recallNo}（${recall.productName} 批次 ${recall.batchNo}）${recall.taskTotal} 家门店均已处理，请运营复核`,
        type: 'INCIDENT', orderId: recall.orderId,
      });
    }
    return this.detail(recall.reportId);
  }

  /** 运营复核关闭召回单（须全部门店处理完成） */
  async reviewRecall(recallId: number, dto: any, user: User) {
    const recall = await this.recallRepo.findOne({ where: { id: recallId } });
    if (!recall) throw new NotFoundException('召回单不存在');
    if (recall.status === 'CLOSED') throw new BadRequestException('召回单已关闭');
    if (recall.taskDone < recall.taskTotal) {
      throw new BadRequestException(`仍有 ${recall.taskTotal - recall.taskDone} 家门店未处理，不可复核关闭`);
    }
    recall.status = 'CLOSED';
    recall.reviewerId = user.id;
    recall.reviewerName = user.name;
    recall.reviewNote = dto.note || '复核通过：同批次商品全部下架，未配送团餐已拦截';
    recall.reviewedAt = new Date();
    await this.recallRepo.save(recall);
    const report = await this.reportRepo.findOne({ where: { id: recall.reportId } });
    if (report?.incidentId) {
      await this.incidentLog(report.incidentId, user, 'COMMENT',
        `运营复核关闭召回单 ${recall.recallNo}：${recall.reviewNote}`);
    }
    return this.detail(recall.reportId);
  }

  /** 运营手动催办单个门店 */
  async remindTask(taskId: number, user: User) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'DONE') return { ok: true, skipped: true };
    task.remindCount += 1;
    task.remindedAt = new Date();
    await this.taskRepo.save(task);
    await this.sendRemind(task, user.name);
    return { ok: true, remindCount: task.remindCount };
  }

  /** 懒触发：对超时未处理门店自动催办（每店每 30 分钟最多一次） */
  async autoRemind() {
    const now = Date.now();
    const pending = await this.taskRepo.find({ where: { status: 'PENDING' } });
    for (const t of pending) {
      if (new Date(t.dueAt).getTime() > now) continue;
      if (t.remindedAt && now - new Date(t.remindedAt).getTime() < REMIND_INTERVAL_MIN * 60000) continue;
      t.remindCount += 1;
      t.remindedAt = new Date();
      await this.taskRepo.save(t);
      await this.sendRemind(t, '系统');
    }
  }

  private async sendRemind(task: RecallTask, operator: string) {
    const recall = await this.recallRepo.findOne({ where: { id: task.recallId } });
    const overdueMin = Math.max(0, Math.round((Date.now() - new Date(task.dueAt).getTime()) / 60000));
    await this.notify.send({
      role: 'STORE', storeId: task.storeId,
      title: '⚠ 食安下架任务超时催办',
      content: `召回单 ${recall?.recallNo}（${recall?.productName} 批次 ${recall?.batchNo}）下架任务已超过截止时间 ${overdueMin} 分钟，请${task.responsibleShift}立即处理；运营复核人 ${task.reviewerName} 已收到提醒`,
      type: 'INCIDENT', orderId: recall?.orderId,
    });
    await this.notify.send({
      role: 'ADMIN',
      title: '门店下架任务超时未处理',
      content: `召回单 ${recall?.recallNo} 有门店下架任务超时（已催办 ${task.remindCount} 次，责任班次 ${task.responsibleShift}），请运营介入`,
      type: 'INCIDENT', orderId: recall?.orderId,
    });
  }

  /** 客服办结售后（退款/补送/召回均完成后） */
  async resolve(id: number, dto: any, user: User) {
    const r = await this.mustGet(id);
    const openRecall = await this.recallRepo.createQueryBuilder('rc')
      .where('rc.reportId = :rid', { rid: id })
      .andWhere("rc.status != 'CLOSED'").getCount();
    if (openRecall > 0) throw new BadRequestException('同批次召回尚未复核关闭，请先完成门店下架与运营复核');
    r.status = 'RESOLVED';
    r.resolution = dto.note || '退款/补送/同批次下架均已完成';
    await this.reportRepo.save(r);
    if (r.incidentId) {
      await this.incidentLog(r.incidentId, user, 'RESOLVE', r.resolution);
      await this.incidentRepo.update({ id: r.incidentId }, { status: 'RESOLVED', resolution: r.resolution });
    }
    const openOthers = await this.incidentRepo.createQueryBuilder('i')
      .where('i.orderId = :oid AND i.id != :iid AND i.status IN (:...st)',
        { oid: r.orderId, iid: r.incidentId || 0, st: ['OPEN', 'PROCESSING'] }).getCount();
    if (openOthers === 0) await this.orderRepo.update({ id: r.orderId }, { hasException: false });
    await this.notify.send({
      enterpriseId: r.enterpriseId,
      title: '变质售后已办结',
      content: `售后单 ${r.reportNo} 已办结：${r.resolution}。感谢配合，平台已完成同批次排查，避免再次发生`,
      type: 'INCIDENT', orderId: r.orderId,
    });
    return this.detail(id);
  }

  /** 门店视角：本店待处理下架任务 + 待备货补送单 */
  async storeDesk(user: User) {
    if (!user.storeId) throw new BadRequestException('非门店账号');
    await this.autoRemind();
    const tasks = await this.taskRepo.find({ where: { storeId: user.storeId }, order: { dueAt: 'ASC' } });
    const recalls = await this.recallRepo.find();
    const rmap = new Map(recalls.map(r => [r.id, r]));
    const redeliveries = await this.redeliveryRepo.find({
      where: { storeId: user.storeId, status: In(['PENDING', 'READY', 'PICKED']) },
      order: { id: 'DESC' },
    });
    return {
      tasks: tasks.map(t => ({ ...t, recall: rmap.get(t.recallId) })),
      redeliveries,
    };
  }

  /** 骑手视角：待取/待送补送单 */
  async courierDesk(user: User) {
    const all = await this.redeliveryRepo.find({
      where: { status: In(['READY', 'PICKED']) }, order: { id: 'DESC' },
    });
    return all.filter(r => !r.courierId || r.courierId === user.id);
  }

  private async mustGet(id: number) {
    const r = await this.reportRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('售后单不存在');
    return r;
  }

  private async incidentLog(incidentId: number, user: User | null, action: string, note: string) {
    await this.incidentLogRepo.save(this.incidentLogRepo.create({
      incidentId,
      actorId: user?.id ?? 0,
      actorName: user?.name ?? '系统',
      actorRole: user ? (ROLE_NAMES[user.role] || user.role) : '系统',
      action, note,
    }));
  }

  private fmt(d: Date) {
    const t = new Date(d);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getMonth() + 1}-${t.getDate()} ${p(t.getHours())}:${p(t.getMinutes())}`;
  }
}
