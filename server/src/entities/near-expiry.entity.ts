import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** 临期优先调拨折扣方案状态 */
export enum NearExpiryOfferStatus {
  PROPOSED = 'PROPOSED', // 平台已推荐，待企业行政确认
  ACCEPTED = 'ACCEPTED', // 企业已接受（确认快照生效，已写入团餐单）
  REJECTED = 'REJECTED', // 企业拒绝
  FULFILLED = 'FULFILLED', // 已随团餐单备货履约（批次扣减）
  EXPIRED = 'EXPIRED',   // 企业按原价方案下单/批次状态变化导致失效
}

export const NEAR_EXPIRY_OFFER_STATUS: Record<string, { name: string; type: string }> = {
  PROPOSED: { name: '待企业确认', type: 'warning' },
  ACCEPTED: { name: '企业已接受', type: 'success' },
  REJECTED: { name: '企业已拒绝', type: 'info' },
  FULFILLED: { name: '已随单履约', type: 'success' },
  EXPIRED: { name: '已失效', type: 'info' },
};

/**
 * 临期鲜食优先调拨 · 团餐折扣方案
 *
 * 业务约束（原始需求）：
 *  - 门店便当即将临期但仍符合团餐时间要求时，平台可推荐折扣方案给企业行政；
 *  - 企业接受后，商品批次、折扣、温控和售后责任写入团餐单；
 *  - 临期调拨标记到每份餐食，企业端可看到折扣原因和售后规则；
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

  @Column()
  storeId: number;

  /** 推荐来源：待确认团餐单 / 平台临期池匹配 */
  @Column({ default: 'PENDING_ORDER' })
  sourceType: string;

  /** PROPOSED / ACCEPTED / REJECTED / FULFILLED / EXPIRED */
  @Column({ type: 'varchar', default: 'PROPOSED' })
  status: string;

  /** 临期折扣率（相对合同折后价，如 0.6 = 6 折），相对正常份 0.5~0.9 */
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.6 })
  discountRate: number;

  /** 方案总份数 */
  @Column({ default: 0 })
  totalQty: number;

  /** 临期调拨份数 */
  @Column({ default: 0 })
  nearExpiryQty: number;

  /** 折扣前金额（合同折后、全部按正常价） */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountBefore: number;

  /** 折扣后应付金额（写入团餐单/发票口径） */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  offerAmount: number;

  /** 为企业节省金额 */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  savingsAmount: number;

  /**
   * 商品行快照（写入团餐单的商品批次、折扣、售后责任）
   * [{productId,name,category,quantity,unitPrice,normalQty,nearExpiryQty,discountRate,
   *   paidUnitPrice,batchId,batchNo,producedAt,expiresAt,tempZone,
   *   lineBaseAmount,lineOfferAmount,afterSalesRule}]
   */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  /** 批次快照 [{batchId,batchNo,productId,productName,quantity,tempZone,producedAt,expiresAt}] */
  @Column({ type: 'jsonb', default: [] })
  batches: any[];

  /**
   * 每份餐食的临期调拨标记
   * [{labelCode,offerNo,productId,productName,batchId,batchNo,tempZone,expiresAt,
   *   discountRate,paidUnitPrice,reason,afterSalesRule,status}]
   */
  @Column({ type: 'jsonb', default: [] })
  units: any[];

  /** 温控方案快照（按温区分组的出库/在途/交接温控要求 + 实测） */
  @Column({ type: 'jsonb', default: {} })
  tempControl: any;

  /** 售后责任划分快照（企业确认后不可变） */
  @Column({ type: 'jsonb', default: {} })
  afterSalesPolicy: any;

  /** 折扣原因（企业端可见，如“门店当日鲜食临期，送达后仍在团餐食用窗口内”） */
  @Column({ type: 'text', nullable: true })
  discountReason: string;

  /** 团餐时间窗校验快照 {deliverAt,latestServeAt,batchExpiresAt,withinWindow,remainingMin} */
  @Column({ type: 'jsonb', default: {} })
  groupMealWindow: any;

  /** 企业确认 */
  @Column({ nullable: true })
  acceptedBy: number;

  @Column({ nullable: true })
  acceptedByName: string;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date;

  @Column({ type: 'text', nullable: true })
  acceptanceNote: string;

  /** 企业拒绝 */
  @Column({ nullable: true })
  rejectedBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectReason: string;

  /** 随单履约（备货扣减批次） */
  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date;

  /** 平台推荐人 */
  @Column({ nullable: true })
  proposedBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiredAt: Date;

  @Column({ type: 'text', nullable: true })
  expireReason: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * 月结附件：企业对临期调拨折扣方案的确认记录
 * （企业确认即归档；财务归集月结单时挂入账期，售后说明引用同一份快照）
 */
@Entity('settlement_attachments')
export class SettlementAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  attachmentNo: string;

  @Column()
  enterpriseId: number;

  @Column()
  orderId: number;

  @Column()
  offerId: number;

  /** 归集到的月结单（归集前为空，月结附件待归集状态） */
  @Column({ nullable: true })
  settlementId: number;

  /** 账期 YYYY-MM（按团餐送达时间归属） */
  @Column()
  month: string;

  /** 附件类型：当前仅 NEAR_EXPIRY_CONFIRM（临期调拨企业确认） */
  @Column({ default: 'NEAR_EXPIRY_CONFIRM' })
  type: string;

  @Column()
  title: string;

  /** 确认快照（折扣/批次/温控/售后责任/每份标记/确认人/时间） */
  @Column({ type: 'jsonb', default: {} })
  snapshot: any;

  @CreateDateColumn()
  createdAt: Date;
}
