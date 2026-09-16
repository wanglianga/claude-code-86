import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** 临时加餐状态 */
export enum TopUpStatus {
  CHECKED = 'CHECKED',     // 已核查，待企业确认
  CONFIRMED = 'CONFIRMED', // 企业已确认，待门店贴标
  LABELLED = 'LABELLED',   // 门店已按企业名单完成特殊餐贴标
  FULFILLED = 'FULFILLED', // 已并入配送（出库取货）
  CANCELLED = 'CANCELLED',
}

export const TOPUP_STATUS_NAMES: Record<string, string> = {
  CHECKED: '已核查待确认',
  CONFIRMED: '已确认待贴标',
  LABELLED: '贴标完成待配送',
  FULFILLED: '已并入配送',
  CANCELLED: '已取消',
};

/**
 * 企业临时加餐（送达前临时加人/加份数）
 *
 * 业务约束（原始需求）：
 *  - 企业在送达前一小时增加餐食，平台需检查周边门店库存、制作批次、配送容量和发票金额；
 *  - 确认后追加商品、送达时间和差额费用同步更新；
 *  - 追加餐食涉及过敏或素食时，门店必须按企业名单重新贴标；
 *  - 临时追加同步到门店拣货清单，避免漏贴某一类特殊餐标；
 *  - 特殊餐标同步给配送员和企业签收人。
 */
@Entity('meal_topups')
export class MealTopUp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  topUpNo: string;

  @Column()
  orderId: number;

  @Column()
  enterpriseId: number;

  /** 实际承接门店（优先原门店，周边门店为备选） */
  @Column()
  storeId: number;

  /** 追加份数 */
  @Column({ default: 0 })
  addHeadcount: number;

  /** 其中素食份数 */
  @Column({ default: 0 })
  addVegetarianCount: number;

  /** 追加餐忌口（与原单取并集核查过敏原） */
  @Column({ type: 'jsonb', default: [] })
  addAllergies: string[];

  /**
   * 企业特殊餐名单（贴标依据）
   * [{ name:'张伟', tag:'素食'|'过敏:花生', productId, productName, labelCode }]
   */
  @Column({ type: 'jsonb', default: [] })
  specialDietRoster: any[];

  /** 追加套餐明细（同供餐方案口径） */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  /** 批次预占：[{batchId, productId, quantity, nearExpiryQty}]，确认时据此扣减 */
  @Column({ type: 'jsonb', default: [] })
  batchAllocations: any[];

  /** 追加餐费（合同折扣后、临期折扣后） */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  addAmount: number;

  /** 追加配送费（容量/加派时产生） */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  addDeliveryFee: number;

  /** 合计差额（追加发票金额） */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDiff: number;

  /** 原发票金额快照（核查时） */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  invoiceAmountBefore: number;

  /** 核查后预计发票总金额 */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  invoiceAmountAfter: number;

  /** 补差发票号（确认后生成/更新待开发票） */
  @Column({ nullable: true })
  invoiceId: number;

  /** 追加后的送达时间（加急制作可能微调） */
  @Column({ type: 'timestamptz', nullable: true })
  newDeliverAt: Date;

  /** 原送达时间快照 */
  @Column({ type: 'timestamptz' })
  originDeliverAt: Date;

  /** CHECKED / CONFIRMED / LABELLED / FULFILLED / CANCELLED */
  @Column({ type: 'varchar', default: 'CHECKED' })
  status: string;

  /** 周边门店核查结果快照（库存/批次/产能/配送容量） */
  @Column({ type: 'jsonb', default: [] })
  checks: any[];

  /** 配送容量结论 */
  @Column({ type: 'jsonb', default: {} })
  deliveryCapacity: any;

  /** 是否需要加派配送员（原保温箱容量不足） */
  @Column({ default: false })
  extraCourierRequired: boolean;

  @Column({ nullable: true })
  extraCourierId: number;

  /** 特殊餐标数量：素食标签数 */
  @Column({ default: 0 })
  vegLabelCount: number;

  /** 特殊餐标数量：过敏标签数 */
  @Column({ default: 0 })
  allergyLabelCount: number;

  /** 门店贴标：拣货清单已同步 */
  @Column({ default: false })
  pickListSynced: boolean;

  /** 门店贴标确认时间 */
  @Column({ type: 'timestamptz', nullable: true })
  labelledAt: Date;

  @Column({ nullable: true })
  labelledBy: number;

  @Column({ type: 'text', nullable: true })
  labelNote: string;

  @Column({ nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}
