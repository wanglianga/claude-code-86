import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive, Feedback } from '../../entities/archive.entity';
import { User, UserRole } from '../../entities/user.entity';
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
    private planService: PlanService,
    private notify: NotificationService,
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
    let courierName: string = null;
    if (delivery?.courierId) {
      const c = await this.userRepo.findOne({ where: { id: delivery.courierId } });
      courierName = c?.name;
    }
    return {
      ...order,
      enterpriseName: enterprise?.name,
      plans,
      delivery: delivery ? { ...delivery, courierName } : null,
      incidents,
      invoice,
      feedback,
      archive,
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

  /** 门店备货完成：按批次扣减库存（临期优先），生成配送任务 */
  async ready(id: number, user: User) {
    const order = await this.mustGet(id);
    this.mustStore(order, user);
    if (![OrderStatus.PREPARING, OrderStatus.CONFIRMED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('当前状态不可完成备货');
    }
    const plan = await this.planRepo.findOne({ where: { orderId: id, status: 'ACCEPTED' }, order: { version: 'DESC' } })
      || await this.planRepo.findOne({ where: { orderId: id }, order: { version: 'DESC' } });
    if (!plan) throw new BadRequestException('缺少供餐方案');

    // 扣减库存：同一商品按到期时间升序（临期优先出库）
    for (const item of plan.items as any[]) {
      let remain = item.quantity;
      const batches = await this.batchRepo.find({
        where: { storeId: order.storeId, productId: item.productId, status: 'AVAILABLE' },
        order: { expiresAt: 'ASC' },
      });
      for (const b of batches) {
        if (remain <= 0) break;
        const use = Math.min(b.quantity, remain);
        b.quantity -= use;
        remain -= use;
        if (b.quantity === 0) b.status = 'DEPLETED';
        await this.batchRepo.save(b);
      }
      if (remain > 0) {
        await this.autoIncident(order, 'STOCK_SHORTAGE', '备货时库存不足',
          `商品「${item.name}」缺口 ${remain} 份，请门店补货或发起临期调拨，客服请跟进企业沟通`);
        throw new BadRequestException(`商品「${item.name}」库存不足，缺口 ${remain} 份，已自动生成异常工单`);
      }
    }

    order.status = OrderStatus.READY;
    await this.orderRepo.save(order);

    // 生成配送任务并指派仓配（取当前任务最少者）
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
    const delivery = this.deliveryRepo.create({
      orderId: order.id,
      courierId: courier?.id ?? null,
      status: courier ? 'ASSIGNED' : 'PENDING',
    });
    await this.deliveryRepo.save(delivery);
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
    const nearExpiryUsed = (plan?.items || []).reduce((s: number, i: any) => s + (i.nearExpiryQty || 0), 0);

    const archive = this.archiveRepo.create({
      orderId: order.id,
      enterpriseId: order.enterpriseId,
      storeId: order.storeId,
      actualAmount: order.actualAmount ?? order.totalAmount,
      actualHeadcount: order.actualHeadcount ?? order.headcount,
      returnCount,
      returnAmount,
      nearExpiryUsed,
      compensation,
      onTime,
      incidentCount: incidents.length,
      invoiceErrors: 0,
      rating: 5,
      items: plan?.items || [],
      deliveredAt: delivery?.deliveredAt ?? null,
    });
    await this.archiveRepo.save(archive);

    order.status = OrderStatus.COMPLETED;
    await this.orderRepo.save(order);

    // 单结企业：自动生成待开发票
    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : null;
    if (order.invoiceRequired && contract?.settlementType !== 'MONTHLY') {
      const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
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
