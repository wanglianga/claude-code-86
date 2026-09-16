import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Delivery } from '../../entities/delivery.entity';
import { MealOrder, OrderStatus } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { MealTopUp } from '../../entities/topup.entity';
import { User, UserRole } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Delivery) private repo: Repository<Delivery>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(MealTopUp) private topUpRepo: Repository<MealTopUp>,
    private notify: NotificationService,
  ) {}

  async list(user: User) {
    const qb = this.repo.createQueryBuilder('d').orderBy('d.id', 'DESC').take(100);
    if (user.role === UserRole.LOGISTICS) {
      qb.where('d.courierId = :uid', { uid: user.id });
    }
    const deliveries = await qb.getMany();
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s]));
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e]));
    return deliveries
      .filter(d => omap.has(d.orderId))
      .map(d => {
        const o = omap.get(d.orderId);
        return {
          ...d,
          order: o,
          store: o.storeId ? smap.get(o.storeId) : null,
          enterprise: emap.get(o.enterpriseId),
        };
      });
  }

  private async mustGet(id: number) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('配送单不存在');
    return d;
  }

  private mustMine(d: Delivery, user: User) {
    if (user.role === UserRole.LOGISTICS && d.courierId !== user.id) {
      throw new BadRequestException('该任务未指派给您');
    }
  }

  /** 出库：记录保温箱与路线 */
  async outbound(id: number, dto: any, user: User) {
    const d = await this.mustGet(id);
    this.mustMine(d, user);
    if (!['ASSIGNED', 'PENDING'].includes(d.status)) throw new BadRequestException('当前状态不可出库');
    if (user.role === UserRole.LOGISTICS && !d.courierId) d.courierId = user.id;
    d.thermalBoxNo = dto.thermalBoxNo || `BX-${d.orderId}`;
    d.route = dto.route || null;
    d.outboundAt = new Date();
    d.status = 'OUTBOUND';
    await this.repo.save(d);
    return d;
  }

  /** 门店取货 */
  async pickup(id: number, user: User) {
    const d = await this.mustGet(id);
    this.mustMine(d, user);
    if (d.status !== 'OUTBOUND') throw new BadRequestException('请先完成出库登记');
    d.pickedAt = new Date();
    d.status = 'PICKED';
    await this.repo.save(d);
    const order = await this.orderRepo.findOne({ where: { id: d.orderId } });
    order.status = OrderStatus.OUT_FOR_DELIVERY;
    await this.orderRepo.save(order);
    // 取货后：已确认/已贴标的临时加餐并入配送完成
    await this.topUpRepo.update(
      { orderId: order.id, status: In(['CONFIRMED', 'LABELLED']) },
      { status: 'FULFILLED' },
    );
    const labels = (d.specialLabels || []).filter((l: any) => l.source === 'TOPUP');
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '团餐配送中',
      content: `您的团餐单 ${order.orderNo} 已由仓配取货，正在配送途中${labels.length ? `；本单含 ${labels.length} 枚特殊餐标（素食/过敏），请签收人按标签核对` : ''}`,
      type: 'ORDER', orderId: order.id,
    });
    return d;
  }

  /** 送达：迟到自动触发异常工单 */
  async deliver(id: number, user: User) {
    const d = await this.mustGet(id);
    this.mustMine(d, user);
    if (d.status !== 'PICKED') throw new BadRequestException('请先取货');
    d.deliveredAt = new Date();
    d.status = 'DELIVERED';
    const order = await this.orderRepo.findOne({ where: { id: d.orderId } });
    const lateMs = d.deliveredAt.getTime() - new Date(order.deliverAt).getTime();
    if (lateMs > 15 * 60 * 1000) {
      d.late = true;
      const mins = Math.round(lateMs / 60000);
      await this.incidentRepo.save(this.incidentRepo.create({
        ticketNo: `GD${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
        orderId: order.id,
        type: 'DELIVERY_LATE',
        title: '配送迟到',
        description: `团餐单 ${order.orderNo} 比约定送达时间晚 ${mins} 分钟送达，请客服跟进企业安抚与赔付评估`,
        status: 'OPEN',
        priority: 'HIGH',
        createdByRole: 'SYSTEM',
      }));
      order.hasException = true;
      await this.notify.send({
        role: 'SERVICE',
        title: '异常工单：配送迟到',
        content: `团餐单 ${order.orderNo} 迟到 ${mins} 分钟，已自动生成工单`,
        type: 'INCIDENT', orderId: order.id,
      });
    }
    await this.repo.save(d);
    order.status = OrderStatus.DELIVERED;
    await this.orderRepo.save(order);
    await this.notify.send({
      enterpriseId: order.enterpriseId,
      title: '团餐已送达，请按特殊餐标核对签收',
      content: `您的团餐单 ${order.orderNo} 已送达，请核对数量${d.specialLabels?.length ? `与 ${d.specialLabels.length} 枚素食/过敏特殊餐标（按企业名单逐人核对）` : ''}后签收${d.topUpQty ? `，本单含临时追加 ${d.topUpQty} 份` : ''}`,
      type: 'ORDER', orderId: order.id,
    });
    return d;
  }
}
