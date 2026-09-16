import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MealOrder } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive } from '../../entities/archive.entity';
import { User, UserRole } from '../../entities/user.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
  ) {}

  async summary(user: User) {
    const now = new Date();
    const soon = new Date(now.getTime() + 6 * 3600 * 1000);
    const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
    const out: any = { role: user.role };

    const orderQb = () => {
      const qb = this.orderRepo.createQueryBuilder('o');
      if (user.role === UserRole.ENTERPRISE) qb.where('o.enterpriseId = :eid', { eid: user.enterpriseId });
      if (user.role === UserRole.STORE) qb.where('o.storeId = :sid', { sid: user.storeId });
      return qb;
    };

    out.activeOrders = await orderQb()
      .andWhere("o.status NOT IN ('COMPLETED','CANCELLED','SIGNED')").getCount();
    out.todayOrders = await orderQb()
      .andWhere('o.deliverAt >= :t', { t: todayStart }).getCount();
    out.openIncidents = await this.incidentRepo.count({ where: [
      { status: 'OPEN' }, { status: 'PROCESSING' },
    ] as any }).catch(() => 0);

    if (user.role === UserRole.STORE || user.role === UserRole.ADMIN) {
      const where: any = user.storeId ? { storeId: user.storeId, status: 'AVAILABLE' } : { status: 'AVAILABLE' };
      const batches = await this.batchRepo.find({ where });
      out.nearExpiryQty = batches
        .filter(b => b.expiresAt > now && b.expiresAt <= soon)
        .reduce((s, b) => s + b.quantity, 0);
      out.stockQty = batches.reduce((s, b) => s + b.quantity, 0);
    }
    if (user.role === UserRole.LOGISTICS) {
      out.myTasks = await this.deliveryRepo.createQueryBuilder('d')
        .where('d.courierId = :uid', { uid: user.id })
        .andWhere("d.status NOT IN ('SIGNED','DELIVERED')").getCount();
    }
    if (user.role === UserRole.FINANCE || user.role === UserRole.ADMIN) {
      out.pendingInvoices = await this.invoiceRepo.count({ where: { status: 'PENDING' } });
      out.errorInvoices = await this.invoiceRepo.count({ where: { status: 'ERROR' } });
    }
    if (user.role === UserRole.ENTERPRISE) {
      const archives = await this.archiveRepo.find({ where: { enterpriseId: user.enterpriseId } });
      out.totalArchives = archives.length;
      out.onTimeRate = archives.length
        ? Math.round((archives.filter(a => a.onTime).length / archives.length) * 100) : 100;
    }
    if (user.role === UserRole.ADMIN) {
      out.totalOrders = await this.orderRepo.count();
      const archives = await this.archiveRepo.find();
      out.revenue = Math.round(archives.reduce((s, a) => s + Number(a.actualAmount || 0), 0) * 100) / 100;
      out.nearExpiryUsed = archives.reduce((s, a) => s + (a.nearExpiryUsed || 0), 0);
    }

    // 近 7 日订单趋势
    const trend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const count = await orderQb()
        .andWhere("to_char(o.createdAt, 'YYYY-MM-DD') = :k", { k: key })
        .getCount();
      trend.push({ date: key.slice(5), count });
    }
    out.trend = trend;
    return out;
  }
}
