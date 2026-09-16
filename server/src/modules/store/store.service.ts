import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store, StoreShift } from '../../entities/store.entity';
import { MealOrder } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store) private repo: Repository<Store>,
    @InjectRepository(StoreShift) private shiftRepo: Repository<StoreShift>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
  ) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('门店不存在');
    return s;
  }

  async update(id: number, dto: Partial<Store>) {
    await this.repo.update({ id }, dto as any);
    return this.findOne(id);
  }

  async createShift(dto: Partial<StoreShift>) {
    const exist = await this.shiftRepo.findOne({ where: { storeId: dto.storeId, date: dto.date } });
    if (exist) {
      await this.shiftRepo.update({ id: exist.id }, dto as any);
      return this.shiftRepo.findOne({ where: { id: exist.id } });
    }
    return this.shiftRepo.save(this.shiftRepo.create(dto as any));
  }

  shifts(storeId: number) {
    return this.shiftRepo.find({ where: { storeId }, order: { date: 'DESC' }, take: 30 });
  }

  /** 门店平衡看板：团餐备货 / 散客销售 / 临期处理 */
  async balance(storeId: number, date?: string) {
    const store = await this.findOne(storeId);
    const day = date || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(day + 'T00:00:00');
    const dayEnd = new Date(day + 'T23:59:59');

    const orders = await this.orderRepo.createQueryBuilder('o')
      .where('o.storeId = :storeId', { storeId })
      .andWhere('o.deliverAt BETWEEN :s AND :e', { s: dayStart, e: dayEnd })
      .andWhere("o.status NOT IN ('CANCELLED')")
      .getMany();
    const groupMealLoad = orders.reduce((s, o) => s + o.headcount, 0);
    const capacity = store.dailyCapacity;
    const usageRate = capacity ? Math.round((groupMealLoad / capacity) * 100) : 0;

    // 临期批次（6 小时内到期）
    const now = new Date();
    const soon = new Date(now.getTime() + 6 * 3600 * 1000);
    const nearExpiryBatches = await this.batchRepo.createQueryBuilder('b')
      .where('b.storeId = :storeId', { storeId })
      .andWhere("b.status = 'AVAILABLE'")
      .andWhere('b.expiresAt <= :soon', { soon })
      .andWhere('b.expiresAt > :now', { now })
      .getMany();
    const nearExpiryQty = nearExpiryBatches.reduce((s, b) => s + b.quantity, 0);

    const shift = await this.shiftRepo.findOne({ where: { storeId, date: day } });

    const suggestions: string[] = [];
    if (usageRate >= 80) suggestions.push(`团餐备货已占门店日产能 ${usageRate}%，建议分流部分订单到邻近门店，避免影响散客销售`);
    else if (usageRate >= 50) suggestions.push(`团餐备货占日产能 ${usageRate}%，午高峰请预留散客商品，注意收银与出餐动线`);
    if (nearExpiryQty > 0) suggestions.push(`当前有 ${nearExpiryQty} 份鲜食将在 6 小时内到期，建议优先用于团餐套餐或发起临期调拨/折扣`);
    if (shift && shift.actualStaff < shift.requiredStaff) suggestions.push(`当日排班缺员 ${shift.requiredStaff - shift.actualStaff} 人（应到 ${shift.requiredStaff} 实到 ${shift.actualStaff}），请提前协调备货与取餐窗口`);
    const peak = (store.peakHours || []).map((p: any) => `${p.start}-${p.end}`).join('、');
    if (peak) suggestions.push(`散客高峰时段：${peak}，团餐取餐请避开或设置专用取餐通道`);
    if (suggestions.length === 0) suggestions.push('当前团餐、散客与临期处理处于平衡状态');

    return {
      store, date: day, groupMealLoad, capacity, usageRate,
      nearExpiryQty, nearExpiryBatches,
      shift, orderCount: orders.length, suggestions,
    };
  }
}
