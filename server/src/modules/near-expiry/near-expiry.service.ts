import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NearExpiryOffer, SettlementAttachment, NearExpiryOfferStatus } from '../../entities/near-expiry.entity';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { User, UserRole } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';

/** 临期判定：送达后 6 小时内到期 */
const NEAR_WINDOW_HOURS = 6;
/** 符合团餐时间要求：送达后至少可安全食用 15 分钟（覆盖集中取餐/用餐） */
const MIN_SERVE_MIN = 15;
/** 临期餐食建议食用时限（小时，写入每份标签与售后规则） */
const SERVE_DEADLINE_HOURS = 2;

/** 按送达后剩余货架时间分档给折扣率 */
const DISCOUNT_TIERS = [
  { maxHours: 2, rate: 0.5, label: '5 折（送达后 2 小时内到期）' },
  { maxHours: 4, rate: 0.6, label: '6 折（送达后 4 小时内到期）' },
  { maxHours: 6, rate: 0.7, label: '7 折（送达后 6 小时内到期）' },
];

const TEMP_ZONE_NAMES: Record<string, string> = {
  HOT: '热链', CHILLED: '冷藏', FROZEN: '冷冻', AMBIENT: '常温',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class NearExpiryService {
  constructor(
    @InjectRepository(NearExpiryOffer) private offerRepo: Repository<NearExpiryOffer>,
    @InjectRepository(SettlementAttachment) private attachmentRepo: Repository<SettlementAttachment>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notify: NotificationService,
    private dataSource: DataSource,
  ) {}

  private genNo(prefix: string) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${prefix}${ymd}${Math.floor(10000 + Math.random() * 89999)}`;
  }

  private tierFor(remainingMs: number) {
    const h = remainingMs / 3600000;
    return DISCOUNT_TIERS.find(t => h <= t.maxHours) || DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1];
  }

  private fmt(d: Date) {
    const t = new Date(d);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getMonth() + 1}-${t.getDate()} ${p(t.getHours())}:${p(t.getMinutes())}`;
  }

  /** 温控方案（按批次涉及温区生成出库/在途/交接温控要求） */
  private tempControlPlan(zones: string[]) {
    const Z: any = {
      HOT: {
        zone: 'HOT', zoneName: '热链',
        outbound: '出库中心温度 ≥65℃',
        transit: '热链保温箱全程 ≥60℃，出车前箱内预温',
        handover: '企业签收当场测中心温度 ≥60℃',
        rejectRule: '中心温度 <60℃ 判定温控失效，企业可整批退换，按质量售后处理（与临期属性无关）',
      },
      CHILLED: {
        zone: 'CHILLED', zoneName: '冷藏',
        outbound: '出库表面温度 0~4℃',
        transit: '冷藏保温箱 0~8℃，加配冰排',
        handover: '签收表面温度 ≤8℃',
        rejectRule: '表面温度 >8℃ 或包装结露异常判定温控失效，企业可整批退换',
      },
      AMBIENT: {
        zone: 'AMBIENT', zoneName: '常温',
        outbound: '阴凉避光，≤25℃',
        transit: '常温配送，避免暴晒',
        handover: '包装完好、无胀气无渗液',
        rejectRule: '包装破损/胀气/渗液判定异常，企业可整批退换',
      },
      FROZEN: {
        zone: 'FROZEN', zoneName: '冷冻',
        outbound: '出库 ≤-18℃',
        transit: '冷冻保温箱 ≤-12℃',
        handover: '签收无解冻软化',
        rejectRule: '中途解冻软化判定温控失效，企业可整批退换',
      },
    };
    const uniq = Array.from(new Set(zones));
    return {
      zones: uniq.map(z => Z[z] || Z.AMBIENT),
      rules: [
        '临期批次优先装配、优先装箱、优先送达，不得与常温货品混放导致温度漂移',
        '出库时逐批次测温并记录，随车携带批次温控记录单',
        '企业签收当场按温区抽测中心/表面温度，测温结果记入团餐单',
        '每份临期餐食贴临期调拨标签，注明批次、到期时间、折扣与建议食用时限',
      ],
    };
  }

  /** 售后责任划分快照（企业确认后不可变，售后据此区分临期与质量问题） */
  private afterSalesPolicy(units: number[], zones: string[]) {
    return {
      version: '2026-v1',
      nearExpiry: {
        title: '临期调拨餐食售后规则（企业已逐份确认）',
        acknowledged: true,
        serveDeadline: `请于送达后 ${SERVE_DEADLINE_HOURS} 小时内、且不晚于标签标注的批次到期时间食用`,
        nonQuality: [
          '临期属性本身（剩余保质期较短）',
          '折扣价格对应的口感预期差异',
          '超过标签建议食用时限后食用引发的问题',
        ],
        qualityCovered: [
          '签收当场温控检测不合格（热链中心 <60℃ / 冷藏表面 >8℃）：整批退换，不计企业质量投诉次数',
          '包装破损、胀气、渗液、污染或与标签批次不符',
          '在建议食用时限内、温控合格前提下仍出现变质/异味/异物：按平台标准食安流程处理（退款/补送/同批次下架）',
        ],
        exchangeRule: '签收当场发现温控或包装异常，可整批拒收退换；签收后 2 小时内出现疑似变质，须提交温控照片与批次号，客服按本规则判定，临期属性不作为质量问题归因',
      },
      normal: {
        title: '正常餐食售后规则',
        rule: '非临期餐食适用平台标准食安售后：客服核实后可批量退款（默认 2 倍食安赔付）、补送、触发同批次门店下架',
      },
      statement: '本售后责任划分随临期调拨折扣方案经企业行政在线确认，确认记录同步进入月结附件与售后说明；'
        + `本次共 ${units.length} 份临期餐食逐份贴标，后续售后不得将上述已确认临期份认定为质量问题。`,
      tempZones: Array.from(new Set(zones)),
    };
  }

  private discountReason(rows: any[], deliverAt: Date) {
    const batchDesc = rows.slice(0, 3).map(r =>
      `${r.name} 批次 ${r.batches.filter((b: any) => b.near).map((b: any) => b.batchNo).join('/')}`).join('；');
    return `门店当日鲜食批次即将临期（${batchDesc}），送达时仍在保质期内且覆盖团餐集中用餐时间窗（送达后至少可食用 ${MIN_SERVE_MIN} 分钟），`
      + `符合团餐时间要求。为优先消化临期库存、减少门店报损，平台按送达后剩余货架时间分档（5/6/7 折）推荐给贵企业，`
      + `临期份逐份贴标，请于送达后 ${SERVE_DEADLINE_HOURS} 小时内食用。`;
  }

  /**
   * 内存试算：在门店实时批次上，按“临期优先 + FEFO”把方案明细分配到批次，
   * 产出商品行、批次快照、每份标记与金额。纯读操作。
   */
  private async buildOffer(order: MealOrder, plan: MealPlan) {
    const deliverAt = new Date(order.deliverAt);
    const serveFloor = new Date(deliverAt.getTime() + MIN_SERVE_MIN * 60000);
    const nearCeil = new Date(deliverAt.getTime() + NEAR_WINDOW_HOURS * 3600 * 1000);

    const productIds = (plan.items as any[]).map(i => i.productId);
    const batches = await this.batchRepo.find({
      where: { storeId: order.storeId, productId: In(productIds), status: 'AVAILABLE' },
      order: { expiresAt: 'ASC' },
    });
    const products = await this.productRepo.find({ where: { id: In(productIds) } });
    const pmap = new Map(products.map(p => [p.id, p]));

    const rows: any[] = [];
    const flatBatches: any[] = [];
    const units: any[] = [];
    const zones: string[] = [];
    let amountBefore = 0;
    let offerAmount = 0;
    let nearExpiryQty = 0;

    for (const item of plan.items as any[]) {
      const product = pmap.get(item.productId);
      const pool = batches
        .filter(b => b.productId === item.productId && b.quantity > 0 && b.expiresAt > serveFloor)
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime()); // 临期优先 / FEFO
      let remain = item.quantity;
      const alloc: any[] = [];
      let lineBase = 0;
      let lineOffer = 0;
      let lineNear = 0;
      for (const b of pool) {
        if (remain <= 0) break;
        const use = Math.min(b.quantity, remain);
        const near = b.expiresAt <= nearCeil;
        const tier = near ? this.tierFor(b.expiresAt.getTime() - deliverAt.getTime()) : null;
        const rate = tier ? tier.rate : 1;
        alloc.push({
          batchId: b.id, batchNo: b.batchNo, quantity: use, near,
          discountRate: rate, tierLabel: tier?.label || null,
          producedAt: b.producedAt, expiresAt: b.expiresAt, tempZone: b.tempZone,
        });
        flatBatches.push({
          batchId: b.id, batchNo: b.batchNo, productId: item.productId, productName: item.name,
          quantity: use, nearExpiryQty: near ? use : 0, tempZone: b.tempZone,
          producedAt: b.producedAt, expiresAt: b.expiresAt,
        });
        zones.push(b.tempZone);
        remain -= use;
        if (near) {
          lineNear += use;
          nearExpiryQty += use;
          for (let k = 0; k < use; k++) {
            units.push({
              labelCode: '', // 保存时赋码
              productId: item.productId, productName: item.name, category: item.category,
              batchId: b.id, batchNo: b.batchNo, tempZone: b.tempZone,
              producedAt: b.producedAt, expiresAt: b.expiresAt,
              discountRate: rate,
              paidUnitPrice: r2(Number(item.unitPrice) * rate),
              reason: '临期鲜食优先调拨：批次即将到期但仍符合团餐时间要求，企业确认折扣',
              afterSalesRule: `临期调拨份（${TEMP_ZONE_NAMES[b.tempZone]}）：签收温控合格/包装完好/保质期内不认定为质量问题；请于送达后 ${SERVE_DEADLINE_HOURS} 小时内食用；签收当场温控异常可整批退换`,
              remainingMinAtDelivery: Math.round((b.expiresAt.getTime() - deliverAt.getTime()) / 60000),
              status: 'LABELLED',
            });
          }
        }
      }
      if (remain > 0) {
        throw new BadRequestException(
          `门店「${item.name}」可用批次较方案生成时已变化（缺口 ${remain} 份），请先重新生成供餐方案后再推荐临期折扣`,
        );
      }
      lineBase = r2(item.quantity * Number(item.unitPrice));
      lineOffer = r2(alloc.reduce((s, a) => {
        const price = Number(item.unitPrice) * a.discountRate;
        return s + a.quantity * price;
      }, 0));
      amountBefore += lineBase;
      offerAmount += lineOffer;
      const nearRates = Array.from(new Set(alloc.filter(a => a.near).map(a => a.discountRate))).sort();
      rows.push({
        productId: item.productId,
        name: item.name,
        category: item.category,
        vegetarian: !!item.vegetarian,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        normalQty: item.quantity - lineNear,
        nearExpiryQty: lineNear,
        discountRates: nearRates,
        batches: alloc,
        lineBaseAmount: lineBase,
        lineOfferAmount: lineOffer,
      });
    }

    if (nearExpiryQty === 0) {
      throw new BadRequestException('该团餐单当前没有“即将临期但仍符合团餐时间要求”的批次可调拨，无需推荐折扣方案');
    }

    const windowSnapshot = {
      deliverAt,
      minServeAt: serveFloor,
      nearCeil,
      serveWindowHours: NEAR_WINDOW_HOURS,
      batches: flatBatches.filter((b: any) => b.nearExpiryQty > 0).map((b: any) => ({
        batchNo: b.batchNo, productName: b.productName, tempZone: b.tempZone,
        expiresAt: b.expiresAt,
        remainingMinAtDelivery: Math.round((new Date(b.expiresAt).getTime() - deliverAt.getTime()) / 60000),
        withinGroupMealWindow: true,
      })),
    };

    return {
      rows,
      flatBatches,
      units,
      zones: Array.from(new Set(zones)),
      amountBefore: r2(amountBefore),
      offerAmount: r2(offerAmount),
      savingsAmount: r2(amountBefore - offerAmount),
      totalQty: (plan.items as any[]).reduce((s, i) => s + i.quantity, 0),
      nearExpiryQty,
      groupMealWindow: windowSnapshot,
      discountReason: this.discountReason(rows, deliverAt),
    };
  }

  /** 取待推荐/已推荐订单的当前方案 */
  private async targetPlan(order: MealOrder) {
    const plan = await this.planRepo.findOne({
      where: { orderId: order.id },
      order: { version: 'DESC' },
    });
    if (!plan) throw new BadRequestException('团餐单缺少供餐方案');
    if (plan.status === 'REJECTED') throw new BadRequestException('方案已被更换，请使用最新方案');
    return plan;
  }

  /**
   * 平台推荐折扣方案（生成/刷新一条 PROPOSED offer）。
   * 仅待企业确认或已确认未备货的团餐单可推荐；已有企业接受方案不可覆盖。
   */
  async recommend(orderId: number, user: User) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (![OrderStatus.PENDING_CONFIRM, OrderStatus.CONFIRMED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('门店已开始备货或订单已完结，不能再推荐临期折扣方案');
    }
    const accepted = await this.offerRepo.findOne({ where: { orderId, status: NearExpiryOfferStatus.ACCEPTED } });
    if (accepted) throw new BadRequestException('该团餐单已有企业确认的临期调拨方案，不可重复推荐');

    const plan = await this.targetPlan(order);
    const trial = await this.buildOffer(order, plan);

    let offer = await this.offerRepo.findOne({
      where: { orderId, status: NearExpiryOfferStatus.PROPOSED },
      order: { id: 'DESC' },
    });
    if (!offer) {
      offer = this.offerRepo.create({
        offerNo: this.genNo('LN'), orderId, enterpriseId: order.enterpriseId,
        storeId: order.storeId, sourceType: 'PENDING_ORDER', proposedBy: user.id,
      });
    }
    const tempControl = this.tempControlPlan(trial.zones);
    const policy = this.afterSalesPolicy(trial.units, trial.zones);
    // 逐份贴标赋码
    trial.units.forEach((u, i) => { u.labelCode = `${offer.offerNo}-U${String(i + 1).padStart(3, '0')}`; });

    Object.assign(offer, {
      status: NearExpiryOfferStatus.PROPOSED,
      discountRate: Math.min(...trial.rows.flatMap(r => r.discountRates.length ? r.discountRates : [1])),
      totalQty: trial.totalQty,
      nearExpiryQty: trial.nearExpiryQty,
      amountBefore: trial.amountBefore,
      offerAmount: trial.offerAmount,
      savingsAmount: trial.savingsAmount,
      items: trial.rows,
      batches: trial.flatBatches,
      units: trial.units,
      tempControl,
      afterSalesPolicy: policy,
      discountReason: trial.discountReason,
      groupMealWindow: trial.groupMealWindow,
      expiredAt: null,
      expireReason: null,
      rejectedAt: null,
    });
    offer = await this.offerRepo.save(offer);

    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '临期鲜食优先调拨折扣方案待确认',
      content: `团餐单 ${order.orderNo} 门店有 ${trial.nearExpiryQty} 份鲜食即将临期但仍符合团餐用餐时间，平台推荐折上折（低至 5 折），`
        + `折后应付 ¥${trial.offerAmount}（较正常价节省 ¥${trial.savingsAmount}）。接受后批次/折扣/温控/售后责任将写入团餐单，每份餐食贴标并随月结附件留存。`,
      type: 'INVENTORY', orderId: order.id,
    });
    return this.detail(offer.id);
  }

  /** 平台临期池 + 可推荐团餐单候选 */
  async pool(user: User, storeId?: number) {
    const now = Date.now();
    const soon = new Date(now + NEAR_WINDOW_HOURS * 3600 * 1000);
    const batchQb = this.batchRepo.createQueryBuilder('b')
      .where('b.status = :st', { st: 'AVAILABLE' })
      .andWhere('b.quantity > 0')
      .andWhere('b.expiresAt > :now', { now: new Date(now) })
      .andWhere('b.expiresAt <= :soon', { soon })
      .orderBy('b.expiresAt', 'ASC');
    if (user.storeId) batchQb.andWhere('b.storeId = :sid', { sid: user.storeId });
    else if (storeId) batchQb.andWhere('b.storeId = :sid', { sid: +storeId });
    const nearBatches = await batchQb.getMany();
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s]));

    // 候选团餐单：待确认/已确认未备货，且当前方案可在临期批次上分配
    // 临期判定以「送达时间」为基准：送达后 6h 内到期且送达后仍可食用 ≥15 分钟
    const orders = await this.orderRepo.find({
      where: { status: In([OrderStatus.PENDING_CONFIRM, OrderStatus.CONFIRMED]) },
    });
    const candidates: any[] = [];
    for (const o of orders) {
      if (user.storeId && o.storeId !== user.storeId) continue;
      const plan = await this.planRepo.findOne({ where: { orderId: o.id }, order: { version: 'DESC' } });
      if (!plan) continue;
      const deliverTs = new Date(o.deliverAt).getTime();
      if (deliverTs <= now) continue;
      const nearFloor = deliverTs + MIN_SERVE_MIN * 60000;
      const nearCeilTs = deliverTs + NEAR_WINDOW_HOURS * 3600 * 1000;
      let nearQty = 0;
      let savings = 0;
      let feasible = true;
      for (const item of plan.items as any[]) {
        // 该单可用批次（按送达时间窗），临期优先消耗
        const all = (await this.batchRepo.find({
          where: { storeId: o.storeId, productId: item.productId, status: 'AVAILABLE' },
        })).filter(b => b.quantity > 0 && b.expiresAt.getTime() > nearFloor);
        const totalAvail = all.reduce((s, b) => s + b.quantity, 0);
        if (totalAvail < item.quantity) { feasible = false; break; }
        const nearPool = all
          .filter(b => b.expiresAt.getTime() <= nearCeilTs)
          .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
        let remain = item.quantity;
        for (const b of nearPool) {
          const use = Math.min(b.quantity, remain);
          remain -= use;
          const tier = this.tierFor(b.expiresAt.getTime() - deliverTs);
          nearQty += use;
          savings += use * Number(item.unitPrice) * (1 - tier.rate);
        }
      }
      const existed = await this.offerRepo.findOne({
        where: { orderId: o.id, status: In([NearExpiryOfferStatus.PROPOSED, NearExpiryOfferStatus.ACCEPTED]) },
        order: { id: 'DESC' },
      });
      candidates.push({
        orderId: o.id, orderNo: o.orderNo, enterpriseId: o.enterpriseId,
        storeId: o.storeId, storeName: smap.get(o.storeId)?.name,
        deliverAt: o.deliverAt, orderStatus: o.status,
        nearExpiryQty: nearQty, estimatedSavings: r2(savings),
        feasible, offerId: existed?.id, offerStatus: existed?.status || null,
      });
    }
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    return {
      batches: nearBatches.map(b => ({
        ...b,
        productName: pmap.get(b.productId)?.name,
        category: pmap.get(b.productId)?.category,
        storeName: smap.get(b.storeId)?.name,
        tempZoneName: TEMP_ZONE_NAMES[b.tempZone],
        remainingMin: Math.round((b.expiresAt.getTime() - now) / 60000),
      })),
      candidates: candidates
        .filter(c => c.nearExpiryQty > 0)
        .map(c => ({ ...c, enterpriseName: emap.get(c.enterpriseId) })),
    };
  }

  /** 企业接受折扣方案：二次校验后把批次/折扣/温控/售后责任写入团餐单 */
  async accept(offerId: number, dto: any, user: User) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权确认其它企业的折扣方案');
    }
    if (offer.status === NearExpiryOfferStatus.ACCEPTED) throw new BadRequestException('方案已确认，请勿重复操作');
    if (offer.status !== NearExpiryOfferStatus.PROPOSED) throw new BadRequestException('方案当前状态不可确认');
    if (![OrderStatus.PENDING_CONFIRM, OrderStatus.CONFIRMED].includes(order.status as OrderStatus)) {
      throw new BadRequestException('团餐单状态已变化，折扣方案失效');
    }

    // 二次校验：批次与库存未变化
    const plan = await this.targetPlan(order);
    await this.buildOffer(order, plan);

    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });

    await this.dataSource.transaction(async (em) => {
      // 1) 方案行写入批次、折扣、售后责任
      const rowByProduct = new Map(offer.items.map((r: any) => [r.productId, r]));
      plan.items = (plan.items as any[]).map((it: any) => {
        const r = rowByProduct.get(it.productId);
        if (!r) return it;
        return {
          ...it,
          nearExpiryQty: r.nearExpiryQty,
          normalQty: r.normalQty,
          discountRates: r.discountRates,
          batchAllocations: r.batches,
          lineBaseAmount: r.lineBaseAmount,
          lineOfferAmount: r.lineOfferAmount,
          nearExpiryOfferNo: offer.offerNo,
        };
      });
      plan.reservedBatches = offer.batches.map((b: any) => ({
        batchId: b.batchId, productId: b.productId, quantity: b.quantity,
        nearExpiryQty: b.nearExpiryQty, discountRate: b.nearExpiryQty
          ? Math.min(...offer.items.find((r: any) => r.productId === b.productId).batches
            .filter((x: any) => x.batchId === b.batchId).map((x: any) => x.discountRate))
          : 1,
      }));
      plan.nearExpiryOfferNo = offer.offerNo;
      plan.discountReason = offer.discountReason;
      plan.tempControl = offer.tempControl;
      plan.afterSalesPolicy = offer.afterSalesPolicy;
      plan.unitLabels = offer.units;
      plan.totalPrice = offer.offerAmount;
      plan.reasons = [
        ...plan.reasons,
        `企业已接受临期鲜食优先调拨折扣方案 ${offer.offerNo}：${offer.nearExpiryQty} 份临期餐食按 5~7 折结算，`
          + `应付 ¥${offer.offerAmount}（较正常价节省 ¥${offer.savingsAmount}），批次/温控/售后责任已写入团餐单并逐份贴标`,
      ];
      plan.warnings = [
        ...plan.warnings,
        `含 ${offer.nearExpiryQty} 份临期调拨餐食：门店须按锁定批次优先装配、全程温控，企业签收当场测温并请于送达后 ${SERVE_DEADLINE_HOURS} 小时内食用`,
      ];
      await em.save(plan);

      // 2) 订单：金额与方案凭证
      order.totalAmount = offer.offerAmount;
      order.nearExpiryOfferId = offer.id;
      if (order.status === OrderStatus.PENDING_CONFIRM) {
        plan.status = 'ACCEPTED';
        await em.save(plan);
        order.status = OrderStatus.CONFIRMED;
      }
      await em.save(order);

      // 3) 企业确认快照
      offer.status = NearExpiryOfferStatus.ACCEPTED;
      offer.acceptedBy = user.id;
      offer.acceptedByName = user.name;
      offer.acceptedAt = new Date();
      offer.acceptanceNote = dto?.note || `企业行政在线确认接受临期调拨折扣，已知悉折扣原因与售后规则（${offer.nearExpiryQty} 份逐份贴标）`;
      await em.save(offer);

      // 4) 月结附件（确认即归档，待财务归集账期）
      const month = `${new Date(order.deliverAt).getFullYear()}-${String(new Date(order.deliverAt).getMonth() + 1).padStart(2, '0')}`;
      const attachment = em.create(SettlementAttachment, {
        attachmentNo: this.genNo('FJ'),
        enterpriseId: order.enterpriseId,
        orderId: order.id,
        offerId: offer.id,
        settlementId: null,
        month,
        type: 'NEAR_EXPIRY_CONFIRM',
        title: `临期鲜食调拨企业确认附件 · ${offer.offerNo} · 团餐单 ${order.orderNo}`,
        snapshot: {
          attachmentType: '临期鲜食优先调拨 · 企业确认',
          offerNo: offer.offerNo,
          orderNo: order.orderNo,
          enterprise: enterprise?.name,
          storeId: order.storeId,
          acceptedBy: user.name,
          acceptedAt: offer.acceptedAt,
          acceptanceNote: offer.acceptanceNote,
          discountReason: offer.discountReason,
          totalQty: offer.totalQty,
          nearExpiryQty: offer.nearExpiryQty,
          amountBefore: offer.amountBefore,
          offerAmount: offer.offerAmount,
          savingsAmount: offer.savingsAmount,
          tempControl: offer.tempControl,
          afterSalesPolicy: offer.afterSalesPolicy,
          groupMealWindow: offer.groupMealWindow,
          units: offer.units,
          batches: offer.batches,
        },
      });
      await em.save(attachment);
    });

    // 5) 通知
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '企业已接受临期调拨折扣方案，请按锁定批次备货',
      content: `团餐单 ${order.orderNo} 企业确认方案 ${offer.offerNo}：${offer.nearExpiryQty} 份临期餐食已锁定批次并逐份贴标，请严格按温控方案（${offer.tempControl.zones.map((z: any) => z.zoneName).join('/')}）优先装配，出库测温留痕。`,
      type: 'INVENTORY', orderId: order.id,
    });
    await this.notify.send({
      role: 'FINANCE',
      title: '临期调拨企业确认已入月结附件',
      content: `团餐单 ${order.orderNo} 的临期折扣确认（${offer.offerNo}，节省 ¥${offer.savingsAmount}）已作为月结附件归档，账期归集时自动挂入；该确认同时作为售后说明依据。`,
      type: 'FINANCE', orderId: order.id,
    });
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '临期调拨折扣方案已确认',
      content: `您已确认团餐单 ${order.orderNo} 的临期调拨方案：${offer.nearExpiryQty} 份逐份贴标，应付 ¥${offer.offerAmount}，折扣原因、温控与售后规则可在订单详情与月结附件中查看。签收时请配合测温并于送达后 ${SERVE_DEADLINE_HOURS} 小时内食用。`,
      type: 'INVENTORY', orderId: order.id,
    });
    return this.detail(offer.id);
  }

  /** 企业拒绝：方案失效，团餐单维持原价方案 */
  async reject(offerId: number, dto: any, user: User) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权操作');
    }
    if (offer.status !== NearExpiryOfferStatus.PROPOSED) throw new BadRequestException('方案已不可拒绝');
    offer.status = NearExpiryOfferStatus.REJECTED;
    offer.rejectedBy = user.id;
    offer.rejectedAt = new Date();
    offer.rejectReason = dto?.reason || '企业不接受临期调拨，按正常方案履约';
    await this.offerRepo.save(offer);
    await this.notify.send({
      role: 'ADMIN',
      title: '企业拒绝临期调拨折扣方案',
      content: `团餐单 ${order.orderNo} 的方案 ${offer.offerNo} 被企业拒绝（${offer.rejectReason}），将按正常方案履约，门店临期库存请另行处理。`,
      type: 'INVENTORY', orderId: order.id,
    });
    return this.detail(offer.id);
  }

  async listOffers(user: User, query: any) {
    const qb = this.offerRepo.createQueryBuilder('f').orderBy('f.id', 'DESC').take(200);
    if (user.role === UserRole.ENTERPRISE) qb.where('f.enterpriseId = :eid', { eid: user.enterpriseId });
    else if (user.role === UserRole.STORE) qb.where('f.storeId = :sid', { sid: user.storeId });
    if (query.status) qb.andWhere('f.status = :st', { st: query.status });
    if (query.orderId) qb.andWhere('f.orderId = :oid', { oid: +query.orderId });
    const list = await qb.getMany();
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s.name]));
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    // 懒失效：批次/订单状态变化导致 PROPOSED 方案失效
    for (const f of list) {
      if (f.status === NearExpiryOfferStatus.PROPOSED) {
        const o = omap.get(f.orderId);
        if (!o || ![OrderStatus.PENDING_CONFIRM, OrderStatus.CONFIRMED].includes(o.status as OrderStatus)) {
          f.status = NearExpiryOfferStatus.EXPIRED;
          f.expiredAt = new Date();
          f.expireReason = '团餐单状态已变化';
          await this.offerRepo.save(f);
        }
      }
    }
    return list.map(f => ({
      ...f,
      orderNo: omap.get(f.orderId)?.orderNo,
      storeName: smap.get(f.storeId),
      enterpriseName: emap.get(f.enterpriseId),
    }));
  }

  async listByOrder(orderId: number) {
    return this.offerRepo.find({ where: { orderId }, order: { id: 'DESC' } });
  }

  async detail(id: number, user?: User) {
    const offer = await this.offerRepo.findOne({ where: { id } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    if (user?.role === UserRole.ENTERPRISE && offer.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权查看其它企业的折扣方案');
    }
    if (user?.role === UserRole.STORE && offer.storeId !== user.storeId) {
      throw new BadRequestException('无权查看其它门店的折扣方案');
    }
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: offer.enterpriseId } });
    const store = await this.storeRepo.findOne({ where: { id: offer.storeId } });
    const attachment = await this.attachmentRepo.findOne({ where: { offerId: id } });
    return {
      ...offer,
      orderNo: order?.orderNo,
      enterpriseName: enterprise?.name,
      storeName: store?.name,
      attachmentNo: attachment?.attachmentNo || null,
      attachmentId: attachment?.id || null,
    };
  }

  /** 月结附件列表（企业看自己；财务/运营看全部；可按月结单过滤） */
  async listAttachments(user: User, query: any) {
    const qb = this.attachmentRepo.createQueryBuilder('a').orderBy('a.id', 'DESC').take(200);
    if (user.role === UserRole.ENTERPRISE) qb.where('a.enterpriseId = :eid', { eid: user.enterpriseId });
    if (query.settlementId) qb.andWhere('a.settlementId = :sid', { sid: +query.settlementId });
    if (query.month) qb.andWhere('a.month = :m', { m: query.month });
    if (query.orderId) qb.andWhere('a.orderId = :oid', { oid: +query.orderId });
    const list = await qb.getMany();
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    return list.map(a => ({
      ...a,
      enterpriseName: emap.get(a.enterpriseId),
      orderNo: omap.get(a.orderId)?.orderNo,
    }));
  }
}
