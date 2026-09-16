import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Archive } from '../../entities/archive.entity';
import { MealOrder } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { Invoice } from '../../entities/finance.entity';

@Injectable()
export class EnterpriseService {
  constructor(
    @InjectRepository(Enterprise) private repo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
  ) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('企业不存在');
    const contracts = await this.contractRepo.find({ where: { enterpriseId: id } });
    return { ...e, contracts };
  }

  async update(id: number, dto: Partial<Enterprise>) {
    await this.repo.update({ id }, dto as any);
    return this.findOne(id);
  }

  async createContract(dto: Partial<Contract>) {
    const c = this.contractRepo.create(dto as any);
    return this.contractRepo.save(c);
  }

  async updateContract(id: number, dto: Partial<Contract>) {
    await this.contractRepo.update({ id }, dto as any);
    return this.contractRepo.findOne({ where: { id } });
  }

  /** 复购决策看板：历史准点率、售后次数、发票错误、餐食偏好 */
  async stats(id: number) {
    const archives = await this.archiveRepo.find({ where: { enterpriseId: id }, order: { archivedAt: 'DESC' } });
    const total = archives.length;
    const onTime = archives.filter(a => a.onTime).length;
    const afterSales = archives.reduce((s, a) => s + (a.incidentCount || 0), 0);
    const invoiceErrors = archives.reduce((s, a) => s + (a.invoiceErrors || 0), 0);
    const compensation = archives.reduce((s, a) => s + Number(a.compensation || 0), 0);
    const avgRating = total ? archives.reduce((s, a) => s + (a.rating || 0), 0) / total : 0;
    const totalSpend = archives.reduce((s, a) => s + Number(a.actualAmount || 0), 0);
    const nearExpiryUsed = archives.reduce((s, a) => s + (a.nearExpiryUsed || 0), 0);

    // 品类偏好统计（来自档案 items）
    const catCount: Record<string, number> = {};
    for (const a of archives) {
      for (const it of (a.items || [])) {
        catCount[it.category] = (catCount[it.category] || 0) + (it.quantity || 0);
      }
    }
    const categoryPreference = Object.entries(catCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const recentOrders = await this.orderRepo.find({
      where: { enterpriseId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const openIncidents = await this.incidentRepo
      .createQueryBuilder('i')
      .innerJoin(MealOrder, 'o', 'o.id = i.orderId AND o.enterpriseId = :id', { id })
      .where('i.status IN (:...st)', { st: ['OPEN', 'PROCESSING'] })
      .getCount();

    return {
      totalOrders: total,
      onTimeRate: total ? Math.round((onTime / total) * 100) : 100,
      afterSales,
      invoiceErrors,
      compensation: Math.round(compensation * 100) / 100,
      avgRating: Math.round(avgRating * 10) / 10,
      totalSpend: Math.round(totalSpend * 100) / 100,
      nearExpiryUsed,
      categoryPreference,
      recentOrders,
      openIncidents,
    };
  }
}
