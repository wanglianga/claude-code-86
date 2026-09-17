import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PLANNING = 'PLANNING',               // 方案生成中/待生成
  PENDING_CONFIRM = 'PENDING_CONFIRM', // 待企业确认方案
  CONFIRMED = 'CONFIRMED',             // 企业已确认
  PREPARING = 'PREPARING',             // 门店备货中
  READY = 'READY',                     // 备货完成待取货
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  SIGNED = 'SIGNED',
  COMPLETED = 'COMPLETED',             // 已归档
  CANCELLED = 'CANCELLED',
}

export const ORDER_STATUS_NAMES: Record<string, string> = {
  DRAFT: '草稿',
  PLANNING: '方案生成中',
  PENDING_CONFIRM: '待确认方案',
  CONFIRMED: '已确认',
  PREPARING: '门店备货中',
  READY: '待取货',
  OUT_FOR_DELIVERY: '配送中',
  DELIVERED: '已送达',
  SIGNED: '已签收',
  COMPLETED: '已归档',
  CANCELLED: '已取消',
};

export const OCCASION_NAMES: Record<string, string> = {
  MEETING: '会议餐',
  TRAINING: '培训餐',
  OVERTIME: '加班餐',
};

@Entity('meal_orders')
export class MealOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  orderNo: string;

  @Column()
  enterpriseId: number;

  @Column({ nullable: true })
  contractId: number;

  @Column({ nullable: true })
  storeId: number;

  /** MEETING 会议 / TRAINING 培训 / OVERTIME 加班 */
  @Column()
  occasion: string;

  @Column()
  headcount: number;

  /** 人均餐标 */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  mealBudget: number;

  @Column({ default: 0 })
  vegetarianCount: number;

  @Column({ type: 'jsonb', default: [] })
  allergies: string[];

  @Column({ type: 'timestamptz' })
  deliverAt: Date;

  @Column()
  address: string;

  @Column()
  contactName: string;

  @Column()
  contactPhone: string;

  @Column({ nullable: true })
  backupContactName: string;

  @Column({ nullable: true })
  backupContactPhone: string;

  @Column({ default: false })
  invoiceRequired: boolean;

  @Column({ nullable: true })
  invoiceTitle: string;

  @Column({ nullable: true })
  taxNo: string;

  @Column({ nullable: true })
  remark: string;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: string;

  /** 是否有进行中的异常工单 */
  @Column({ default: false })
  hasException: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  actualHeadcount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  actualAmount: number;

  @Column({ nullable: true })
  createdBy: number;

  @Column({ nullable: true })
  settlementId: number;

  /** 当前生效的临期调拨折扣方案（企业已接受） */
  @Column({ nullable: true })
  nearExpiryOfferId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** 智能供餐方案 */
@Entity('meal_plans')
export class MealPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @Column()
  storeId: number;

  /** [{productId, name, category, quantity, unitPrice, nearExpiryQty, vegetarian}] */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalPrice: number;

  /** 方案生成依据 */
  @Column({ type: 'jsonb', default: [] })
  reasons: string[];

  /** 门店平衡提醒（团餐 vs 散客 vs 临期） */
  @Column({ type: 'jsonb', default: [] })
  warnings: string[];

  /**
   * 临期调拨锁定批次（企业接受折扣方案后写入，备货按此优先扣减）
   * [{batchId, productId, quantity}]
   */
  @Column({ type: 'jsonb', default: [] })
  reservedBatches: any[];

  /** 关联临期调拨折扣方案号 offerNo（企业确认凭证） */
  @Column({ nullable: true })
  nearExpiryOfferNo: string;

  /** 临期折扣原因（企业端可见） */
  @Column({ type: 'text', nullable: true })
  discountReason: string;

  /** 温控方案快照 */
  @Column({ type: 'jsonb', default: {} })
  tempControl: any;

  /** 售后责任划分快照（企业确认，后续售后不能把临期误认为质量问题） */
  @Column({ type: 'jsonb', default: {} })
  afterSalesPolicy: any;

  /** 每份餐食的临期调拨标记（贴标到每份餐食） */
  @Column({ type: 'jsonb', default: [] })
  unitLabels: any[];

  @Column({ default: 1 })
  version: number;

  /** PROPOSED / ACCEPTED / REJECTED */
  @Column({ default: 'PROPOSED' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
