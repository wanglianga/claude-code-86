import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MealTopUp } from '../../entities/topup.entity';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Invoice } from '../../entities/finance.entity';
import { Product } from '../../entities/product.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { User, UserRole } from '../../entities/user.entity';
import { Contract } from '../../entities/enterprise.entity';
import { PlanService } from '../order/plan.service';
import { NotificationService } from '../notification/notification.service';

/** 送达前 60 分钟为临时加餐截止线 */
const TOPUP_DEADLINE_MIN = 60;
/** 周边门店承接时加急协同顺延分钟数 */
const NEARBY_DELAY_MIN = 15;
/** 加派骑手服务费 */
const EXTRA_DISPATCH_FEE = 15;

@Injectable()
export class TopUpService {
  constructor(
    @InjectRepository(MealTopUp) private repo: Repository<MealTopUp>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private planService: PlanService,
    private notify: NotificationService,
    private dataSource: DataSource,
  ) {}

  private genNo() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `TC${ymd}${Math.floor(10000 + Math.random() * 89999)}`;
  }

  /** 校验：归属、状态、送达前一小时窗口 */
  private async mustOrder(id: number, user: User) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权为其它企业的订单加餐');
    }
    if (![OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY].includes(order.status as OrderStatus)) {
      throw new BadRequestException('仅已确认/备货中/待取货阶段可临时加餐，配送开始后无法追加');
    }
    const mins = (new Date(order.deliverAt).getTime() - Date.now()) / 60000;
    if (mins < TOPUP_DEADLINE_MIN) {
      throw new BadRequestException(`距送达不足 ${TOPUP_DEADLINE_MIN} 分钟（剩余 ${Math.round(mins)} 分钟），已超过临时加餐截止线，请联系客服走应急流程`);
    }
    return order;
  }

  private normalize(dto: any) {
    const addHeadcount = Math.round(+dto.addHeadcount || 0);
    const addVegetarianCount = Math.min(Math.round(+dto.addVegetarianCount || 0), addHeadcount);
    if (addHeadcount <= 0) throw new BadRequestException('追加份数必须大于 0');
    if (addHeadcount > 200) throw new BadRequestException('单次临时加餐不超过 200 份');
    const addAllergies: string[] = (dto.addAllergies || []).filter(Boolean);
    const roster: any[] = (dto.roster || []).filter((r: any) => r && r.name && r.tag);
    return { addHeadcount, addVegetarianCount, addAllergies, roster };
  }

  /**
   * 第一步：核查（不落库、不扣库存）。
   * 平台检查周边门店库存、制作批次、门店产能、配送容量、发票金额。
   */
  async check(orderId: number, dto: any, user: User) {
    const order = await this.mustOrder(orderId, user);
    const norm = this.normalize(dto);
    const result = await this.planService.evaluateTopUp(order, norm);

    // 送达时间结论：周边门店承接需加急协同，顺延 15 分钟
    const newDeliverAt = result.ok && !result.useOriginStore
      ? new Date(new Date(order.deliverAt).getTime() + NEARBY_DELAY_MIN * 60000)
      : new Date(order.deliverAt);

    // 复用最近一条未确认的核查单，否则新建
    let topUp = await this.repo.findOne({
      where: { orderId, status: 'CHECKED' },
      order: { id: 'DESC' },
    });
    if (!topUp) {
      topUp = this.repo.create({
        topUpNo: this.genNo(), orderId, enterpriseId: order.enterpriseId,
        storeId: result.storeId || order.storeId,
        originDeliverAt: order.deliverAt, createdBy: user.id,
      });
    }
    Object.assign(topUp, {
      storeId: result.storeId || order.storeId,
      addHeadcount: norm.addHeadcount,
      addVegetarianCount: norm.addVegetarianCount,
      addAllergies: norm.addAllergies,
      specialDietRoster: norm.roster,
      items: result.items,
      batchAllocations: result.allocations,
      addAmount: result.addAmount,
      addDeliveryFee: result.deliveryCapacity.fee,
      totalDiff: result.totalDiff,
      invoiceAmountBefore: result.invoiceBefore,
      invoiceAmountAfter: result.invoiceAfter,
      newDeliverAt,
      checks: result.checks,
      deliveryCapacity: result.deliveryCapacity,
      extraCourierRequired: result.deliveryCapacity.extraDispatch,
      vegLabelCount: result.labels.vegetarian,
      allergyLabelCount: result.labels.allergy,
      status: 'CHECKED',
    });
    topUp = await this.repo.save(topUp);
    return { topUpId: topUp.id, topUpNo: topUp.topUpNo, newDeliverAt, ...result };
  }

  /**
   * 第二步：企业确认加餐（一个事务）：
   *  事务内二次校验并扣减批次库存 → 追加商品并入供餐方案 →
   *  订单人数/忌口/金额/送达时间同步更新 → 配送容量与特殊餐标同步 →
   *  生成/更新差额发票 → 门店拣货清单与贴标任务、配送员、企业签收人通知。
   */
  async confirm(topUpId: number, user: User) {
    const topUp = await this.repo.findOne({ where: { id: topUpId } });
    if (!topUp) throw new NotFoundException('加餐核查单不存在');
    if (topUp.status !== 'CHECKED') throw new BadRequestException('该加餐单已确认或已取消');
    const order = await this.orderRepo.findOne({ where: { id: topUp.orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权确认其它企业的加餐');
    }
    const mins = (new Date(order.deliverAt).getTime() - Date.now()) / 60000;
    if (mins < TOPUP_DEADLINE_MIN) throw new BadRequestException('已超过临时加餐截止线，请联系客服走应急流程');
    if (!topUp.items?.length) throw new BadRequestException('核查未通过，无可追加商品');

    const plan = await this.planRepo.findOne({ where: { orderId: order.id }, order: { version: 'DESC' } });
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: order.id } });

    // 为特殊餐名单分配具体餐品并生成标签编码
    const labels = this.buildLabels(topUp, plan?.items?.concat(topUp.items) || topUp.items);

    // 加派骑手（原保温箱容量不足时，选当前最闲的在职骑手，且不与原骑手重复）
    let extraCourier: User = null;
    if (topUp.extraCourierRequired) {
      const busy = delivery?.courierId ? [delivery.courierId] : [];
      const couriers = await this.userRepo.find({ where: { role: UserRole.LOGISTICS, active: true } });
      const avail = couriers.filter(c => !busy.includes(c.id));
      if (avail.length) {
        const counts = await Promise.all(avail.map(async c => ({
          c, n: await this.deliveryRepo.createQueryBuilder('d')
            .where('d.courierId = :id', { id: c.id })
            .andWhere("d.status NOT IN ('SIGNED','DELIVERED')").getCount(),
        })));
        counts.sort((a, b) => a.n - b.n);
        extraCourier = counts[0].c;
      }
    }

    await this.dataSource.transaction(async (em) => {
      // 1) 事务内二次校验并扣减批次（临期优先，与备货同一口径）
      for (const a of topUp.batchAllocations) {
        const affected = await em.createQueryBuilder()
          .update(InventoryBatch)
          .set({ quantity: () => `quantity - ${a.quantity}` })
          .where('id = :id AND quantity >= :qty', { id: a.batchId, qty: a.quantity })
          .execute();
        if (!affected.affected) {
          throw new BadRequestException('追加餐食库存刚被占用，请重新核查后再确认');
        }
        await em.createQueryBuilder()
          .update(InventoryBatch)
          .set({ status: 'DEPLETED' })
          .where('id = :id AND quantity = 0', { id: a.batchId })
          .execute();
      }

      // 2) 追加商品保留在加餐单中（拣货清单/订单详情按读取层合并展示），
      //    不并入基础方案：批次已在上一步独立扣减，并入会导致门店备货二次扣库存。
      //    在方案依据中追加一条加餐记录便于归档核对。
      if (plan) {
        plan.reasons = [
          ...plan.reasons,
          `临时加餐 ${topUp.addHeadcount} 份（素食 ${topUp.addVegetarianCount}，含特殊餐标 ${labels.length} 枚）已确认，追加餐费 ¥${topUp.addAmount}${topUp.addDeliveryFee ? `、加派费 ¥${topUp.addDeliveryFee}` : ''}，明细见加餐单 ${topUp.topUpNo}`,
        ];
        await em.save(plan);
      }

      // 3) 订单：人数、素食、忌口并集、金额、送达时间同步更新
      order.headcount += topUp.addHeadcount;
      order.vegetarianCount += topUp.addVegetarianCount;
      order.allergies = Array.from(new Set([...(order.allergies || []), ...(topUp.addAllergies || [])]));
      order.totalAmount = Math.round((Number(order.totalAmount) + Number(topUp.totalDiff)) * 100) / 100;
      if (topUp.newDeliverAt && topUp.newDeliverAt.getTime() !== new Date(topUp.originDeliverAt).getTime()) {
        order.deliverAt = topUp.newDeliverAt;
      }
      await em.save(order);

      // 4) 配送单：追加份数、特殊餐标、加派信息同步给配送员
      if (delivery) {
        delivery.specialLabels = [
          ...(delivery.specialLabels || []),
          ...labels.map(l => ({ ...l, source: 'TOPUP', topUpNo: topUp.topUpNo })),
        ];
        delivery.topUpQty = (delivery.topUpQty || 0) + topUp.addHeadcount;
        if (topUp.extraCourierRequired) {
          delivery.extraDispatch = true;
          delivery.extraCourierId = extraCourier?.id ?? null;
        }
        await em.save(delivery);
      }

      // 5) 差额发票同步（月结企业随账期归集，不单开）
      topUp.specialDietRoster = labels;
      topUp.status = 'CONFIRMED';
      topUp.extraCourierId = extraCourier?.id ?? null;
      topUp.pickListSynced = true; // 追加商品即时进入门店拣货清单
      await em.save(topUp);
    });

    // 6) 发票（事务外即可，失败不影响履约）：月结企业差额随账期归集，不单开
    if (order.invoiceRequired) {
      const contract = order.contractId
        ? await this.contractRepo.findOne({ where: { id: order.contractId } })
        : await this.contractRepo.findOne({ where: { enterpriseId: order.enterpriseId, status: 'ACTIVE' } });
      if (contract?.settlementType !== 'MONTHLY') {
        await this.syncInvoice(topUp, order, labels.length);
      } else {
        await this.notify.send({
          role: 'FINANCE',
          title: '月结账期追加餐费待归集',
          content: `团餐单 ${order.orderNo} 临时加餐补差 ¥${topUp.totalDiff}（特殊餐标 ${labels.length} 枚），该企业为月结，差额将在账期归集时计入`,
          type: 'FINANCE', orderId: order.id,
        });
      }
    }

    // 7) 三方通知
    const labelDesc = labels.length
      ? `特殊餐标 ${labels.length} 枚（素食 ${topUp.vegLabelCount}、过敏 ${topUp.allergyLabelCount}），必须按企业名单逐份重新贴标`
      : '无特殊餐标';
    await this.notify.send({
      role: 'STORE', storeId: topUp.storeId,
      title: `🔔 临时加餐 ${topUp.addHeadcount} 份，请立即拣货贴标`,
      content: `团餐单 ${order.orderNo} 送达前临时追加 ${topUp.addHeadcount} 份，已同步到拣货清单。${labelDesc}，贴标完成后请在系统中确认，避免漏贴。新送达时间 ${this.fmt(topUp.newDeliverAt)}。`,
      type: 'ORDER', orderId: order.id,
    });
    if (delivery?.courierId) {
      await this.notify.send({
        userId: delivery.courierId,
        title: '配送任务餐量/餐标变更',
        content: `团餐单 ${order.orderNo} 临时追加 ${topUp.addHeadcount} 份（现共 ${order.headcount} 份），${labelDesc}，请按特殊餐标与企业签收人 ${order.contactName} 逐项核对交接${topUp.extraCourierRequired ? '；本单已加派骑手与保温箱，请与加派同事会合配送' : ''}。`,
        type: 'ORDER', orderId: order.id,
      });
    }
    if (topUp.extraCourierRequired && extraCourier) {
      await this.notify.send({
        userId: extraCourier.id,
        title: '加派配送任务（临时加餐溢出）',
        content: `团餐单 ${order.orderNo} 临时加餐导致原保温箱超载 ${topUp.deliveryCapacity?.overflow ?? ''} 份，加派您携带备用保温箱配送，追加服务费 ¥${topUp.addDeliveryFee || EXTRA_DISPATCH_FEE}，请前往${topUp.storeId === order.storeId ? '原门店' : '就近承接门店'}取货。`,
        type: 'ORDER', orderId: order.id,
      });
    }
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '临时加餐已确认，特殊餐标已同步',
      content: `团餐单 ${order.orderNo} 追加 ${topUp.addHeadcount} 份已确认：追加餐费 ¥${topUp.addAmount}${topUp.addDeliveryFee ? `、加派费 ¥${topUp.addDeliveryFee}` : ''}，差额合计 ¥${topUp.totalDiff}，新送达时间 ${this.fmt(topUp.newDeliverAt)}。素食/过敏餐标已同步门店与配送员，请签收人 ${order.contactName} 按名单核对。`,
      type: 'ORDER', orderId: order.id,
    });

    return this.detail(topUp.id);
  }

  /** 差额发票：已有待开/已开发票则累加金额，否则单独开一张补差发票 */
  private async syncInvoice(topUp: MealTopUp, order: MealOrder, labelCount: number) {
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
    const existing = await this.invoiceRepo.findOne({
      where: { orderId: order.id },
      order: { id: 'DESC' },
    });
    if (existing && ['PENDING', 'ISSUED'].includes(existing.status)) {
      existing.amount = Math.round((Number(existing.amount) + Number(topUp.totalDiff)) * 100) / 100;
      existing.kind = 'FULL';
      await this.invoiceRepo.save(existing);
      topUp.invoiceId = existing.id;
      await this.repo.save(topUp);
      await this.notify.send({
        role: 'FINANCE',
        title: '发票金额随加餐上调',
        content: `团餐单 ${order.orderNo} 临时加餐确认，发票 ${existing.invoiceNo} 金额已上调至 ¥${existing.amount}（含补差 ¥${topUp.totalDiff}）`,
        type: 'FINANCE', orderId: order.id,
      });
      return;
    }
    const inv = await this.invoiceRepo.save(this.invoiceRepo.create({
      invoiceNo: `INV${Date.now()}T`,
      enterpriseId: order.enterpriseId,
      orderId: order.id,
      title: order.invoiceTitle || enterprise?.invoiceTitle || enterprise?.name,
      taxNo: order.taxNo || enterprise?.taxNo || '',
      amount: topUp.totalDiff,
      status: 'PENDING',
      kind: 'TOPUP_DIFF',
    }));
    topUp.invoiceId = inv.id;
    await this.repo.save(topUp);
    await this.notify.send({
      role: 'FINANCE',
      title: '临时加餐差额发票待开',
      content: `团餐单 ${order.orderNo} 临时加餐 ${topUp.addHeadcount} 份（特殊餐标 ${labelCount} 枚），补差发票 ¥${topUp.totalDiff} 待开具`,
      type: 'FINANCE', orderId: order.id,
    });
  }

  /**
   * 第三步：门店按企业名单完成重新贴标后确认。
   * 系统校验素食/过敏标签数量与名单一致，防止漏贴某一类特殊餐标。
   */
  async label(topUpId: number, dto: any, user: User) {
    const topUp = await this.repo.findOne({ where: { id: topUpId } });
    if (!topUp) throw new NotFoundException('加餐单不存在');
    if (user.role === UserRole.STORE && topUp.storeId !== user.storeId) {
      throw new BadRequestException('该加餐单不属于贵店');
    }
    if (topUp.status !== 'CONFIRMED') throw new BadRequestException('当前状态不可贴标确认');
    const roster = topUp.specialDietRoster || [];
    const expectVeg = topUp.vegLabelCount;
    const expectAllergy = topUp.allergyLabelCount;
    const gotVeg = dto.vegLabelled === undefined ? expectVeg : Math.round(+dto.vegLabelled);
    const gotAllergy = dto.allergyLabelled === undefined ? expectAllergy : Math.round(+dto.allergyLabelled);
    if (gotVeg !== expectVeg || gotAllergy !== expectAllergy) {
      throw new BadRequestException(`贴标数量与企业名单不一致（应贴素食 ${expectVeg}、过敏 ${expectAllergy}，实际填报素食 ${gotVeg}、过敏 ${gotAllergy}），请核对拣货清单避免漏贴`);
    }
    topUp.status = 'LABELLED';
    topUp.labelledAt = new Date();
    topUp.labelledBy = user.id;
    topUp.labelNote = dto.note || `已按企业名单完成 ${roster.length} 枚特殊餐标贴标`;
    await this.repo.save(topUp);

    const order = await this.orderRepo.findOne({ where: { id: topUp.orderId } });
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: topUp.orderId } });
    await this.notify.send({
      enterpriseId: topUp.enterpriseId,
      title: '追加餐食已完成特殊餐贴标',
      content: `团餐单 ${order.orderNo} 追加的 ${topUp.addHeadcount} 份餐食已按企业名单完成贴标（素食 ${expectVeg}、过敏 ${expectAllergy}），配送员将按标签与签收人逐项核对`,
      type: 'ORDER', orderId: topUp.orderId,
    });
    if (delivery?.courierId) {
      await this.notify.send({
        userId: delivery.courierId,
        title: '特殊餐标已贴齐，可以核对交接',
        content: `团餐单 ${order.orderNo} 追加餐食特殊标签已全部贴齐（${roster.length} 枚），取货时请核对标签编码与份数`,
        type: 'ORDER', orderId: topUp.orderId,
      });
    }
    return this.detail(topUpId);
  }

  /** 取消未确认的核查单 */
  async cancel(topUpId: number, user: User) {
    const topUp = await this.repo.findOne({ where: { id: topUpId } });
    if (!topUp) throw new NotFoundException('加餐单不存在');
    const order = await this.orderRepo.findOne({ where: { id: topUp.orderId } });
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权操作');
    }
    if (!['CHECKED'].includes(topUp.status)) throw new BadRequestException('已确认加餐不可取消，请走异常工单流程');
    topUp.status = 'CANCELLED';
    await this.repo.save(topUp);
    return { ok: true };
  }

  async listByOrder(orderId: number) {
    return this.repo.find({ where: { orderId }, order: { id: 'DESC' } });
  }

  async detail(id: number) {
    const topUp = await this.repo.findOne({ where: { id } });
    if (!topUp) throw new NotFoundException('加餐单不存在');
    return topUp;
  }

  /**
   * 门店拣货清单：聚合本店待履约订单的原方案 + 全部已确认加餐，
   * 追加行高亮、待贴标项单独成组，避免漏贴某一类特殊餐标。
   */
  async pickList(user: User, storeId?: number) {
    const sid = user.storeId || storeId;
    if (!sid) throw new BadRequestException('请指定门店');
    const orders = await this.orderRepo.createQueryBuilder('o')
      .where('o.storeId = :sid', { sid })
      .andWhere("o.status IN ('CONFIRMED','PREPARING','READY')")
      .orderBy('o.deliverAt', 'ASC')
      .getMany();
    const plans = await this.planRepo.find({ where: { status: 'ACCEPTED' } });
    const topUps = await this.repo.find({
      where: { storeId: sid, status: In(['CONFIRMED', 'LABELLED', 'FULFILLED']) },
      order: { id: 'ASC' },
    });

    const tickets = [];
    for (const o of orders) {
      const plan = plans.filter(p => p.orderId === o.id).sort((a, b) => b.version - a.version)[0];
      const extras = topUps.filter(t => t.orderId === o.id);
      // 聚合拣货行
      const rowMap = new Map<number, any>();
      const addRow = (item: any, source: string) => {
        const row = rowMap.get(item.productId) || {
          productId: item.productId, name: item.name, category: item.category,
          quantity: 0, nearExpiryQty: 0, baseQty: 0, topUpQty: 0, vegetarian: !!item.vegetarian,
        };
        row.quantity += item.quantity;
        row.nearExpiryQty += item.nearExpiryQty || 0;
        if (source === 'TOPUP') row.topUpQty += item.quantity; else row.baseQty += item.quantity;
        rowMap.set(item.productId, row);
      };
      (plan?.items || []).forEach((i: any) => addRow(i, 'BASE'));
      extras.forEach(t => (t.items || []).forEach((i: any) => addRow(i, 'TOPUP')));

      // 待贴标特殊餐（按加餐单分组）
      const labelGroups = extras.map(t => ({
        topUpId: t.id,
        topUpNo: t.topUpNo,
        addHeadcount: t.addHeadcount,
        status: t.status,
        labelledAt: t.labelledAt,
        labelNote: t.labelNote,
        labels: t.specialDietRoster || [],
      }));
      const pendingLabels = labelGroups.reduce(
        (s, g) => s + (g.status === 'CONFIRMED' ? g.labels.length : 0), 0);

      // 临期调拨：每份餐食标记（企业已接受折扣方案，门店按编码贴标+温控出库）
      const nearUnits: any[] = (plan?.unitLabels || []);
      const nearUnitGroups: any[] = [];
      for (const u of nearUnits) {
        let g = nearUnitGroups.find((x: any) => x.productId === u.productId && x.batchNo === u.batchNo);
        if (!g) {
          g = { productId: u.productId, productName: u.productName, batchNo: u.batchNo,
            tempZone: u.tempZone, expiresAt: u.expiresAt, discountRate: u.discountRate,
            paidUnitPrice: u.paidUnitPrice, labelCodes: [] };
          nearUnitGroups.push(g);
        }
        g.labelCodes.push(u.labelCode);
      }

      tickets.push({
        orderId: o.id,
        orderNo: o.orderNo,
        enterprise: o.contactName,
        deliverAt: o.deliverAt,
        headcount: o.headcount,
        rows: Array.from(rowMap.values()),
        topUpCount: extras.length,
        topUpQty: extras.reduce((s, t) => s + t.addHeadcount, 0),
        labelGroups,
        pendingLabels,
        nearExpiryOfferNo: plan?.nearExpiryOfferNo || null,
        nearExpiryQty: nearUnits.length,
        nearExpiryReason: plan?.discountReason || null,
        nearUnitGroups,
      });
    }
    return {
      storeId: sid,
      generatedAt: new Date(),
      ticketCount: tickets.length,
      topUpOrderCount: tickets.filter(t => t.topUpCount > 0).length,
      pendingLabelCount: tickets.reduce((s, t) => s + t.pendingLabels, 0),
      tickets,
    };
  }

  /** 配送取货后：加餐并入配送完成 */
  async markFulfilled(orderId: number) {
    await this.repo.update(
      { orderId, status: In(['CONFIRMED', 'LABELLED']) },
      { status: 'FULFILLED' },
    );
  }

  /** 为企业特殊餐名单逐人生成贴标条目（含标签编码与对应餐品） */
  private buildLabels(topUp: MealTopUp, items: any[]) {
    const vegItem = items.find((i: any) => i.vegetarian && ['BENTO', 'SANDWICH', 'RICE_BALL'].includes(i.category));
    const normalItem = items.find((i: any) => !i.vegetarian && ['BENTO', 'SANDWICH', 'RICE_BALL'].includes(i.category))
      || items.find((i: any) => ['BENTO', 'SANDWICH', 'RICE_BALL'].includes(i.category));
    let seq = 1;
    const code = () => `${topUp.topUpNo}-L${String(seq++).padStart(2, '0')}`;
    const roster = topUp.specialDietRoster || [];
    const labels = roster.map((r: any) => {
      const isVeg = r.tag === '素食';
      const item = isVeg ? vegItem : normalItem;
      return {
        name: r.name,
        tag: r.tag,
        labelCode: code(),
        productName: item?.name || '团餐主食',
        labelled: false,
      };
    });
    // 名单之外的素食份数也生成素食标签（无名，按序号贴）
    const namedVeg = roster.filter((r: any) => r.tag === '素食').length;
    for (let i = namedVeg; i < topUp.addVegetarianCount; i++) {
      labels.push({
        name: `素食${i + 1}`,
        tag: '素食',
        labelCode: code(),
        productName: vegItem?.name || '素食餐',
        labelled: false,
      });
    }
    return labels;
  }

  private fmt(d: Date) {
    const t = new Date(d);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getMonth() + 1}-${t.getDate()} ${p(t.getHours())}:${p(t.getMinutes())}`;
  }
}
