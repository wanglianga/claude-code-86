import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { Store, StoreShift } from '../../entities/store.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Product, CATEGORY_NAMES } from '../../entities/product.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';

/** 临期判定：送达后 6 小时内到期 */
const NEAR_EXPIRY_HOURS = 6;
/** 临期折扣 */
const NEAR_EXPIRY_DISCOUNT = 0.7;
/** 配送半径 km */
const MAX_DISTANCE_KM = 15;

interface PlanItem {
  productId: number;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  nearExpiryQty: number;
  vegetarian: boolean;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(StoreShift) private shiftRepo: Repository<StoreShift>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
  ) {}

  /**
   * 生成供餐方案：综合 附近门店库存、鲜食生产批次、配送能力、临期商品、
   * 企业历史偏好、门店高峰时段，输出套餐明细 + 生成依据 + 平衡提醒。
   */
  async generate(order: MealOrder, excludeStoreIds: number[] = []) {
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : await this.contractRepo.findOne({ where: { enterpriseId: order.enterpriseId, status: 'ACTIVE' } });
    const discount = contract?.discount || 1;
    const stores = (await this.storeRepo.find({ where: { status: 'OPEN' } }))
      .filter(s => !excludeStoreIds.includes(s.id));
    const products = await this.productRepo.find({ where: { active: true } });
    const deliverAt = new Date(order.deliverAt);
    const dayStr = deliverAt.toISOString().slice(0, 10);
    const prefs = (enterprise?.preferences as any) || {};
    const likes: string[] = prefs.likes || [];
    const allergies: string[] = order.allergies || [];

    const safe = (p: Product) => !allergies.some(a => (p.allergens || []).includes(a));

    const candidates: any[] = [];
    for (const store of stores) {
      const distance = haversineKm(store.lat, store.lng, enterprise?.lat || 0, enterprise?.lng || 0);
      if (distance > MAX_DISTANCE_KM) continue;

      // 配送/产能：当日已承接团餐份数
      const dayStart = new Date(dayStr + 'T00:00:00Z');
      const dayEnd = new Date(dayStr + 'T23:59:59Z');
      const dayOrders = await this.orderRepo.createQueryBuilder('o')
        .where('o.storeId = :sid', { sid: store.id })
        .andWhere('o.deliverAt BETWEEN :s AND :e', { s: dayStart, e: dayEnd })
        .andWhere("o.status NOT IN ('CANCELLED','DRAFT')")
        .getMany();
      const usedCapacity = dayOrders.reduce((s, o) => s + o.headcount, 0);
      const remainingCapacity = store.dailyCapacity - usedCapacity;

      // 排班缺员
      const shift = await this.shiftRepo.findOne({ where: { storeId: store.id, date: dayStr } });
      const staffShort = shift ? Math.max(0, shift.requiredStaff - shift.actualStaff) : 0;

      // 可用批次：送达时仍在保质期内（留 30 分钟缓冲）
      const usableBefore = new Date(deliverAt.getTime() - 30 * 60 * 1000);
      const batches = (await this.batchRepo.find({ where: { storeId: store.id, status: 'AVAILABLE' } }))
        .filter(b => b.quantity > 0 && b.expiresAt > usableBefore);
      const stockByProduct = new Map<number, { normal: number; nearExpiry: number }>();
      for (const b of batches) {
        const cur = stockByProduct.get(b.productId) || { normal: 0, nearExpiry: 0 };
        const near = b.expiresAt.getTime() - deliverAt.getTime() <= NEAR_EXPIRY_HOURS * 3600 * 1000;
        if (near) cur.nearExpiry += b.quantity; else cur.normal += b.quantity;
        stockByProduct.set(b.productId, cur);
      }

      const menu = this.buildMenu(order, products, stockByProduct, safe, likes, discount);
      if (!menu.ok) {
        candidates.push({ store, distance, fail: menu.reason, remainingCapacity });
        continue;
      }

      // 评分：临期消化加分、距离减分、产能紧张减分、偏好命中加分、缺员减分
      const nearExpiryUsed = menu.items.reduce((s, i) => s + i.nearExpiryQty, 0);
      const prefHits = menu.items.filter(i => likes.includes(i.category)).length;
      const capacityRate = remainingCapacity > 0 ? order.headcount / remainingCapacity : 1;
      const score = 100
        - distance * 2
        + nearExpiryUsed * 1.5
        + prefHits * 3
        - (capacityRate > 0.8 ? 25 : capacityRate > 0.5 ? 10 : 0)
        - staffShort * 8;

      candidates.push({ store, distance, menu, remainingCapacity, staffShort, shift, score, nearExpiryUsed });
    }

    const feasible = candidates.filter(c => c.menu && c.remainingCapacity >= order.headcount);
    if (feasible.length === 0) {
      return { ok: false, candidates, reason: '附近门店库存或产能不足，无法覆盖本单需求' };
    }
    feasible.sort((a, b) => b.score - a.score);
    const best = feasible[0];

    // 组装说明与提醒
    const reasons: string[] = [];
    reasons.push(`优选「${best.store.name}」供餐：距企业 ${best.distance.toFixed(1)}km，当日剩余团餐产能 ${best.remainingCapacity} 份`);
    if (best.nearExpiryUsed > 0) {
      const saved = best.menu.items.reduce((s, i) => s + i.nearExpiryQty * i.unitPrice * (1 / NEAR_EXPIRY_DISCOUNT - 1), 0);
      reasons.push(`优先消化临期鲜食 ${best.nearExpiryUsed} 份（临期 ${Math.round(NEAR_EXPIRY_DISCOUNT * 10)} 折），为企业节省约 ¥${saved.toFixed(2)}，减少门店损耗`);
    }
    if (likes.length) reasons.push(`已按企业历史偏好（${likes.map(c => CATEGORY_NAMES[c] || c).join('、')}）搭配套餐`);
    if (order.vegetarianCount > 0) reasons.push(`含素食 ${order.vegetarianCount} 份，单独装配并标注`);
    if (allergies.length) reasons.push(`已剔除含过敏原（${allergies.join('、')}）的商品`);
    if (discount < 1) reasons.push(`适用长期合同折扣 ${(discount * 10).toFixed(1)} 折`);

    const warnings: string[] = [];
    const capacityRate = order.headcount / best.store.dailyCapacity;
    if (capacityRate >= 0.5) {
      warnings.push(`本单占门店日产能 ${Math.round(capacityRate * 100)}%，请门店平衡团餐备货与散客销售，避免午高峰断货`);
    }
    const peakHit = (best.store.peakHours || []).some((p: any) => {
      const hm = `${String(deliverAt.getHours()).padStart(2, '0')}:${String(deliverAt.getMinutes()).padStart(2, '0')}`;
      return hm >= p.start && hm <= p.end;
    });
    if (peakHit) warnings.push('送达时间处于门店散客高峰时段，建议错峰备货或预约专用取餐通道，减少对散客的影响');
    if (best.staffShort > 0) warnings.push(`门店当日排班缺员 ${best.staffShort} 人，请仓配与门店提前确认取货窗口`);
    if (best.nearExpiryUsed > 0) warnings.push('套餐含临期鲜食，请门店优先装配、仓配全程冷链保温，送达后请企业尽快食用');

    return {
      ok: true,
      storeId: best.store.id,
      storeName: best.store.name,
      distance: Math.round(best.distance * 10) / 10,
      items: best.menu.items,
      totalPrice: best.menu.totalPrice,
      reasons,
      warnings,
    };
  }

  /** 按预算/人数/素食/过敏原/库存组餐 */
  private buildMenu(
    order: MealOrder,
    products: Product[],
    stock: Map<number, { normal: number; nearExpiry: number }>,
    safe: (p: Product) => boolean,
    likes: string[],
    discount: number,
  ): { ok: boolean; reason?: string; items?: PlanItem[]; totalPrice?: number } {
    const need = order.headcount;
    const budgetTotal = Number(order.mealBudget) * need;
    const items: PlanItem[] = [];

    const take = (list: Product[], qty: number): PlanItem[] | null => {
      const out: PlanItem[] = [];
      let remain = qty;
      for (const p of list) {
        if (remain <= 0) break;
        const s = stock.get(p.id) || { normal: 0, nearExpiry: 0 };
        const avail = s.normal + s.nearExpiry;
        if (avail <= 0) continue;
        const use = Math.min(avail, remain);
        const nearQty = Math.min(s.nearExpiry, use);
        out.push({
          productId: p.id, name: p.name, category: p.category,
          quantity: use,
          unitPrice: Math.round(Number(p.price) * discount * 100) / 100,
          nearExpiryQty: nearQty,
          vegetarian: p.vegetarian,
        });
        remain -= use;
      }
      return remain > 0 ? null : out;
    };

    const byCat = (cats: string[], vegetarian: boolean | null) => {
      const list = products.filter(p => cats.includes(p.category) && safe(p)
        && (vegetarian === null || p.vegetarian === vegetarian));
      // 偏好品类优先，其次价格低优先（控制预算）
      return list.sort((a, b) => {
        const la = likes.includes(a.category) ? 0 : 1;
        const lb = likes.includes(b.category) ? 0 : 1;
        if (la !== lb) return la - lb;
        return Number(a.price) - Number(b.price);
      });
    };

    // 1) 主食：素食 + 非素食
    const vegCount = Math.min(order.vegetarianCount || 0, need);
    if (vegCount > 0) {
      const vegItems = take(byCat(['BENTO', 'SANDWICH', 'RICE_BALL'], true), vegCount);
      if (!vegItems) return { ok: false, reason: '素食主食库存不足' };
      items.push(...vegItems);
    }
    const meatItems = take(byCat(['BENTO', 'SANDWICH', 'RICE_BALL'], false), need - vegCount);
    if (!meatItems) return { ok: false, reason: '主食（便当/三明治/饭团）库存不足' };
    items.push(...meatItems);

    // 2) 饮料：每人 1 份
    const drinkItems = take(byCat(['DRINK'], null), need);
    if (!drinkItems) return { ok: false, reason: '饮料库存不足' };
    items.push(...drinkItems);

    const sum = () => items.reduce((s, i) => {
      const normalQty = i.quantity - i.nearExpiryQty;
      return s + normalQty * i.unitPrice + i.nearExpiryQty * i.unitPrice * NEAR_EXPIRY_DISCOUNT;
    }, 0);

    // 3) 预算允许则加水果（每人 1 份）
    if (sum() + need * 6 <= budgetTotal) {
      const fruit = take(byCat(['FRUIT'], null), need);
      if (fruit) items.push(...fruit);
    }
    // 4) 预算允许则加咖啡（约 40% 人数）
    const coffeeQty = Math.floor(need * 0.4);
    if (coffeeQty > 0 && sum() + coffeeQty * 12 <= budgetTotal) {
      const coffee = take(byCat(['COFFEE'], null), coffeeQty);
      if (coffee) items.push(...coffee);
    }

    const total = sum();
    if (total > budgetTotal * 1.05) {
      return { ok: false, reason: `套餐成本 ¥${total.toFixed(2)} 超出餐标预算 ¥${budgetTotal.toFixed(2)}` };
    }
    return { ok: true, items, totalPrice: Math.round(total * 100) / 100 };
  }

  /** 套餐金额（同 buildMenu 口径：正常份原价，临期份 7 折） */
  private amountOf(items: any[]) {
    return Math.round(items.reduce((s: number, i: any) => {
      const near = i.nearExpiryQty || 0;
      return s + (i.quantity - near) * Number(i.unitPrice) + near * Number(i.unitPrice) * NEAR_EXPIRY_DISCOUNT;
    }, 0) * 100) / 100;
  }

  /**
   * 临时加餐可行性核查（送达前临时加人）。
   *
   * 对「原门店 + 周边 15km 门店」逐店核查：
   *  1. 周边门店库存（送达时仍在保质期内的可用批次，且排除本单已预占/已扣减的加餐）
   *  2. 制作批次（优先临期批次）与组餐可行性（追加人数/素食/过敏忌口）
   *  3. 门店当日剩余团餐产能
   *  4. 配送容量（原保温箱剩余份数；不足则给出加派结论与加派费）
   *  5. 发票金额（原发票金额 + 追加餐费 + 加派费 → 差额）
   *
   * 纯读操作，不落库、不扣库存。
   */
  async evaluateTopUp(
    order: MealOrder,
    dto: { addHeadcount: number; addVegetarianCount: number; addAllergies: string[]; roster: any[] },
  ) {
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: order.enterpriseId } });
    const contract = order.contractId
      ? await this.contractRepo.findOne({ where: { id: order.contractId } })
      : await this.contractRepo.findOne({ where: { enterpriseId: order.enterpriseId, status: 'ACTIVE' } });
    const discount = contract?.discount || 1;
    const products = await this.productRepo.find({ where: { active: true } });

    const deliverAt = new Date(order.deliverAt);
    const usableBefore = new Date(deliverAt.getTime() - 30 * 60 * 1000);
    const nearLimit = deliverAt.getTime() + NEAR_EXPIRY_HOURS * 3600 * 1000;

    // 追加餐忌口 = 追加忌口与原单忌口并集（原单剔除规则必须继续成立）
    const allergies = Array.from(new Set([...(order.allergies || []), ...(dto.addAllergies || [])]));
    const safe = (p: Product) => !allergies.some(a => (p.allergens || []).includes(a));
    const prefs = (enterprise?.preferences as any) || {};
    const likes: string[] = prefs.likes || [];

    // 临时加餐订单（用于复用组餐引擎；预算沿用原单人均餐标，确保不加价超餐标）
    const addOrder = {
      headcount: dto.addHeadcount,
      vegetarianCount: dto.addVegetarianCount,
      mealBudget: order.mealBudget,
      allergies,
    } as MealOrder;

    // 原方案尚未扣减库存（CONFIRMED/PREPARING）时，核查需为原单预留库存，
    // 避免临时加餐抢占原单备货；READY 后原单已扣减，库存为实时余量。
    const reserveByProduct = new Map<number, number>();
    if (order.status !== 'READY') {
      const basePlan = await this.planRepo.findOne({
        where: { orderId: order.id, status: 'ACCEPTED' }, order: { version: 'DESC' },
      });
      for (const it of basePlan?.items || []) {
        reserveByProduct.set(it.productId, (reserveByProduct.get(it.productId) || 0) + it.quantity);
      }
    }

    // 配送容量：原单总份数 + 追加份数 vs 保温箱容量
    const delivery = await this.deliveryRepo.findOne({ where: { orderId: order.id } });
    const boxCapacity = delivery?.boxCapacity || 60;
    const originQty = order.headcount;
    const totalAfter = originQty + dto.addHeadcount;
    const overflow = Math.max(0, totalAfter - boxCapacity);
    const extraDispatchFee = overflow > 0 ? 15 : 0; // 加派保温箱/骑手服务费

    // 周边门店（含原门店），按距离排序，原门店优先
    const stores = await this.storeRepo.find({ where: { status: 'OPEN' } });
    const enriched = stores
      .map(s => ({ store: s, distance: haversineKm(s.lat, s.lng, enterprise?.lat || 0, enterprise?.lng || 0) }))
      .filter(x => x.distance <= MAX_DISTANCE_KM)
      .sort((a, b) => (a.store.id === order.storeId ? -1 : b.store.id === order.storeId ? 1 : a.distance - b.distance));

    // 注：已确认加餐在确认时已物理扣减批次库存、并已累加进订单 headcount，
    // 因此这里直接读取实时批次数量与订单人数即可，无需再二次排除。

    const dayStr = deliverAt.toISOString().slice(0, 10);
    const dayStart = new Date(dayStr + 'T00:00:00Z');
    const dayEnd = new Date(dayStr + 'T23:59:59Z');

    const checks: any[] = [];

    for (const { store, distance } of enriched) {
      // 当日已承接团餐份数（订单人数已包含历史加餐）
      const dayOrders = await this.orderRepo.createQueryBuilder('o')
        .where('o.storeId = :sid', { sid: store.id })
        .andWhere('o.deliverAt BETWEEN :s AND :e', { s: dayStart, e: dayEnd })
        .andWhere("o.status NOT IN ('CANCELLED','DRAFT')")
        .getMany();
      const usedCapacity = dayOrders.reduce((s, o) => s + o.headcount, 0);
      const remainingCapacity = store.dailyCapacity - usedCapacity;
      const capacityOk = remainingCapacity >= dto.addHeadcount;

      const shift = await this.shiftRepo.findOne({ where: { storeId: store.id, date: dayStr } });
      const staffShort = shift ? Math.max(0, shift.requiredStaff - shift.actualStaff) : 0;

      // 可用批次池（送达时未过期；数量为确认加餐扣减后的实时值）
      const batches = (await this.batchRepo.find({
        where: { storeId: store.id, status: 'AVAILABLE' },
        order: { expiresAt: 'ASC' },
      })).filter(b => b.quantity > 0 && b.expiresAt > usableBefore);

      const stockByProduct = new Map<number, { normal: number; nearExpiry: number }>();
      const batchPool = new Map<number, { id: number; left: number; near: boolean }[]>();
      for (const b of batches) {
        // 原门店需为尚未扣减的原方案预留库存（临期优先预留，与备货出库口径一致）
        let left = b.quantity;
        if (store.id === order.storeId && reserveByProduct.has(b.productId)) {
          const reserve = Math.min(left, reserveByProduct.get(b.productId)!);
          reserveByProduct.set(b.productId, reserveByProduct.get(b.productId)! - reserve);
          left -= reserve;
          if (left <= 0) continue;
        }
        const near = b.expiresAt.getTime() <= nearLimit;
        const cur = stockByProduct.get(b.productId) || { normal: 0, nearExpiry: 0 };
        if (near) cur.nearExpiry += left; else cur.normal += left;
        stockByProduct.set(b.productId, cur);
        const list = batchPool.get(b.productId) || [];
        list.push({ id: b.id, left, near });
        batchPool.set(b.productId, list);
      }

      const menu = this.buildMenu(addOrder, products, stockByProduct, safe, likes, discount);

      // 批次级分配方案（临期优先），供确认时扣减
      const allocations: any[] = [];
      let stockOk = !!menu.ok;
      if (menu.ok) {
        for (const item of menu.items!) {
          let remain = item.quantity;
          let nearQty = 0;
          const pools = (batchPool.get(item.productId) || []).slice().sort((a, b) => Number(b.near) - Number(a.near));
          for (const p of pools) {
            if (remain <= 0) break;
            const use = Math.min(p.left, remain);
            if (use <= 0) continue;
            p.left -= use;
            remain -= use;
            if (p.near) nearQty += use;
            allocations.push({ batchId: p.id, productId: item.productId, quantity: use, nearExpiryQty: p.near ? use : 0 });
          }
          if (remain > 0) { stockOk = false; break; }
          // 合并同批次分配
          item.nearExpiryQty = nearQty;
        }
      }
      const mergedAlloc = this.mergeAllocations(allocations);

      const addAmount = menu.ok ? this.amountOf(menu.items!) : 0;
      checks.push({
        storeId: store.id,
        storeName: store.name,
        distance: Math.round(distance * 10) / 10,
        origin: store.id === order.storeId,
        stockOk: !!menu.ok && stockOk,
        capacityOk,
        remainingCapacity,
        staffShort,
        failReason: !menu.ok ? menu.reason : (!stockOk ? '批次库存被占用，请稍后重试' : null),
        items: menu.ok ? menu.items : [],
        allocations: mergedAlloc,
        addAmount,
        nearExpiryQty: menu.ok ? menu.items!.reduce((s, i) => s + (i.nearExpiryQty || 0), 0) : 0,
      });
    }

    // 选择可行门店：原门店优先，其次距离最近；库存与产能须同时满足
    const feasible = checks.filter(c => c.stockOk && c.capacityOk)
      .sort((a, b) => Number(b.origin) - Number(a.origin) || a.distance - b.distance);
    const best = feasible[0] || null;

    // 特殊餐标
    const vegLabels = dto.addVegetarianCount;
    const allergyLabels = (dto.roster || []).filter(r => r.tag && String(r.tag).startsWith('过敏')).length;

    const invoiceBefore = Number(order.totalAmount);
    const addAmount = best ? best.addAmount : 0;
    const totalDiff = Math.round((addAmount + extraDispatchFee) * 100) / 100;
    const invoiceAfter = Math.round((invoiceBefore + totalDiff) * 100) / 100;

    return {
      ok: !!best,
      reason: best ? null : '周边门店库存、制作批次或产能均无法覆盖本次临时加餐，请客服协调调拨或与企业协商调整份数/送达时间',
      addHeadcount: dto.addHeadcount,
      addVegetarianCount: dto.addVegetarianCount,
      addAllergies: allergies,
      roster: dto.roster || [],
      storeId: best?.storeId,
      storeName: best?.storeName,
      distance: best?.distance,
      useOriginStore: best ? best.origin : false,
      items: best?.items || [],
      allocations: best?.allocations || [],
      addAmount,
      extraDispatchFee,
      totalDiff,
      invoiceBefore,
      invoiceAfter,
      nearExpiryQty: best?.nearExpiryQty || 0,
      checks,
      deliveryCapacity: {
        boxCapacity,
        originQty,
        totalAfter,
        overflow,
        extraDispatch: overflow > 0,
        fee: extraDispatchFee,
      },
      labels: { vegetarian: vegLabels, allergy: allergyLabels, total: vegLabels + allergyLabels },
    };
  }

  private mergeAllocations(allocations: any[]) {
    const m = new Map<number, any>();
    for (const a of allocations) {
      const cur = m.get(a.batchId) || { batchId: a.batchId, productId: a.productId, quantity: 0, nearExpiryQty: 0 };
      cur.quantity += a.quantity;
      cur.nearExpiryQty += a.nearExpiryQty;
      m.set(a.batchId, cur);
    }
    return Array.from(m.values());
  }

  /** 落库一个新方案版本 */
  async persistPlan(order: MealOrder, excludeStoreIds: number[] = []) {
    const result = await this.generate(order, excludeStoreIds);
    const version = (await this.planRepo.count({ where: { orderId: order.id } })) + 1;
    if (!result.ok) {
      return { ok: false as const, reason: result.reason, candidates: result.candidates };
    }
    const plan = this.planRepo.create({
      orderId: order.id,
      storeId: result.storeId,
      items: result.items,
      totalPrice: result.totalPrice,
      reasons: result.reasons,
      warnings: result.warnings,
      version,
      status: 'PROPOSED',
    });
    const saved = await this.planRepo.save(plan);
    return { ok: true as const, plan: saved, storeName: result.storeName, distance: result.distance };
  }
}
