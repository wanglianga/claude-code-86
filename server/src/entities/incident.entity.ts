import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum IncidentType {
  HEADCOUNT_CHANGE = 'HEADCOUNT_CHANGE', // 人数临时增减
  STOCK_SHORTAGE = 'STOCK_SHORTAGE',     // 库存不足
  NEAR_EXPIRY = 'NEAR_EXPIRY',           // 鲜食临期
  DELIVERY_LATE = 'DELIVERY_LATE',       // 配送迟到
  INVOICE_ERROR = 'INVOICE_ERROR',       // 发票信息错误
  SPOILED = 'SPOILED',                   // 餐食变质
  OTHER = 'OTHER',
}

export const INCIDENT_TYPE_NAMES: Record<string, string> = {
  HEADCOUNT_CHANGE: '人数临时增减',
  STOCK_SHORTAGE: '门店库存不足',
  NEAR_EXPIRY: '鲜食临期',
  DELIVERY_LATE: '配送迟到',
  INVOICE_ERROR: '发票信息错误',
  SPOILED: '餐食变质反馈',
  OTHER: '其他异常',
};

/** 异常工单：企业行政/门店/仓配/客服/财务在同一团餐单内协同处理 */
@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  ticketNo: string;

  @Column()
  orderId: number;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  /** OPEN / PROCESSING / RESOLVED / CLOSED */
  @Column({ default: 'OPEN' })
  status: string;

  /** LOW / MEDIUM / HIGH / URGENT */
  @Column({ default: 'MEDIUM' })
  priority: string;

  /** 赔付金额（客服提出、财务确认） */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  compensation: number;

  @Column({ default: false })
  compensationConfirmed: boolean;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ nullable: true })
  createdBy: number;

  @Column({ nullable: true })
  createdByRole: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date;
}

/** 工单处理时间线（多角色协同记录） */
@Entity('incident_logs')
export class IncidentLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  incidentId: number;

  @Column()
  actorId: number;

  @Column()
  actorName: string;

  @Column()
  actorRole: string;

  /** CREATED / COMMENT / CLAIM / COMPENSATE_PROPOSE / COMPENSATE_CONFIRM / ADJUST_ORDER / RESOLVE / CLOSE */
  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
