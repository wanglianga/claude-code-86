import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive, Feedback } from '../../entities/archive.entity';
import { User, UserRole } from '../../entities/user.entity';
import { MealTopUp } from '../../entities/topup.entity';
import { SpoiledReport } from '../../entities/spoiled.entity';
import { NearExpiryOffer } from '../../entities/near-expiry.entity';
import { PlanService } from './plan.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentLog) private incidentLogRepo: Repository<IncidentLog>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    @InjectRepository(Feedback) private feedbackRepo: Repository<Feedback>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(MealTopUp) private topUpRepo: Repository<MealTopUp>,
    @InjectRepository(SpoiledReport) private spoiledRepo: Repository<SpoiledReport>,
    @InjectRepository(NearExpiryOffer) private offerRepo: Repository<NearExpiryOffer>,
    private planService: PlanService,
    private notify: NotificationService,
    private dataSource: DataSource,
  ) {}

  private genOrderNo() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `TM${ymd}${String(Math.floor(Math.random() * 90000) + 10000)}`;
  }

  /** 企业行政提交团餐需求，自动生成供餐方案 */
  async create(dto: any, user: User) {
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: user.enterpriseId } });
    if (!enterprise) throw new BadRequestException('当前账号未绑定企业');
    const contract = await this.contractRepo.findOne({
      where: { enterpriseId: enterprise.id, status: 'ACTIVE' },
    });
    const order = this.orderRepo.create({
      orderNo: this.genOrderNo(),
      enterpriseId: enterprise.id,
      contractId: contract?.id ?? null,
      occasion: dto.occasion,
      headcount: +dto.headcount,
      mealBudget: +dto.mealBudget,
      vegetarianCount: +dto.vegetarianCount || 0,
      allergies: dto.allergies || [],
      deliverAt: new Date(dto.deliverAt),
      address: dto.address || enterprise.address,
      contactName: dto.contactName || enterprise.contactName,
      contactPhone: dto.contactPhone || enterprise.contactPhone,
      backupContactName: dto.backupContactName ?? enterprise.backupContactName,
      backupContactPhone: dto.backupContactPhone ?? enterprise.backupContactPhone,
      invoiceRequired: !!dto.invoiceRequired,
      invoiceTitle: dto.invoiceTitle ?? enterprise.invoiceTitle,
      taxNo: dto.taxNo ?? enterprise.taxNo,
      remark: dto.remark,
      status: OrderStatus.PLANNING,
      createdBy: user.id,
    });
    const saved = await this.orderRepo.save(order);

    const result = await this.planService.persistPlan(saved);
    if (result.ok) {
      saved.storeId = result.plan.storeId;
      saved.totalAmount = result.plan.totalPrice;
      saved.status = OrderStatus.PENDING_CONFIRM;
      await this.orderRepo.save(saved);
      await this.notify.send({
        role: 'STORE', storeId: result.plan.storeId,
        title: '新团餐订单待备货',
        content: `团餐单 ${saved.orderNo}（${saved.headcount} 人）方案已生成，待企业确认后请安排备货`,
        type: 'ORDER', orderId: saved.id,
      });
    } else {
      // 库存/产能不足：自动创建异常工单，客服介入协调
      await this.autoIncident(saved, 'STOCK_SHORTAGE', '附近门店库存或产能不足',
        `系统未能为团餐单 ${saved.orderNo} 生成可行方案：${result.reason}。请客服协调门店补货、调拨或与企业协商调整送达时间/人数。`);
    }
    return this.detail(saved.id);
  }

  /** 方案预览（不下单） */
  async preview(dto: any, user: User) {
    const tmp: MealOrder = {
      ...dto,
      enterpriseId: user.enterpriseId,
      headcount: +dto.headcount,
      mealBudget: +dto.mealBudget,
      vegetarianCount: +dto.vegetarianCount || 0,
      allergies: dto.allergies || [],
      deliverAt: new Date(dto.deliverAt),
    } as MealOrder;
    return this.planService.generate(tmp);
  }

  async list(user: User, query: any) {
    const qb = this.orderRepo.createQueryBuilder('o').orderBy('o.createdAt', 'DESC').take(200);
    if (user.role === UserRole.ENTERPRISE) qb.where('o.enterpriseId = :eid', { eid: user.enterpriseId });
    else if (user.role === UserRole.STORE) qb.where('o.storeId = :sid', { sid: user.storeId });
    if (query.status) qb.andWhere('o.status = :st', { st: query.status });
    if (query.exception === '1') qb.andWhere('o.hasException = true');
    const orders = await qb.getMany();
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    return orders.map(o => ({ ...o, enterpriseName: emap.get(o.enterpriseId) }));
  }

  async detail(id: number) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('团餐单不存在');
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
    const plans = await this.planRepo.find({ where: { orderId: id }, order: { version: 'DESC' } });
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: id } });
    const incidents = await this.incidentRepo.find({ where: { orderId: id }, order: { id: 'DESC' } });
    const invoice = await this.invoiceRepo.findOne({ where: { orderId: id } });
    const feedback = await this.feedbackRepo.find({ where: { orderId: id } });
    const archive = await this.archiveRepo.findOne({ where: { orderId: id } });
    const topUps = await this.topUpRepo.find({ where: { orderId: id }, order: { id: 'DESC' } });
    const spoiledReports = await this.spoiledRepo.find({ where: { orderId: id }, order: { id: 'DESC' } });
    const nearExpiryOffers = await this.offerRepo.find({ where: { orderId: id }, order: { id: 'DESC' } });
    let courierName: string = null;
    let extraCourierName: string = null;
    if (delivery?.courierId) {
      const c = await this.userRepo.findOne({ where: { id: delivery.courierId } });
      courierName = c?.name;
    }
    if (delivery?.extraCourierId) {
      const c = await this.userRepo.findOne({ where: { id: delivery.extraCourierId } });
      extraCourierName = c?.name;
    }
    return {
      ...order,
      enterpriseName: enterprise?.name,
      plans,
      delivery: delivery ? { ...delivery, courierName, extraCourierName } : null,
      incidents,
      invoice,
      feedback,
      archive,
      topUps: topUps.filter(t => t.status !== 'CANCELLED'),
      spoiledReports,
      nearExpiryOffers,
    };
  }

  /** 企业确认方案 */
  async confirm(id: number, user: User) {
    const order = await this.mustGet(id);
    this.mustOwn(order, user);
    if (order.status !== OrderStatus.PENDING_CONFIRM) throw new BadRequestException('当前状态不可确认');
    const plan = await this.planRepo.findOne({ where: { orderId: id, status: 'PROPOSED' }, order: { version: 'DESC' } });
    if (!plan) throw new BadRequestException('没有待确认的方案');
    plan.status = 'ACCEPTED';
    await this.planRepo.save(plan);
    order.status = OrderStatus.CONFIRMED;
    await this.orderRepo.save(order);
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '团餐订单已确认，请备货',
      content: `团餐单 ${order.orderNo}（${order.headcount} 人，${this.fmtTime(order.deliverAt)} 送达）企业已确认方案，请开始备货`,
      type: 'ORDER', orderId: order.id,
    });
    return this.detail(id);
  }

  /** 企业对方案不满意 → 换店重算 */
  async replan(id: number, user: User) {
    const order = await this.mustGet(id);
    this.mustOwn(order, user);
    if (![OrderStatus.PENDING_CONFIRM, OrderStatus.PLANNING].includes(order.status as OrderStatus)) {
      throw new BadRequestException('当前状态不可重新生成方案');
    }
    const oldPlans = await this.planRepo.find({ where: { orderId: id } });
    const exclude = oldPlans.map(p => p.storeId);
    for (const p of oldPlans) { p.status = 'REJECTED'; await this.planRepo.save(p); }
    const result = await this.planService.persistPlan(order, exclude);
    if (!result.ok) {
      // 没有其它门店可选：恢复最新方案为待确认
      if (oldPlans.length) {
        const latest = oldPlans.sort((a, b) => b.version - a.version)[0];
        latest.status = 'PROPOSED';
        await this.planRepo.save(latest);
      }
      throw new BadRequestException(result.reason || '暂无其它门店可承接，请调整送达时间或人数');
    }
    order.storeId = result.plan.storeId;
    order.totalAmount = result.plan.totalPrice;
    order.status = OrderStatus.PENDING_CONFIRM;
    await this.orderRepo.save(order);
    return this.detail(id);
  }

  async cancel(id: number, user: User) {
    const order = await this.mustGet(id);
    if (user.role === UserRole.ENTERPRISE) this.mustOwn(order, user);
    if ([OrderStatus.SIGNED, OrderStatus.COMPLETED, OrderStatus.DELIVERED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('订单已送达，不可取消');
    }
    order.status = OrderStatus.CANCELLED;
    await this.orderRepo.save(order);
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '团餐订单已取消',
      content: `团餐单 ${order.orderNo} 已取消，请停止备货`,
      type: 'ORDER', orderId: order.id,
    });
    return this.detail(id);
  }

  /** 人数临时增减（企业行政/客服均可发起），联动调整金额 */
  async adjust(id: number, dto: any, user: User) {
    const order = await this.mustGet(id);
    if ([OrderStatus.SIGNED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('订单已完结，不可调整');
    }
    const newCount = +dto.headcount;
    if (!newCount || newCount <= 0) throw new BadRequestException('人数不合法');
    const old = order.headcount;
    const ratio = newCount / old;
    order.headcount = newCount;
    order.totalAmount = Math.round(Number(order.totalAmount) * ratio * 100) / 100;
    // 同步缩放方案明细
    const plan = await this.planRepo.findOne({ where: { orderId: id }, order: { version: 'DESC' } });
    if (plan) {
      plan.items = plan.items.map((it: any) => ({ ...it, quantity: Math.max(1, Math.round(it.quantity * ratio)) }));
      plan.totalPrice = order.totalAmount;
      await this.planRepo.save(plan);
    }
    await this.orderRepo.save(order);
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '团餐人数变更',
      content: `团餐单 ${order.orderNo} 人数由 ${old} 调整为 ${newCount}，请门店相应调整备货量`,
      type: 'ORDER', orderId: order.id,
    });
    return this.detail(id);
  }

  /** 门店开始备货 */
  async prepare(id: number, user: User) {
    const order = await this.mustGet(id);
    this.mustStore(order, user);
    if (order.status !== OrderStatus.CONFIRMED) throw new BadRequestException('订单未确认或已在备货中');
    order.status = OrderStatus.PREPARING;
    await this.orderRepo.save(order);
    return this.detail(id);
  }

  /**
   * 门店备货完成（两阶段，保证库存与订单状态一致）：
   * 阶段一：在同一库存快照上核验全部方案明细（纯内存试算，不落库）；
   *         任一商品不足 → 订单与所有批次数量保持不变，仅建立缺货协同工单并通知门店/客服。
   * 阶段二：全部满足 → 在一个事务里一次扣减完整批次、回写实际临期使用量、
   *         推进订单为待取货并生成配送任务；任一写入失败整体回滚。
   */
  async ready(id: number, user: User) {
    const order = await this.mustGet(id);
    this.mustStore(order, user);
    if (![OrderStatus.PREPARING, OrderStatus.CONFIRMED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('当前状态不可完成备货');
    }
    const plan = await this.planRepo.findOne({ where: { orderId: id, status: 'ACCEPTED' }, order: { version: 'DESC' } })
      || await this.planRepo.findOne({ where: { orderId: id }, order: { version: 'DESC' } });
    if (!plan) throw new BadRequestException('缺少供餐方案');

    // ===== 阶段一：库存快照核验（与方案引擎同一口径：送达时仍在保质期内） =====
    const deliverAt = new Date(order.deliverAt);
    const usableAfter = new Date(deliverAt.getTime() - 30 * 60 * 1000); // 送达前 30 分钟缓冲
    const nearLimit = deliverAt.getTime() + 6 * 3600 * 1000;            // 临期口径：送达后 6 小时内到期
    const productIds = (plan.items as any[]).map((i) => i.productId);
    const batches = await this.batchRepo.find({
      where: { storeId: order.storeId, productId: In(productIds), status: 'AVAILABLE' },
      order: { expiresAt: 'ASC' }, // 临期优先出库
    });
    // 快照池：productId -> 批次队列（仅纳入送达时可用的批次）
    const pools = new Map<number, { id: number; left: number; nearExpiry: boolean }[]>();
    for (const b of batches) {
      if (b.expiresAt <= usableAfter) continue; // 送达时已过期，不可用于本单
      const list = pools.get(b.productId) || [];
      list.push({ id: b.id, left: b.quantity, nearExpiry: b.expiresAt.getTime() <= nearLimit });
      pools.set(b.productId, list);
    }
    // 已确认临期调拨折扣方案：批次在企业确认时已预扣，备货时跳过对应份数（避免二次扣库存）
    const confirmedOffers = await this.offerRepo.find({ where: { orderId: id, status: 'CONFIRMED' } });
    const coveredByProduct = new Map<number, number>();
    for (const off of confirmedOffers) {
      for (const it of off.items || []) {
        coveredByProduct.set(it.productId, (coveredByProduct.get(it.productId) || 0) + it.quantity);
      }
    }

    const shortages: { name: string; lack: number }[] = [];
    const allocations: { batchId: number; use: number }[] = [];
    const nearUsedByProduct = new Map<number, number>();
    for (const item of plan.items as any[]) {
      // 临期方案已预扣份数直接计入临期消化，仅对剩余份数核验正常批次
      const covered = coveredByProduct.get(item.productId) || 0;
      let remain = item.quantity - covered;
      let nearUsed = covered;
      for (const p of pools.get(item.productId) || []) {
        if (remain <= 0) break;
        const use = Math.min(p.left, remain);
        if (use <= 0) continue;
        p.left -= use;
        remain -= use;
        allocations.push({ batchId: p.id, use });
        if (p.nearExpiry) nearUsed += use;
      }
      nearUsedByProduct.set(item.productId, nearUsed);
      if (remain > 0) shortages.push({ name: item.name, lack: remain });
    }

    // ===== 任一商品不足：不改订单、不改任何批次，仅建立缺货协同并通知 =====
    if (shortages.length > 0) {
      const desc = shortages.map((s) => `「${s.name}」缺口 ${s.lack} 份`).join('、');
      await this.shortageIncident(order,
        `备货核验未通过：${desc}。本次未扣减任何库存，请门店补货或发起临期调拨后重试备货，客服请跟进企业协调。`);
      throw new BadRequestException(`库存不足：${desc}。已生成缺货协同工单，本次未扣减任何库存`);
    }

    // ===== 阶段二：全部满足 → 单事务一次落库 =====
    // 已确认加餐可能已指定加派骑手；主骑手须避开加派骑手，保证加派的是另一个人
    const confirmedTopUps = await this.topUpRepo.find({
      where: { orderId: order.id, status: In(['CONFIRMED', 'LABELLED']) },
    });
    const extraCourierIds = confirmedTopUps.map(t => t.extraCourierId).filter(Boolean);
    const couriers = await this.userRepo.find({ where: { role: UserRole.LOGISTICS, active: true } });
    let courier: User = null;
    const mainCouriers = couriers.filter(c => !extraCourierIds.includes(c.id));
    if (mainCouriers.length) {
      const counts = await Promise.all(mainCouriers.map(async (c) => ({
        c, n: await this.deliveryRepo.createQueryBuilder('d')
          .where('d.courierId = :id', { id: c.id })
          .andWhere("d.status NOT IN ('SIGNED','DELIVERED')").getCount(),
      })));
      counts.sort((a, b) => a.n - b.n);
      courier = counts[0].c;
    }

    // 回写方案的实际临期使用量（与真实出库批次一致，供归档核对）
    plan.items = (plan.items as any[]).map((it) => ({
      ...it,
      nearExpiryQty: nearUsedByProduct.get(it.productId) || 0,
    }));

    await this.dataSource.transaction(async (em) => {
      for (const a of allocations) {
        // 事务内二次校验，防止并发下快照失效；不足则抛错整体回滚
        const affected = await em.createQueryBuilder()
          .update(InventoryBatch)
          .set({ quantity: () => `quantity - ${a.use}` })
          .where('id = :id AND quantity >= :use', { id: a.batchId, use: a.use })
          .execute();
        if (!affected.affected) {
          throw new BadRequestException('库存刚刚被其它业务占用，请重试备货');
        }
        await em.createQueryBuilder()
          .update(InventoryBatch)
          .set({ status: 'DEPLETED' })
          .where('id = :id AND quantity = 0', { id: a.batchId })
          .execute();
      }
      await em.save(plan);
      // 已确认临期折扣方案随本次备货履约（批次库存确认时已预扣）
      if (confirmedOffers.length) {
        for (const off of confirmedOffers) {
          off.status = 'FULFILLED';
          off.fulfilledAt = new Date();
          await em.save(off);
        }
      }
      order.status = OrderStatus.READY;
      await em.save(order);

      // 备货前确认的临时加餐：特殊餐标/追加份数/加派信息随配送单一并下发给配送员
      const topUps = await em.find(MealTopUp, {
        where: { orderId: order.id, status: In(['CONFIRMED', 'LABELLED']) },
      });
      const extraLabels = topUps.flatMap(t =>
        (t.specialDietRoster || []).map((l: any) => ({ ...l, source: 'TOPUP', topUpNo: t.topUpNo })));
      const topUpQty = topUps.reduce((s, t) => s + t.addHeadcount, 0);
      const extraDispatch = topUps.some(t => t.extraCourierRequired);
      await em.save(em.create(Delivery, {
        orderId: order.id,
        courierId: courier?.id ?? null,
        status: courier ? 'ASSIGNED' : 'PENDING',
        specialLabels: extraLabels,
        topUpQty,
        extraDispatch,
        extraCourierId: extraDispatch ? (topUps.find(t => t.extraCourierId)?.extraCourierId ?? null) : null,
      }));
    });

    // 备货成功：此前的缺货协同工单自动办结，保持工单结论与库存一致
    await this.resolveShortageIncident(order);

    if (courier) {
      await this.notify.send({
        userId: courier.id,
        title: '新配送任务',
        content: `团餐单 ${order.orderNo} 已备货完成，请前往门店取货，${this.fmtTime(order.deliverAt)} 前送达`,
        type: 'ORDER', orderId: order.id,
      });
    }
    return this.detail(id);
  }

  /** 缺货协同：有未结缺货工单则更新，否则新建；并通知门店与客服 */
  private async shortageIncident(order: MealOrder, description: string) {
    const open = await this.incidentRepo.findOne({
      where: { orderId: order.id, type: 'STOCK_SHORTAGE', status: In(['OPEN', 'PROCESSING']) },
    });
    if (open) {
      open.description = description;
      await this.incidentRepo.save(open);
      await this.incidentLogRepo.save(this.incidentLogRepo.create({
        incidentId: open.id, actorId: 0, actorName: '系统', actorRole: '系统',
        action: 'COMMENT', note: `备货再次核验仍未通过：${description}`,
      }));
    } else {
      await this.autoIncident(order, 'STOCK_SHORTAGE', '备货库存不足', description);
    }
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '备货缺货，请补货或调拨',
      content: `团餐单 ${order.orderNo} ${description}`,
      type: 'INVENTORY', orderId: order.id,
    });
  }

  /** 备货成功后自动办结缺货工单，保证工单结论与库存事实一致 */
  private async resolveShortageIncident(order: MealOrder) {
    const open = await this.incidentRepo.findOne({
      where: { orderId: order.id, type: 'STOCK_SHORTAGE', status: In(['OPEN', 'PROCESSING']) },
    });
    if (!open) return;
    open.status = 'RESOLVED';
    open.resolution = '补货/调拨后备货成功：已一次性扣减完整批次并生成配送任务';
    await this.incidentRepo.save(open);
    await this.incidentLogRepo.save(this.incidentLogRepo.create({
      incidentId: open.id, actorId: 0, actorName: '系统', actorRole: '系统',
      action: 'RESOLVE', note: open.resolution,
    }));
    const remaining = await this.incidentRepo.createQueryBuilder('i')
      .where('i.orderId = :oid AND i.id != :id AND i.status IN (:...st)',
        { oid: order.id, id: open.id, st: ['OPEN', 'PROCESSING'] })
      .getCount();
    if (remaining === 0) {
      await this.orderRepo.update({ id: order.id }, { hasException: false });
    }
  }

  /** 企业签收：记录实际人数、退货，归档 */
  async sign(id: number, dto: any, user: User) {
    const order = await this.mustGet(id);
    this.mustOwn(order, user);
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('订单尚未送达');
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: id } });
    const actualHeadcount = +dto.actualHeadcount || order.headcount;
    const returnCount = +dto.returnCount || 0;
    const returnAmount = Math.round((returnCount * Number(order.mealBudget)) * 100) / 100;
    const actualAmount = Math.round((Number(order.totalAmount) - returnAmount) * 100) / 100;

    order.status = OrderStatus.SIGNED;
    order.actualHeadcount = actualHeadcount;
    order.actualAmount = actualAmount;
    await this.orderRepo.save(order);

    delivery.status = 'SIGNED';
    delivery.signedAt = new Date();
    delivery.signerName = dto.signerName || user.name;
    delivery.signNote = dto.signNote || null;
    await this.deliveryRepo.save(delivery);

    await this.archiveOrder(order, delivery, returnCount, returnAmount);
    return this.detail(id);
  }

  /** 归档：实际消费/退货/临期调拨/赔付/发票 进入交付档案 */
  private async archiveOrder(order: MealOrder, delivery: Delivery, returnCount: number, returnAmount: number) {
    const plan = await this.planRepo.findOne({ where: { orderId: order.id }, order: { version: 'DESC' } });
    const incidents = await this.incidentRepo.find({ where: { orderId: order.id } });
    const compensation = incidents.reduce((s, i) => s + Number(i.compensation || 0), 0);
    const onTime = delivery?.deliveredAt
      ? delivery.deliveredAt.getTime() <= new Date(order.deliverAt).getTime() + 15 * 60 * 1000
      : true;

    // 合并已确认临时加餐明细（追加商品、临期使用量）进入交付档案
    const topUps = await this.topUpRepo.find({
      where: { orderId: order.id, status: In(['CONFIRMED', 'LABELLED', 'FULFILLED']) },
    });
    const archiveItems = [...(plan?.items || [])];
    for (const t of topUps) {
      for (const it of t.items || []) {
        archiveItems.push({ ...it, fromTopUp: true, topUpNo: t.topUpNo });
      }
    }
    const nearExpiryUsed = archiveItems.reduce((s: number, i: any) => s + (i.nearExpiryQty || 0), 0);

    // 企业已确认的临期调拨折扣方案（进入交付档案 + 后续月结附件/售后说明）
    const offers = await this.offerRepo.find({
      where: { orderId: order.id, status: In(['CONFIRMED', 'FULFILLED']) },
    });
    const nearExpiryDiscountAmount = Math.round(
      offers.reduce((s, o) => s + Number(o.savingAmount || 0), 0) * 100) / 100;
    const offerSummary = offers.map(o => ({
      offerNo: o.offerNo,
      totalQuantity: o.totalQuantity,
      originalAmount: Number(o.originalAmount),
      finalAmount: Number(o.finalAmount),
      savingAmount: Number(o.savingAmount),
      discountReason: o.discountReason,
      afterSalesRules: o.afterSalesRules,
      confirmedByName: o.confirmedByName,
      confirmedAt: o.confirmedAt,
      portionCount: (o.portions || []).length,
    }));

    const archive = this.archiveRepo.create({
      orderId: order.id,
      enterpriseId: order.enterpriseId,
      storeId: order.storeId,
      actualAmount: order.actualAmount ?? order.totalAmount,
      actualHeadcount: order.actualHeadcount ?? order.headcount,
      returnCount,
      returnAmount,
      nearExpiryUsed,
      nearExpiryOfferCount: offers.length,
      nearExpiryDiscountAmount,
      compensation,
      onTime,
      incidentCount: incidents.length,
      invoiceErrors: 0,
      rating: 5,
      items: archiveItems,
      deliveredAt: delivery?.deliveredAt ?? null,
    });
    await this.archiveRepo.save(archive);

    order.status = OrderStatus.COMPLETED;
    await this.orderRepo.save(order);

    // 单结企业：自动生成待开发票（加餐差额发票已在加餐确认时生成/累加，不重复开具）
    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : null;
    if (order.invoiceRequired && contract?.settlementType !== 'MONTHLY') {
      const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
      const existing = await this.invoiceRepo.findOne({
        where: { orderId: order.id },
        order: { id: 'DESC' },
      });
      if (!existing) {
        await this.invoiceRepo.save(this.invoiceRepo.create({
          invoiceNo: `INV${Date.now()}`,
          enterpriseId: order.enterpriseId,
          orderId: order.id,
          title: order.invoiceTitle || enterprise?.invoiceTitle || enterprise?.name,
          taxNo: order.taxNo || enterprise?.taxNo || '',
          amount: order.actualAmount ?? order.totalAmount,
          status: 'PENDING',
        }));
        await this.notify.send({
          role: 'FINANCE',
          title: '待开发票',
          content: `团餐单 ${order.orderNo} 已签收归档，企业申请开发票，请及时处理`,
          type: 'FINANCE', orderId: order.id,
        });
      } else if (existing.status === 'PENDING') {
        // 加餐已更新过金额，签收后以实际金额兜底校准
        existing.amount = order.actualAmount ?? order.totalAmount;
        existing.kind = existing.kind || 'FULL';
        await this.invoiceRepo.save(existing);
      }
    }
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '团餐已交付归档',
      content: `团餐单 ${order.orderNo} 已完成交付并归档，欢迎对员工用餐体验进行评价`,
      type: 'ORDER', orderId: order.id,
    });
  }

  /** 员工用餐反馈（变质反馈自动生成高优先级工单） */
  async feedback(id: number, dto: any, user: User) {
    const order = await this.mustGet(id);
    this.mustOwn(order, user);
    const fb = this.feedbackRepo.create({
      orderId: id,
      rating: +dto.rating || 5,
      comment: dto.comment || null,
      spoiled: !!dto.spoiled,
      createdBy: user.id,
    });
    await this.feedbackRepo.save(fb);
    const archive = await this.archiveRepo.findOne({ where: { orderId: id } });
    if (archive) {
      const all = await this.feedbackRepo.find({ where: { orderId: id } });
      archive.rating = Math.round((all.reduce((s, f) => s + f.rating, 0) / all.length) * 10) / 10;
      await this.archiveRepo.save(archive);
    }
    if (fb.spoiled) {
      await this.autoIncident(order, 'SPOILED', '员工反馈餐食变质',
        `企业行政反馈团餐单 ${order.orderNo} 存在餐食变质问题：${dto.comment || '未填写说明'}。请客服立即跟进，门店核查同批次鲜食，财务预备赔付。`, 'URGENT');
    }
    return this.detail(id);
  }

  /** 自动创建异常工单并联动通知 */
  private async autoIncident(order: MealOrder, type: string, title: string, description: string, priority = 'HIGH') {
    const incident = this.incidentRepo.create({
      ticketNo: `GD${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
      orderId: order.id,
      type,
      title,
      description,
      status: 'OPEN',
      priority,
      createdBy: null,
      createdByRole: 'SYSTEM',
    });
    await this.incidentRepo.save(incident);
    order.hasException = true;
    await this.orderRepo.save(order);
    await this.notify.send({
      role: 'SERVICE',
      title: `异常工单：${title}`,
      content: `团餐单 ${order.orderNo} 触发异常「${title}」，请客服牵头处理`,
      type: 'INCIDENT', orderId: order.id,
    });
    return incident;
  }

  async mustGet(id: number) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('团餐单不存在');
    return order;
  }

  private mustOwn(order: MealOrder, user: User) {
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权操作其它企业的订单');
    }
  }

  private mustStore(order: MealOrder, user: User) {
    if (user.role === UserRole.STORE && order.storeId !== user.storeId) {
      throw new BadRequestException('该订单未分配到贵店');
    }
  }

  private fmtTime(d: Date) {
    const t = new Date(d);
    return `${t.getMonth() + 1}-${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }
}
