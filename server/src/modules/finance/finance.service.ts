import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Invoice, Settlement } from '../../entities/finance.entity';
import { MealOrder, OrderStatus } from '../../entities/order.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Archive } from '../../entities/archive.entity';
import { Incident } from '../../entities/incident.entity';
import { NearExpiryOffer } from '../../entities/near-expiry.entity';
import { Store } from '../../entities/store.entity';
import { User, UserRole } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Settlement) private settlementRepo: Repository<Settlement>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(NearExpiryOffer) private offerRepo: Repository<NearExpiryOffer>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    private notify: NotificationService,
  ) {}

  async listInvoices(user: User, query: any) {
    const where: any = {};
    if (user.role === UserRole.ENTERPRISE) where.enterpriseId = user.enterpriseId;
    if (query.status) where.status = query.status;
    const list = await this.invoiceRepo.find({ where, order: { id: 'DESC' }, take: 200 });
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    return list.map(i => ({ ...i, enterpriseName: emap.get(i.enterpriseId) }));
  }

  /** 财务开票 */
  async issueInvoice(id: number, user: User) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('发票不存在');
    if (inv.status !== 'PENDING') throw new BadRequestException('仅待开状态可开票');
    inv.status = 'ISSUED';
    inv.issuedAt = new Date();
    await this.invoiceRepo.save(inv);
    await this.notify.send({
      enterpriseId: inv.enterpriseId,
      title: '发票已开具',
      content: `发票 ${inv.invoiceNo}（¥${inv.amount}）已开具，请注意查收`,
      type: 'FINANCE', orderId: inv.orderId,
    });
    return inv;
  }

  /** 发票信息错误 → 红冲重开 */
  async reissueInvoice(id: number, dto: any, user: User) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('发票不存在');
    if (!['ERROR', 'ISSUED'].includes(inv.status)) throw new BadRequestException('当前状态不可重开');
    inv.status = 'REISSUED';
    await this.invoiceRepo.save(inv);
    const reissued = this.invoiceRepo.create({
      invoiceNo: `INV${Date.now()}R`,
      enterpriseId: inv.enterpriseId,
      orderId: inv.orderId,
      settlementId: inv.settlementId,
      title: dto.title || inv.title,
      taxNo: dto.taxNo || inv.taxNo,
      amount: inv.amount,
      status: 'ISSUED',
      issuedAt: new Date(),
    });
    const saved = await this.invoiceRepo.save(reissued);
    // 档案记录发票错误次数
    if (inv.orderId) {
      const archive = await this.archiveRepo.findOne({ where: { orderId: inv.orderId } });
      if (archive) {
        archive.invoiceErrors += 1;
        await this.archiveRepo.save(archive);
      }
    }
    await this.notify.send({
      enterpriseId: inv.enterpriseId,
      title: '发票已重开',
      content: `原发票 ${inv.invoiceNo} 已红冲，新发票 ${saved.invoiceNo} 已开具`,
      type: 'FINANCE', orderId: inv.orderId,
    });
    return saved;
  }

  /** 月结：把企业当月已归档且未入账的团餐单归集为一张月结单 */
  async generateSettlement(enterpriseId: number, month: string) {
    let settlement = await this.settlementRepo.findOne({ where: { enterpriseId, month } });
    const orders = await this.orderRepo.find({
      where: { enterpriseId, status: OrderStatus.COMPLETED, settlementId: IsNull() },
    });
    const inMonth = orders.filter(o => {
      const d = new Date(o.updatedAt);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return ym === month;
    });
    if (!settlement) {
      settlement = this.settlementRepo.create({ enterpriseId, month, status: 'OPEN' });
    }
    if (['INVOICED', 'PAID'].includes(settlement.status)) {
      throw new BadRequestException('该账期已开票或已付款，不可重新归集');
    }
    settlement.orderCount = inMonth.length;
    settlement.totalAmount = Math.round(inMonth.reduce((s, o) => s + Number(o.actualAmount ?? o.totalAmount), 0) * 100) / 100;

    // 月结附件：归集账期内企业已确认的临期调拨折扣方案（企业确认凭据，随账期留存）
    const offers = inMonth.length
      ? await this.offerRepo.find({
        where: {
          enterpriseId,
          status: In(['CONFIRMED', 'FULFILLED']),
        },
      })
      : [];
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s.name]));
    const monthOrderIds = new Set(inMonth.map(o => o.id));
    const attachments = offers
      .filter(o => monthOrderIds.has(o.orderId))
      .map(o => ({
        offerId: o.id,
        offerNo: o.offerNo,
        orderId: o.orderId,
        storeId: o.storeId,
        storeName: smap.get(o.storeId),
        quantity: o.totalQuantity,
        originalAmount: Number(o.originalAmount),
        finalAmount: Number(o.finalAmount),
        savingAmount: Number(o.savingAmount),
        discountReason: o.discountReason,
        tempControl: o.tempControl,
        afterSalesRules: o.afterSalesRules,
        portionCount: (o.portions || []).length,
        confirmedBy: o.confirmedBy,
        confirmedByName: o.confirmedByName,
        confirmedAt: o.confirmedAt,
      }));
    settlement.attachments = attachments;
    const saved = await this.settlementRepo.save(settlement);
    for (const o of inMonth) {
      o.settlementId = saved.id;
      await this.orderRepo.save(o);
    }
    for (const o of offers.filter(x => monthOrderIds.has(x.orderId))) {
      o.attachedSettlementId = saved.id;
      await this.offerRepo.save(o);
    }
    return saved;
  }

  async listSettlements(user: User, query: any) {
    const where: any = {};
    if (user.role === UserRole.ENTERPRISE) where.enterpriseId = user.enterpriseId;
    if (query.enterpriseId) where.enterpriseId = +query.enterpriseId;
    const list = await this.settlementRepo.find({ where, order: { id: 'DESC' }, take: 100 });
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    return list.map(s => ({ ...s, enterpriseName: emap.get(s.enterpriseId) }));
  }

  async settlementOrders(id: number) {
    return this.orderRepo.find({ where: { settlementId: id } });
  }

  /** 企业确认月结单 */
  async confirmSettlement(id: number, user: User) {
    const s = await this.settlementRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('月结单不存在');
    if (s.status !== 'OPEN') throw new BadRequestException('当前状态不可确认');
    s.status = 'CONFIRMED';
    await this.settlementRepo.save(s);
    await this.notify.send({
      role: 'FINANCE',
      title: '月结单已确认',
      content: `企业已确认 ${s.month} 月结单（¥${s.totalAmount}），请开具发票`,
      type: 'FINANCE',
    });
    return s;
  }

  /** 财务对月结单开票 */
  async invoiceSettlement(id: number, user: User) {
    const s = await this.settlementRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('月结单不存在');
    if (s.status !== 'CONFIRMED') throw new BadRequestException('企业确认后才能开票');
    const enterprise = await this.enterpriseRepo.findOne({ where: { id: s.enterpriseId } });
    const inv = this.invoiceRepo.create({
      invoiceNo: `INV${Date.now()}M`,
      enterpriseId: s.enterpriseId,
      settlementId: s.id,
      title: enterprise?.invoiceTitle || enterprise?.name,
      taxNo: enterprise?.taxNo || '',
      amount: s.totalAmount,
      status: 'ISSUED',
      issuedAt: new Date(),
    });
    await this.invoiceRepo.save(inv);
    s.status = 'INVOICED';
    await this.settlementRepo.save(s);
    return { settlement: s, invoice: inv };
  }

  /** 财务登记回款 */
  async paySettlement(id: number, user: User) {
    const s = await this.settlementRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('月结单不存在');
    if (s.status !== 'INVOICED') throw new BadRequestException('请先开票');
    s.status = 'PAID';
    await this.settlementRepo.save(s);
    return s;
  }
}
