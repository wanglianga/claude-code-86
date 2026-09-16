import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
  ) {}

  /** 发送通知：可按用户 / 角色 / 门店 / 企业 定向 */
  async send(opts: {
    userId?: number; role?: string; storeId?: number; enterpriseId?: number;
    title: string; content: string; type?: string; orderId?: number;
  }) {
    const n = this.repo.create({
      userId: opts.userId ?? null,
      role: opts.role ?? null,
      storeId: opts.storeId ?? null,
      enterpriseId: opts.enterpriseId ?? null,
      title: opts.title,
      content: opts.content,
      type: opts.type || 'SYSTEM',
      orderId: opts.orderId ?? null,
    });
    await this.repo.save(n);
  }

  async listFor(user: User, unreadOnly = false) {
    const qb = this.repo.createQueryBuilder('n')
      .where('(n.userId = :uid OR (n.userId IS NULL AND n.role = :role) OR (n.userId IS NULL AND n.role IS NULL AND n.storeId = :sid AND n.storeId IS NOT NULL) OR (n.userId IS NULL AND n.role IS NULL AND n.enterpriseId = :eid AND n.enterpriseId IS NOT NULL))',
        { uid: user.id, role: user.role, sid: user.storeId ?? -1, eid: user.enterpriseId ?? -1 })
      .orderBy('n.createdAt', 'DESC')
      .take(50);
    if (unreadOnly) qb.andWhere('n.read = false');
    return qb.getMany();
  }

  async unreadCount(user: User) {
    const list = await this.listFor(user, true);
    return list.length;
  }

  async markRead(id: number, user: User) {
    await this.repo.update({ id }, { read: true });
    return { ok: true };
  }

  async markAllRead(user: User) {
    const list = await this.listFor(user, true);
    for (const n of list) await this.repo.update({ id: n.id }, { read: true });
    return { ok: true };
  }
}
