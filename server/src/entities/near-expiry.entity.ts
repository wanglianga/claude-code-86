import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** 临期调拨折扣方案状态 */
export enum OfferStatus {
  PROPOSED = 'PROPOSED',   // 平台/门店已推荐，待企业行政确认
  CONFIRMED = 'CONFIRMED', // 企业已确认，已锁定批次写入团餐单
  REJECTED = 'REJECTED',   // 企业拒绝
  FULFILLED = 'FULFILLED', // 已随团餐备货出库
  CANCELLED = 'CANCELLED',
}

export const OFFER_STATUS_NAMES: Record<string, string> = {
  PROPOSED: '待企业确认',
  CONFIRMED: '企业已确认',
  REJECTED: '企业已拒绝',
  FULFILLED: '已随餐履约',
  CANCELLED: '已取消',
};

/**
 * 临期鲜食优先调拨折扣方案
 *
 * 业务约束（原始需求）：
 *  - 门店便当即将临期但仍符合团餐时间要求时，平台推荐折扣方案给企业行政；
 *  - 企业接受后，商品批次、折扣、温控和售后责任写入团餐单；
 *  - 临期调拨标记到每份餐食（portionCodes），企业端可看到折扣原因和售后规则；
 *  - 折扣方案保留企业确认，后续售后不能把临期误认为质量问题；
 *  - 企业确认进入月结附件和售后说明。
 */
@Entity('near_expiry_offers')
export class NearExpiryOffer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  offerNo: string;

  @Column()
  orderId: number;

  @Column()
  enterpriseId: number;

  /** 履约门店（团餐供餐门店） */
  @Column()
  storeId: number;

  /** 推荐人：0=系统 */
  @Column({ default: 0 })
  recommendedBy: number;

  @Column({ default: 'STORE' })
  recommendedByRole: string;

  /** PROPOSED / CONFIRMED / REJECTED / FULFILLED / CANCELLED */
  @Column({ default: 'PROPOSED' })
  status: string;

  /**
   * 折扣明细（每行一个临期批次）
   * [{ productId, name, category, vegetarian, quantity, unitPrice, discountRate,
   *    discountPrice, lineOriginal, lineFinal, lineSaving,
   *    batchId, batchNo, sourceStoreId, sourceStoreName, producedAt, expiresAt, tempZone }]
   */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  /**
   * 逐份餐食标记（确认时生成）
   * [{ code, productId, productName, batchNo, tempZone, expiresAt, eatBefore,
   *    discountRate, discountReason, afterSalesRules }]
   */
  @Column({ type: 'jsonb', default: [] })
  portions: any[];

  /** 原合同价合计 */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  originalAmount: number;

  /** 折后合计 */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  finalAmount: number;

  /** 为企业节省金额 */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  savingAmount: number;

  /** 临期调拨份数合计 */
  @Column({ default: 0 })
  totalQuantity: number;

  /** 折扣原因（企业端可见） */
  @Column({ type: 'text' })
  discountReason: string;

  /**
   * 温控要求 { zone, zoneName, requirement, box, deliverTemp, eatBefore }
   */
  @Column({ type: 'jsonb', default: {} })
  tempControl: any;

  /** 售后责任条款（企业确认后写入团餐单、月结附件、售后说明） */
  @Column({ type: 'jsonb', default: [] })
  afterSalesRules: string[];

  /**
   * 团餐时间校验
   * { deliverAt, eatWindowHours, minExpireAt, latestEatAt, passed,
   *   lines: [{ batchNo, expiresAt, remainHoursAtDelivery, ok, reason }] }
   */
  @Column({ type: 'jsonb', default: {} })
  mealTimeCheck: any;

  /** 关联门店间调拨留痕（跨店调入时的 transfer ids） */
  @Column({ type: 'jsonb', default: [] })
  transferIds: number[];

  /** 确认时批次库存已物理扣减（与临时加餐同一口径） */
  @Column({ default: false })
  stockDeducted: boolean;

  // ===== 企业确认（长期保留，售后/月结凭据） =====
  @Column({ nullable: true })
  confirmedBy: number;

  @Column({ nullable: true })
  confirmedByName: string;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  /**
   * 企业确认快照（固化条款，后续不可篡改）：
   * { totals, discountRate, discountReason, tempControl, afterSalesRules, items 摘要 }
   */
  @Column({ type: 'jsonb', default: {} })
  confirmationSnapshot: any;

  @Column({ nullable: true })
  rejectedBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectReason: string;

  /** 随团餐备货出库 */
  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date;

  /** 门店逐份贴标确认（每份餐食的临期调拨标记） */
  @Column({ default: false })
  labelConfirmed: boolean;

  @Column({ nullable: true })
  labelledBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  labelledAt: Date;

  @Column({ type: 'text', nullable: true })
  labelNote: string;

  /** 已归集进入的月结单（月结附件） */
  @Column({ nullable: true })
  attachedSettlementId: number;

  @CreateDateColumn()
  createdAt: Date;
}
