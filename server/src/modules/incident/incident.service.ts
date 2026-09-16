import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident, IncidentLog, INCIDENT_TYPE_NAMES } from '../../entities/incident.entity';
import { MealOrder } from '../../entities/order.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive } from '../../entities/archive.entity';
import { User, UserRole, ROLE_NAMES } from '../../entities/user.entity';
import { OrderService } from '../order/order.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class IncidentService {
  constructor(
    @InjectRepository(Incident) private repo: Repository<Incident>,
    @InjectRepository(IncidentLog) private logRepo: Repository<IncidentLog>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    private orderService: OrderService,
    private notify: NotificationService,
  ) {}

  async list(user: User, query: any) {
    const qb = this.repo.createQueryBuilder('i').orderBy('i.id', 'DESC').take(200);
    if (query.status) qb.andWhere('i.status = :st', { st: query.status });
    if (query.type) qb.andWhere('i.type = :tp', { tp: query.type });
    if (query.orderId) qb.andWhere('i.orderId = :oid', { oid: +query.orderId });
    if (user.role === UserRole.ENTERPRISE) {
      qb.innerJoin(MealOrder, 'o', 'o.id = i.orderId AND o.enterpriseId = :eid', { eid: user.enterpriseId });
    }
    const list = await qb.getMany();
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    return list.map(i => ({ ...i, order: omap.get(i.orderId) }));
  }

  async detail(id: number) {
    const incident = await this.repo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('工单不存在');
    const logs = await this.logRepo.find({ where: { incidentId: id }, order: { id: 'ASC' } });
    const order = await this.orderRepo.findOne({ where: { id: incident.orderId } });
    return { ...incident, logs, order };
  }

  async create(dto: any, user: User) {
    const order = await this.orderRepo.findOne({ where: { id: +dto.orderId } });
    if (!order) throw new NotFoundException('团餐单不存在');
    const incident = this.repo.create({
      ticketNo: `GD${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
      orderId: order.id,
      type: dto.type,
      title: dto.title || INCIDENT_TYPE_NAMES[dto.type] || '异常',
      description: dto.description || '',
      status: 'OPEN',
      priority: dto.priority || 'MEDIUM',
      createdBy: user.id,
      createdByRole: user.role,
    });
    const saved = await this.repo.save(incident);
    await this.addLog(saved.id, user, 'CREATED', `创建工单：${saved.title}`);
    order.hasException = true;
    await this.orderRepo.save(order);
    await this.notify.send({
      role: 'SERVICE',
      title: `新异常工单：${saved.title}`,
      content: `团餐单 ${order.orderNo} 出现「${INCIDENT_TYPE_NAMES[saved.type] || saved.type}」，请客服牵头协同处理`,
      type: 'INCIDENT', orderId: order.id,
    });
    return this.detail(saved.id);
  }

  private async addLog(incidentId: number, user: User, action: string, note?: string) {
    await this.logRepo.save(this.logRepo.create({
      incidentId,
      actorId: user?.id ?? 0,
      actorName: user?.name ?? '系统',
      actorRole: user ? (ROLE_NAMES[user.role] || user.role) : '系统',
      action,
      note: note || null,
    }));
  }

  /**
   * 工单动作：企业行政/门店/仓配/客服/财务在同一团餐单内协同
   * action: COMMENT 留言 / CLAIM 受理 / COMPENSATE_PROPOSE 提出赔付 /
   *         COMPENSATE_CONFIRM 财务确认赔付 / ADJUST_ORDER 调整人数 / RESOLVE 办结 / CLOSE 关闭
   */
  async action(id: number, dto: any, user: User) {
    const incident = await this.repo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('工单不存在');
    if (['CLOSED'].includes(incident.status)) throw new BadRequestException('工单已关闭');
    const action = dto.action;

    switch (action) {
      case 'COMMENT':
        await this.addLog(id, user, 'COMMENT', dto.note);
        break;
      case 'CLAIM':
        incident.status = 'PROCESSING';
        await this.addLog(id, user, 'CLAIM', dto.note || `${ROLE_NAMES[user.role]}受理工单`);
        break;
      case 'COMPENSATE_PROPOSE': {
        const amount = +dto.compensation;
        if (!(amount >= 0)) throw new BadRequestException('赔付金额不合法');
        incident.compensation = amount;
        incident.compensationConfirmed = false;
        await this.addLog(id, user, 'COMPENSATE_PROPOSE', `提出赔付 ¥${amount}，待财务确认`);
        await this.notify.send({
          role: 'FINANCE',
          title: '赔付待确认',
          content: `工单 ${incident.ticketNo} 提出赔付 ¥${amount}，请财务审核确认`,
          type: 'INCIDENT', orderId: incident.orderId,
        });
        break;
      }
      case 'COMPENSATE_CONFIRM': {
        if (user.role !== UserRole.FINANCE && user.role !== UserRole.ADMIN) {
          throw new BadRequestException('仅财务可确认赔付');
        }
        incident.compensationConfirmed = true;
        await this.addLog(id, user, 'COMPENSATE_CONFIRM', `财务确认赔付 ¥${incident.compensation}`);
        // 同步到档案赔付
        const archive = await this.archiveRepo.findOne({ where: { orderId: incident.orderId } });
        if (archive) {
          const all = await this.repo.find({ where: { orderId: incident.orderId } });
          archive.compensation = all.filter(i => i.compensationConfirmed)
            .reduce((s, i) => s + Number(i.compensation || 0), 0);
          await this.archiveRepo.save(archive);
        }
        break;
      }
      case 'ADJUST_ORDER': {
        const newCount = +dto.headcount;
        if (!newCount) throw new BadRequestException('请填写调整后人数');
        await this.orderService.adjust(incident.orderId, { headcount: newCount }, user);
        await this.addLog(id, user, 'ADJUST_ORDER', `团餐人数调整为 ${newCount} 人`);
        break;
      }
      case 'RESOLVE':
        incident.status = 'RESOLVED';
        incident.resolution = dto.note || '已处理完成';
        await this.addLog(id, user, 'RESOLVE', incident.resolution);
        break;
      case 'CLOSE': {
        incident.status = 'CLOSED';
        incident.closedAt = new Date();
        await this.addLog(id, user, 'CLOSE', dto.note || '工单关闭');
        // 若该团餐单已无未结工单，清除异常标记
        const open = await this.repo.createQueryBuilder('i')
          .where('i.orderId = :oid AND i.id != :id AND i.status IN (:...st)',
            { oid: incident.orderId, id: incident.id, st: ['OPEN', 'PROCESSING'] })
          .getCount();
        if (open === 0) {
          await this.orderRepo.update({ id: incident.orderId }, { hasException: false });
        }
        break;
      }
      default:
        throw new BadRequestException('不支持的操作');
    }
    await this.repo.save(incident);

    // 发票错误工单：联动标记发票
    if (incident.type === 'INVOICE_ERROR' && action === 'CLAIM') {
      const invoice = await this.invoiceRepo.findOne({ where: { orderId: incident.orderId } });
      if (invoice && invoice.status !== 'REISSUED') {
        invoice.status = 'ERROR';
        invoice.errorNote = incident.description;
        await this.invoiceRepo.save(invoice);
        await this.notify.send({
          role: 'FINANCE',
          title: '发票信息错误待处理',
          content: `工单 ${incident.ticketNo} 反馈发票信息错误，发票 ${invoice.invoiceNo} 已标记，请财务红冲重开`,
          type: 'FINANCE', orderId: incident.orderId,
        });
      }
    }
    return this.detail(id);
  }
}
