import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NearExpiryOffer, OfferStatus } from '../../entities/near-expiry.entity';
import { MealOrder, MealPlan, OrderStatus } from '../../entities/order.entity';
import { InventoryBatch, Transfer } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { User, UserRole } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';

/** 送达后须保留的最短食用窗口（小时）——团餐时间要求 */
const EAT_WINDOW_HOURS = 2;
/** 临期判定：送达后 6 小时内到期（与方案引擎口径一致） */
const NEAR_LOOKUP_HOURS = 6;
/** 周边调拨半径 km */
const MAX_DISTANCE_KM = 15;
/** 可推荐临期调拨的主食品类 */
const FOOD_CATEGORIES = ['BENTO', 'SANDWICH', 'RICE_BALL'];
/** 占名额的有效方案状态（拒绝/取消后可重新推荐） */
const LIVE_STATUSES = [OfferStatus.PROPOSED, OfferStatus.CONFIRMED, OfferStatus.FULFILLED];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class NearExpiryService {
  constructor(
    @InjectRepository(NearExpiryOffer) private offerRepo: Repository<NearExpiryOffer>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Transfer) private transferRepo: Repository<Transfer>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notify: NotificationService,
    private dataSource: DataSource,
  ) {}

  private genNo() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `NE${ymd}${Math.floor(10000 + Math.random() * 89999)}`;
  }

  /** 按送达后剩余食用窗口分档定价 */
  private discountRate(remainHours: number) {
    if (remainHours <= 3) return 0.7;
    return 0.8;
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** 温控要求（按批次温区） */
  private tempControlOf(zones: string[]) {
    const uniq = Array.from(new Set(zones));
    const hot = uniq.includes('HOT');
    const chilled = uniq.includes('CHILLED');
    return {
      zones: uniq,
      requirement: hot
        ? '热链鲜食全程保温配送，门店出餐中心温度 ≥60℃'
        : '冷藏鲜食全程 0–8℃ 冷链，保温箱加配冰排',
      box: hot ? '热链保温箱（箱内 ≥60℃）' : '冷藏保温箱 + 冰排（箱内 0–8℃）',
      deliverTemp: hot ? '送达中心温度 ≥55℃' : '到货表面温度 ≤10℃',
      eatBeforeHours: EAT_WINDOW_HOURS,
      note: '送达后请按标示温度暂存，并于 2 小时食用窗口内食用完毕',
    };
  }

  /** 售后责任条款（企业确认后写入团餐单/月结附件/售后说明） */
  private buildRules(rate: number) {
    return [
      `【临期定性】本批餐食为临期鲜食优先调拨，已由企业行政确认按 ${rate} 折结算；餐食临近保质期但仍在保质期内、符合团餐送达后 ${EAT_WINDOW_HOURS} 小时食用要求，"临期/新鲜度不及正价餐"本身不属于质量问题，不得据此按餐食变质申请售后。`,
      `【食用时限】请于送达后 ${EAT_WINDOW_HOURS} 小时内且不晚于包装批次到期时间食用完毕；逾期食用或企业签收后未按标示温控暂存导致的问题，由企业自行承担。`,
      '【温控责任】门店按标示温区出库、仓配全程温控配送并记录温度；企业签收后脱离温控暂存导致的变质不纳入平台赔付。',
      '【真实食安不免责】若餐食存在异味、变质、异物等真实食品安全问题，企业仍可凭批次号与温控照片提交变质售后，平台按食安流程受理（批量退款/补送/同批次下架），临期折扣不免除平台质量责任。',
      '【确认凭据】企业对本方案的确认记录（含批次、折扣、温控、售后规则、逐份餐食标记）已写入团餐单、月结附件与售后说明，作为售后责任界定依据。',
    ];
  }

  private buildReason(storeName: string, expiresAt: Date, deliverAt: Date, rate: number) {
    const remainHours = this.round2((expiresAt.getTime() - deliverAt.getTime()) / 3600000);
    const p = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
    return `该批次为「${storeName}」当日鲜食，${fmt(expiresAt)} 到期，按团餐时间（${fmt(deliverAt)} 送达）核验仍保留 ${remainHours} 小时食用窗口（≥${EAT_WINDOW_HOURS} 小时），符合团餐供餐要求；为避免临期报损、优先团餐消化，按 ${rate} 折调拨。餐食仍在保质期内，非质量问题折价。`;
  }

  /**
   * 第一步：平台/门店为团餐单推荐临期折扣方案（不扣库存）。
   * 扫描履约门店 + 周边 15km 门店的临期便当批次（送达后仍有食用窗口），
   * 仅覆盖方案中按正常价供应的主食份数（方案已自动 7 折消化的临期份除外，避免双重折扣）。
   */
  async recommend(orderId: number, dto: any, user: User) {
    const order = await this.mustOrder(orderId, user);
    if (![OrderStatus.CONFIRMED, OrderStatus.PREPARING].includes(order.status as OrderStatus)) {
      throw new BadRequestException('仅已确认（待备货/备货中）的团餐单可推荐临期折扣方案');
    }
    const plan = await this.planRepo.findOne({
      where: { orderId, status: 'ACCEPTED' }, order: { version: 'DESC' },
    }) || await this.planRepo.findOne({ where: { orderId }, order: { version: 'DESC' } });
    if (!plan) throw new BadRequestException('团餐单缺少已确认供餐方案');

    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : await this.contractRepo.findOne({ where: { enterpriseId: order.enterpriseId, status: 'ACTIVE' } });
    const contractRate = contract?.discount || 1;
    const deliverAt = new Date(order.deliverAt);
    const windowStart = deliverAt.getTime() + EAT_WINDOW_HOURS * 3600000;
    const windowEnd = deliverAt.getTime() + NEAR_LOOKUP_HOURS * 3600000;

    // 本单已有有效方案占用的覆盖量（防重复推荐 / 超量）
    const liveOffers = await this.offerRepo.find({ where: { orderId, status: In(LIVE_STATUSES) } });
    const offeredByProduct = new Map<number, number>();
    for (const o of liveOffers) {
      for (const it of o.items || []) {
        offeredByProduct.set(it.productId, (offeredByProduct.get(it.productId) || 0) + it.quantity);
      }
    }

    // 推荐目标：显式指定，或方案中全部主食行（正常价份数 = 总份数 - 方案自动临期份数）
    const explicit: any[] = (dto.items || []).filter((i: any) => i.productId && +i.quantity > 0);
    const targets = new Map<number, { productId: number; quantity: number }>();
    if (explicit.length) {
      for (const i of explicit) {
        const line = (plan.items as any[]).find(x => x.productId === +i.productId);
        if (!line) throw new BadRequestException('商品不在供餐方案明细中');
        if (!FOOD_CATEGORIES.includes(line.category)) throw new BadRequestException('仅便当/饭团/三明治主食可走临期调拨');
        const normalQty = line.quantity - (line.nearExpiryQty || 0) - (offeredByProduct.get(+i.productId) || 0);
        const qty = Math.min(+i.quantity, Math.max(0, normalQty));
        if (qty > 0) targets.set(+i.productId, { productId: +i.productId, quantity: qty });
      }
    } else {
      for (const line of plan.items as any[]) {
        if (!FOOD_CATEGORIES.includes(line.category)) continue;
        const normalQty = line.quantity - (line.nearExpiryQty || 0) - (offeredByProduct.get(line.productId) || 0);
        if (normalQty > 0) targets.set(line.productId, { productId: line.productId, quantity: normalQty });
      }
    }
    if (!targets.size) throw new BadRequestException('方案中已无可替换为临期折扣的正常价主食份数');

    // 候选门店：履约门店优先，周边 15km 按距离
    const stores = await this.storeRepo.find({ where: { status: 'OPEN' } });
    const ranked = stores
      .map(s => ({ store: s, distance: haversineKm(s.lat, s.lng, enterprise?.lat || 0, enterprise?.lng || 0) }))
      .filter(x => x.distance <= MAX_DISTANCE_KM)
      .sort((a, b) =>
        (a.store.id === order.storeId ? -1 : 0) - (b.store.id === order.storeId ? -1 : 0)
        || a.distance - b.distance);

    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const smap = new Map(stores.map(s => [s.id, s]));

    const items: any[] = [];
    const timeLines: any[] = [];
    let allPassed = true;

    for (const target of targets.values()) {
      let remain = target.quantity;
      // 逐门店、逐批次凑量：本店优先、到期最早优先（临期优先）
      for (const { store } of ranked) {
        if (remain <= 0) break;
        const batches = (await this.batchRepo.find({
          where: { storeId: store.id, productId: target.productId, status: 'AVAILABLE' },
          order: { expiresAt: 'ASC' },
        })).filter(b =>
          b.quantity > 0
          && b.expiresAt.getTime() > windowStart - 60000
          && b.expiresAt.getTime() <= windowEnd);
        for (const batch of batches) {
          if (remain <= 0) break;
          const use = Math.min(batch.quantity, remain);
          const remainHours = this.round2((batch.expiresAt.getTime() - deliverAt.getTime()) / 3600000);
          if (remainHours < EAT_WINDOW_HOURS) continue;
          const rate = this.discountRate(remainHours);
          const product = pmap.get(target.productId)!;
          const unitPrice = this.round2(Number(product.price) * contractRate);
          const discountPrice = this.round2(unitPrice * rate);
          const lineOriginal = this.round2(unitPrice * use);
          const lineFinal = this.round2(discountPrice * use);
          const crossStore = store.id !== order.storeId;
          items.push({
            productId: product.id,
            name: product.name,
            category: product.category,
            vegetarian: product.vegetarian,
            quantity: use,
            unitPrice,
            discountRate: rate,
            discountPrice,
            lineOriginal,
            lineFinal,
            lineSaving: this.round2(lineOriginal - lineFinal),
            batchId: batch.id,
            batchNo: batch.batchNo,
            sourceStoreId: store.id,
            sourceStoreName: store.name,
            crossStore,
            producedAt: batch.producedAt,
            expiresAt: batch.expiresAt,
            tempZone: batch.tempZone,
            remainHours,
          });
          timeLines.push({
            productName: product.name,
            batchNo: batch.batchNo,
            sourceStoreName: store.name,
            expiresAt: batch.expiresAt,
            remainHours,
            ok: remainHours >= EAT_WINDOW_HOURS,
            reason: `送达时仍有 ${remainHours} 小时食用窗口（要求 ≥${EAT_WINDOW_HOURS} 小时）`,
          });
          remain -= use;
        }
      }
      if (remain > 0) {
        // 该商品凑不齐：保留已凑部分，不阻断其它商品；记录一条未通过
        const p = pmap.get(target.productId);
        timeLines.push({
          productName: p?.name || `商品${target.productId}`,
          batchNo: null,
          sourceStoreName: null,
          expiresAt: null,
          remainHours: 0,
          ok: false,
          reason: `周边门店临期库存仅可覆盖 ${target.quantity - remain}/${target.quantity} 份，缺口 ${remain} 份仍按正常批次供应`,
        });
        allPassed = false;
      }
    }

    if (!items.length) {
      throw new BadRequestException('本店及周边 15km 门店暂无可在团餐时间内食用的临期便当批次，无法生成折扣方案');
    }

    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const originalAmount = this.round2(items.reduce((s, i) => s + i.lineOriginal, 0));
    const finalAmount = this.round2(items.reduce((s, i) => s + i.lineFinal, 0));
    const savingAmount = this.round2(originalAmount - finalAmount);
    const zones = items.map(i => i.tempZone);
    const tempControl = this.tempControlOf(zones);
    const minRate = Math.min(...items.map(i => i.discountRate));
    const afterSalesRules = this.buildRules(minRate);
    const crossStoreCount = items.filter(i => i.crossStore).length;
    const discountReason = `临期鲜食优先调拨：覆盖 ${totalQuantity} 份团餐主食，最低 ${minRate} 折。`
      + `涉及临期批次 ${items.length} 个${crossStoreCount ? `（含周边门店跨店调入 ${crossStoreCount} 个批次）` : ''}，`
      + `全部批次经团餐时间核验，送达时仍保留 ≥${EAT_WINDOW_HOURS} 小时食用窗口；为减少门店临期报损而折价，餐食仍在保质期内，非质量问题。`;
    const mealTimeCheck = {
      deliverAt,
      eatWindowHours: EAT_WINDOW_HOURS,
      nearLookupHours: NEAR_LOOKUP_HOURS,
      passed: allPassed,
      lines: timeLines,
    };

    // 复用待确认方案（覆盖更新），否则新建
    let offer = await this.offerRepo.findOne({
      where: { orderId, status: OfferStatus.PROPOSED }, order: { id: 'DESC' },
    });
    if (!offer) {
      offer = this.offerRepo.create({
        offerNo: this.genNo(), orderId, enterpriseId: order.enterpriseId,
        storeId: order.storeId, recommendedBy: user.id,
        recommendedByRole: user.role === UserRole.ADMIN ? 'ADMIN' : 'STORE',
      });
    }
    Object.assign(offer, {
      items, portions: [],
      originalAmount, finalAmount, savingAmount, totalQuantity,
      discountReason, tempControl, afterSalesRules, mealTimeCheck,
      transferIds: [], stockDeducted: false,
    });
    offer = await this.offerRepo.save(offer);

    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '🍱 临期鲜食折扣方案待您确认',
      content: `团餐单 ${order.orderNo} 可选用临期鲜食优先调拨：${totalQuantity} 份便当/饭团最低 ${minRate} 折，节省 ¥${savingAmount}。批次、温控与售后责任已拟好，请查看折扣原因与售后规则后确认；临期不等于质量问题，确认记录将进入月结附件。`,
      type: 'INVENTORY', orderId,
    });

    return this.detail(offer.id);
  }

  /**
   * 第二步：企业行政确认折扣方案（单事务）：
   *  二次校验并锁定批次（本店直接预扣；周边门店物理调拨生成在途批次与调拨留痕）→
   *  生成逐份餐食标记 → 折扣金额写入团餐单 → 固化企业确认快照 →
   *  通知门店（贴标/温控）、企业（售后规则）、财务（月结附件）。
   */
  async confirm(offerId: number, user: User) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    if (offer.status !== OfferStatus.PROPOSED) throw new BadRequestException('该方案已确认或已关闭');
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权确认其它企业的方案');
    }
    if (![OrderStatus.CONFIRMED, OrderStatus.PREPARING].includes(order.status as OrderStatus)) {
      throw new BadRequestException('团餐单当前状态不可确认临期方案');
    }

    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : null;
    const monthly = contract?.settlementType === 'MONTHLY';
    const deliverAt = new Date(order.deliverAt);
    const eatBefore = new Date(Math.min(
      deliverAt.getTime() + EAT_WINDOW_HOURS * 3600000,
      Math.min(...offer.items.map((i: any) => new Date(i.expiresAt).getTime())),
    ));

    const transferIds: number[] = [];
    const portions: any[] = [];
    let seq = 1;

    await this.dataSource.transaction(async (em) => {
      // 1) 逐批次二次校验、锁定库存
      for (const line of offer.items) {
        const affected = await em.createQueryBuilder()
          .update(InventoryBatch)
          .set({ quantity: () => `quantity - ${line.quantity}` })
          .where('id = :id AND quantity >= :qty AND status = :st',
            { id: line.batchId, qty: line.quantity, st: 'AVAILABLE' })
          .execute();
        if (!affected.affected) {
          throw new BadRequestException(`临期批次 ${line.batchNo} 库存刚被占用，请重新发起折扣推荐`);
        }
        await em.createQueryBuilder()
          .update(InventoryBatch).set({ status: 'DEPLETED' })
          .where('id = :id AND quantity = 0', { id: line.batchId }).execute();

        let fulfilledBatchId = line.batchId;
        if (line.crossStore) {
          // 周边门店：源店出库 + 履约门店生成同保质期批次 + 调拨留痕
          const src = await em.findOne(InventoryBatch, { where: { id: line.batchId } });
          const transfer = await em.save(em.create(Transfer, {
            batchId: src.id,
            productId: src.productId,
            fromStoreId: line.sourceStoreId,
            toStoreId: order.storeId,
            quantity: line.quantity,
            reason: `临期鲜食优先调拨（企业确认折扣方案 ${offer.offerNo}）`,
            status: 'ACCEPTED',
            handledAt: new Date(),
          }));
          transferIds.push(transfer.id);
          const inbound = await em.save(em.create(InventoryBatch, {
            batchNo: `${src.batchNo}-O${offer.id}`,
            storeId: order.storeId,
            productId: src.productId,
            quantity: line.quantity,
            initialQuantity: line.quantity,
            producedAt: src.producedAt,
            expiresAt: src.expiresAt,
            tempZone: src.tempZone,
            supplierId: src.supplierId,
            status: 'AVAILABLE',
          }));
          fulfilledBatchId = inbound.id;
          // 调入批次同样预扣（方案备货不再扣减）
          await em.createQueryBuilder()
            .update(InventoryBatch)
            .set({ quantity: () => `quantity - ${line.quantity}`, status: 'DEPLETED' })
            .where('id = :id', { id: inbound.id })
            .execute();
        }
        line.fulfilledBatchId = fulfilledBatchId;

        // 2) 逐份餐食标记（临期调拨标记到每份餐食）
        for (let k = 0; k < line.quantity; k++) {
          portions.push({
            code: `${offer.offerNo}-P${String(seq++).padStart(3, '0')}`,
            productId: line.productId,
            productName: line.name,
            batchNo: line.batchNo,
            inboundBatchNo: line.crossStore ? `${line.batchNo}-O${offer.id}` : null,
            sourceStoreName: line.sourceStoreName,
            tempZone: line.tempZone,
            tempZoneName: line.tempZone === 'HOT' ? '热链' : line.tempZone === 'CHILLED' ? '冷藏' : line.tempZone,
            producedAt: line.producedAt,
            expiresAt: line.expiresAt,
            eatBefore,
            discountRate: line.discountRate,
            discountPrice: line.discountPrice,
            unitPrice: line.unitPrice,
            discountReason: this.buildReason(line.sourceStoreName, new Date(line.expiresAt), deliverAt, line.discountRate),
            afterSalesRules: offer.afterSalesRules,
            label: `临期调拨 ${Math.round(line.discountRate * 10)} 折`,
          });
        }
      }

      // 3) 折扣金额写入团餐单（折后价替换对应正常价份数）
      const newTotal = this.round2(Number(order.totalAmount) - Number(offer.savingAmount));
      order.totalAmount = newTotal;
      await em.save(order);

      // 4) 固化企业确认快照（后续不可篡改，作为月结附件/售后说明凭据）
      offer.portions = portions;
      offer.transferIds = transferIds;
      offer.stockDeducted = true;
      offer.status = OfferStatus.CONFIRMED;
      offer.confirmedBy = user.id;
      offer.confirmedByName = user.name;
      offer.confirmedAt = new Date();
      offer.confirmationSnapshot = {
        offerNo: offer.offerNo,
        orderNo: order.orderNo,
        enterpriseId: order.enterpriseId,
        confirmedBy: user.id,
        confirmedByName: user.name,
        confirmedAt: offer.confirmedAt,
        totalQuantity: offer.totalQuantity,
        originalAmount: Number(offer.originalAmount),
        finalAmount: Number(offer.finalAmount),
        savingAmount: Number(offer.savingAmount),
        discountReason: offer.discountReason,
        tempControl: offer.tempControl,
        afterSalesRules: offer.afterSalesRules,
        mealTimeCheck: offer.mealTimeCheck,
        portions: portions.map(p => ({
          code: p.code, productName: p.productName, batchNo: p.batchNo,
          discountRate: p.discountRate, expiresAt: p.expiresAt, eatBefore: p.eatBefore,
        })),
        items: offer.items.map((i: any) => ({
          productName: i.name, quantity: i.quantity, batchNo: i.batchNo,
          sourceStoreName: i.sourceStoreName, discountRate: i.discountRate,
          unitPrice: i.unitPrice, discountPrice: i.discountPrice, tempZone: i.tempZone,
        })),
        settlementType: monthly ? 'MONTHLY' : 'PER_ORDER',
      };
      await em.save(offer);

      // 方案依据追加确认留痕
      const plan = await em.findOne(MealPlan, {
        where: { orderId: order.id, status: 'ACCEPTED' }, order: { version: 'DESC' },
      }) || await em.findOne(MealPlan, { where: { orderId: order.id }, order: { version: 'DESC' } });
      if (plan) {
        plan.reasons = [
          ...plan.reasons,
          `临期鲜食优先调拨 ${offer.totalQuantity} 份经企业行政 ${user.name} 确认（方案 ${offer.offerNo}，最低 ${Math.min(...offer.items.map((i: any) => i.discountRate))} 折，节省 ¥${offer.savingAmount}）：商品批次、折扣、温控与售后责任已写入团餐单，逐份餐食已贴临期标记，企业确认随月结附件与售后说明留存。`,
        ];
        await em.save(plan);
      }
    });

    // 5) 三方通知
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: `🔖 临期折扣方案 ${offer.offerNo} 企业已确认，请逐份贴标`,
      content: `团餐单 ${order.orderNo} 的 ${offer.totalQuantity} 份临期鲜食已获企业确认：请按温区要求（${offer.tempControl.requirement}）备货，取货前在拣货清单完成逐份「临期调拨」标记贴标（共 ${portions.length} 枚标签），${crossStoreText(offer)}并提醒企业 ${deliverAt.getHours()}:${String(deliverAt.getMinutes()).padStart(2, '0')} 送达后 ${EAT_WINDOW_HOURS} 小时内食用。`,
      type: 'INVENTORY', orderId: order.id,
    });
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '临期折扣方案已确认，售后规则已生效',
      content: `团餐单 ${order.orderNo} 临期鲜食 ${offer.totalQuantity} 份已确认，节省 ¥${offer.savingAmount}。每份餐食包装将贴「临期调拨」标签（含折扣原因与售后规则），请在送达后 ${EAT_WINDOW_HOURS} 小时内食用；临期为保质期内折价、非质量问题，确认记录已进入月结附件与售后说明，真实食安问题仍可正常维权。`,
      type: 'INVENTORY', orderId: order.id,
    });
    await this.notify.send({
      role: 'FINANCE',
      title: monthly ? '临期折扣企业确认将进入月结附件' : '临期折扣企业确认（单结，开票按折后金额）',
      content: `团餐单 ${order.orderNo} 方案 ${offer.offerNo}：${offer.totalQuantity} 份临期鲜食，原价 ¥${offer.originalAmount}、折后 ¥${offer.finalAmount}、企业确认节省 ¥${offer.savingAmount}。企业确认快照${monthly ? '将在账期归集时作为月结附件' : '随团餐单与售后说明留存'}。`,
      type: 'FINANCE', orderId: order.id,
    });

    return this.detail(offer.id);
  }

  /** 企业拒绝 */
  async reject(offerId: number, dto: any, user: User) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    if (offer.status !== OfferStatus.PROPOSED) throw new BadRequestException('该方案已关闭');
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权操作其它企业的方案');
    }
    offer.status = OfferStatus.REJECTED;
    offer.rejectedBy = user.id;
    offer.rejectedAt = new Date();
    offer.rejectReason = dto?.reason || '企业未接受临期折扣方案';
    await this.offerRepo.save(offer);
    await this.notify.send({
      role: 'STORE', storeId: order.storeId,
      title: '临期折扣方案未被企业接受',
      content: `团餐单 ${order.orderNo} 的方案 ${offer.offerNo} 企业未接受（${offer.rejectReason}），请按正常批次备货，临期库存可改走门店间调拨或零售折扣`,
      type: 'INVENTORY', orderId: order.id,
    });
    return this.detail(offer.id);
  }

  /** 门店逐份贴标确认：校验标签份数与方案一致，防止漏贴临期标记 */
  async label(offerId: number, dto: any, user: User) {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    if (user.role === UserRole.STORE && offer.storeId !== user.storeId) {
      throw new BadRequestException('该方案不属于贵店');
    }
    if (offer.status !== OfferStatus.CONFIRMED) throw new BadRequestException('当前状态不可贴标确认');
    const labelled = dto?.labelledQty == null ? offer.totalQuantity : Math.round(+dto.labelledQty);
    if (labelled !== offer.totalQuantity) {
      throw new BadRequestException(`临期标记份数不一致：应贴 ${offer.totalQuantity} 枚，实际填报 ${labelled} 枚，请逐份核对避免漏贴`);
    }
    offer.labelConfirmed = true;
    offer.labelledBy = user.id;
    offer.labelledAt = new Date();
    offer.labelNote = dto?.note || `已对 ${offer.totalQuantity} 份临期餐食逐份贴标（含折扣原因与售后规则）`;
    await this.offerRepo.save(offer);
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    await this.notify.send({
      enterpriseId: offer.enterpriseId,
      title: '临期餐食已逐份贴标',
      content: `团餐单 ${order.orderNo} 的 ${offer.totalQuantity} 份临期餐食已逐份贴标，企业端可查看每份餐食的折扣原因、建议食用时间与售后规则`,
      type: 'INVENTORY', orderId: offer.orderId,
    });
    return this.detail(offer.id);
  }

  async listByOrder(orderId: number) {
    const list = await this.offerRepo.find({ where: { orderId }, order: { id: 'DESC' } });
    return list;
  }

  async detail(id: number) {
    const offer = await this.offerRepo.findOne({ where: { id } });
    if (!offer) throw new NotFoundException('折扣方案不存在');
    const order = await this.orderRepo.findOne({ where: { id: offer.orderId } });
    const store = await this.storeRepo.findOne({ where: { id: offer.storeId } });
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: offer.enterpriseId } });
    const transfers = offer.transferIds?.length
      ? await this.transferRepo.find({ where: { id: In(offer.transferIds) } })
      : [];
    return {
      ...offer,
      orderNo: order?.orderNo,
      storeName: store?.name,
      enterpriseName: enterprise?.name,
      transfers,
    };
  }

  /** 门店拣货视角：待履约订单上的已确认临期折扣方案（贴标状态） */
  async pickOffers(storeId: number) {
    const offers = await this.offerRepo.find({
      where: { storeId, status: In([OfferStatus.CONFIRMED, OfferStatus.FULFILLED]) },
      order: { id: 'ASC' },
    });
    const orderIds = Array.from(new Set(offers.map(o => o.orderId)));
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) } })
      : [];
    const omap = new Map(orders.map(o => [o.id, o]));
    return offers.map(o => ({
      offerId: o.id,
      offerNo: o.offerNo,
      orderId: o.orderId,
      orderNo: omap.get(o.orderId)?.orderNo,
      deliverAt: omap.get(o.orderId)?.deliverAt,
      totalQuantity: o.totalQuantity,
      savingAmount: o.savingAmount,
      labelConfirmed: o.labelConfirmed,
      labelledAt: o.labelledAt,
      labelNote: o.labelNote,
      status: o.status,
      portions: o.portions,
      items: (o.items || []).map((i: any) => ({
        productName: i.name, quantity: i.quantity, batchNo: i.batchNo,
        sourceStoreName: i.sourceStoreName, crossStore: i.crossStore,
        discountRate: i.discountRate, tempZone: i.tempZone,
      })),
      tempControl: o.tempControl,
    }));
  }

  /** 售后匹配：某订单某批次是否命中企业已确认的临期折扣方案 */
  async matchBatch(orderId: number, batchIds: number[]) {
    const offers = await this.offerRepo.find({
      where: { orderId, status: In([OfferStatus.CONFIRMED, OfferStatus.FULFILLED]) },
    });
    const hits: any[] = [];
    for (const offer of offers) {
      for (const it of offer.items || []) {
        if (batchIds.includes(it.batchId) || (it.fulfilledBatchId && batchIds.includes(it.fulfilledBatchId))) {
          const codes = (offer.portions || [])
            .filter((p: any) => p.batchNo === it.batchNo)
            .map((p: any) => p.code);
          hits.push({
            offerId: offer.id,
            offerNo: offer.offerNo,
            batchNo: it.batchNo,
            productName: it.name,
            discountRate: it.discountRate,
            confirmedBy: offer.confirmedByName,
            confirmedAt: offer.confirmedAt,
            discountReason: offer.discountReason,
            afterSalesRules: offer.afterSalesRules,
            portionCodes: codes,
          });
        }
      }
    }
    return hits;
  }

  private async mustOrder(id: number, user: User) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('团餐单不存在');
    if (user.role === UserRole.ENTERPRISE && order.enterpriseId !== user.enterpriseId) {
      throw new BadRequestException('无权操作其它企业的团餐单');
    }
    if (user.role === UserRole.STORE && order.storeId !== user.storeId) {
      throw new BadRequestException('该团餐单非贵店供餐，仅可对本店团餐发起临期调拨');
    }
    return order;
  }
}

function crossStoreText(offer: NearExpiryOffer) {
  const n = (offer.items || []).filter((i: any) => i.crossStore).length;
  return n ? `其中 ${n} 个批次由周边门店临期调拨入店，请核对调拨批次号；` : '';
}
