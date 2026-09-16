import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { Store, StoreShift } from '../../entities/store.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Product, CATEGORY_NAMES } from '../../entities/product.entity';
import { InventoryBatch } from '../../entities/inventory.entity';

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
