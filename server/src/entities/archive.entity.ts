import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** 员工用餐反馈 */
@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @Column({ default: 5 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  /** 是否反馈餐食变质 */
  @Column({ default: false })
  spoiled: boolean;

  @Column({ nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}

/** 交付档案：实际消费/退货/临期调拨/赔付/发票/复购 */
@Entity('archives')
export class Archive {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  orderId: number;

  @Column()
  enterpriseId: number;

  @Column()
  storeId: number;

  /** 实际消费金额 */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  actualAmount: number;

  @Column({ default: 0 })
  actualHeadcount: number;

  /** 退货份数与金额 */
  @Column({ default: 0 })
  returnCount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  returnAmount: number;

  /** 本单消化的临期鲜食份数 */
  @Column({ default: 0 })
  nearExpiryUsed: number;

  /** 本单临期调拨折扣为企业节省金额（企业已确认方案） */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  nearExpirySavings: number;

  /** 本单赔付总额 */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  compensation: number;

  @Column({ default: true })
  onTime: boolean;

  @Column({ default: 0 })
  incidentCount: number;

  @Column({ default: 0 })
  invoiceErrors: number;

  @Column({ default: 5 })
  rating: number;

  /** 企业是否已复购 */
  @Column({ default: false })
  repurchased: boolean;

  @Column({ type: 'jsonb', default: [] })
  items: any[];

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @CreateDateColumn()
  archivedAt: Date;
}
