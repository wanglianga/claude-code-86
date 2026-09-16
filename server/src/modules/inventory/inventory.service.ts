import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { InventoryBatch, Transfer } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Transfer) private transferRepo: Repository<Transfer>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    private notify: NotificationService,
  ) {}

  async listBatches(query: any, user?: any) {
    const where: any = {};
    if (query.storeId) where.storeId = +query.storeId;
    if (user?.storeId) where.storeId = user.storeId;
    if (query.status) where.status = query.status;
    const batches = await this.batchRepo.find({ where, order: { expiresAt: 'ASC' }, take: 300 });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const now = new Date();
    return batches.map(b => ({
      ...b,
      product: pmap.get(b.productId),
      nearExpiry: b.status === 'AVAILABLE' && b.expiresAt > now && b.expiresAt.getTime() - now.getTime() <= 6 * 3600 * 1000,
      expired: b.status === 'AVAILABLE' && b.expiresAt <= now,
    }));
  }

  async createBatch(dto: any, user: any) {
    const product = await this.productRepo.findOne({ where: { id: +dto.productId } });
    if (!product) throw new NotFoundException('商品不存在');
    const storeId = user.storeId || +dto.storeId;
    const batch = this.batchRepo.create({
      batchNo: dto.batchNo || `B${Date.now()}`,
      storeId,
      productId: product.id,
      quantity: +dto.quantity,
      initialQuantity: +dto.quantity,
      producedAt: new Date(dto.producedAt),
      expiresAt: new Date(dto.expiresAt),
      tempZone: dto.tempZone || product.tempZone,
      supplierId: dto.supplierId ?? null,
      status: 'AVAILABLE',
    });
    return this.batchRepo.save(batch);
  }

  async dispose(id: number, user: any) {
    const b = await this.batchRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('批次不存在');
    b.status = 'DISPOSED';
    await this.batchRepo.save(b);
    return b;
  }

  /** 临期批次（6 小时内到期） */
  async nearExpiry(storeId?: number) {
    const now = new Date();
    const soon = new Date(now.getTime() + 6 * 3600 * 1000);
    const where: any = { status: 'AVAILABLE', expiresAt: LessThan(soon) as any };
    const batches = await this.batchRepo.find({
      where: storeId
        ? { storeId, status: 'AVAILABLE', expiresAt: LessThan(soon) as any }
        : { status: 'AVAILABLE', expiresAt: LessThan(soon) as any },
      order: { expiresAt: 'ASC' },
    });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s]));
    return batches
      .filter(b => b.expiresAt > now && b.quantity > 0)
      .map(b => ({ ...b, product: pmap.get(b.productId), store: smap.get(b.storeId) }));
  }

  /** 发起临期调拨 */
  async createTransfer(dto: any, user: any) {
    const batch = await this.batchRepo.findOne({ where: { id: +dto.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const qty = +dto.quantity;
    if (qty <= 0 || qty > batch.quantity) throw new BadRequestException('调拨数量不合法');
    if (+dto.toStoreId === batch.storeId) throw new BadRequestException('不能调拨到本门店');
    const t = this.transferRepo.create({
      batchId: batch.id,
      productId: batch.productId,
      fromStoreId: batch.storeId,
      toStoreId: +dto.toStoreId,
      quantity: qty,
      reason: dto.reason || '临期鲜食调拨',
      status: 'PENDING',
    });
    const saved = await this.transferRepo.save(t);
    await this.notify.send({
      role: 'STORE', storeId: +dto.toStoreId,
      title: '收到临期调拨申请',
      content: `有 ${qty} 份临期鲜食申请调入贵店，请及时处理`,
      type: 'INVENTORY',
    });
    return saved;
  }

  async listTransfers(user: any) {
    const where: any[] = user.storeId
      ? [{ fromStoreId: user.storeId }, { toStoreId: user.storeId }]
      : [{}];
    const list = await this.transferRepo.find({ where, order: { id: 'DESC' }, take: 100 });
    const products = await this.productRepo.find();
    const pmap = new Map(products.map(p => [p.id, p]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s]));
    return list.map(t => ({
      ...t,
      product: pmap.get(t.productId),
      fromStore: smap.get(t.fromStoreId),
      toStore: smap.get(t.toStoreId),
    }));
  }

  async acceptTransfer(id: number, user: any) {
    const t = await this.transferRepo.findOne({ where: { id } });
    if (!t || t.status !== 'PENDING') throw new BadRequestException('调拨单状态不正确');
    const batch = await this.batchRepo.findOne({ where: { id: t.batchId } });
    if (!batch || batch.quantity < t.quantity) throw new BadRequestException('原批次库存不足');
    batch.quantity -= t.quantity;
    if (batch.quantity === 0) batch.status = 'DEPLETED';
    await this.batchRepo.save(batch);
    // 在目标门店生成新批次（沿用原保质期）
    const nb = this.batchRepo.create({
      batchNo: `${batch.batchNo}-T${t.id}`,
      storeId: t.toStoreId,
      productId: t.productId,
      quantity: t.quantity,
      initialQuantity: t.quantity,
      producedAt: batch.producedAt,
      expiresAt: batch.expiresAt,
      tempZone: batch.tempZone,
      supplierId: batch.supplierId,
      status: 'AVAILABLE',
    });
    await this.batchRepo.save(nb);
    t.status = 'ACCEPTED';
    t.handledAt = new Date();
    await this.transferRepo.save(t);
    await this.notify.send({
      role: 'STORE', storeId: t.fromStoreId,
      title: '临期调拨已被接收',
      content: `调拨单 #${t.id} 已被接收门店确认入库`,
      type: 'INVENTORY',
    });
    return t;
  }

  async rejectTransfer(id: number, user: any) {
    const t = await this.transferRepo.findOne({ where: { id } });
    if (!t || t.status !== 'PENDING') throw new BadRequestException('调拨单状态不正确');
    t.status = 'REJECTED';
    t.handledAt = new Date();
    await this.transferRepo.save(t);
    return t;
  }
}
