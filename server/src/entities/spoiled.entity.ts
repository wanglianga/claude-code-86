import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum SpoiledStatus {
  OPEN = 'OPEN',                 // 待客服受理
  PROCESSING = 'PROCESSING',     // 客服处理中
  RESOLVED = 'RESOLVED',         // 已办结
}

export enum RefundStatus {
  NONE = 'NONE',
  PROPOSED = 'PROPOSED',         // 客服提出批量退款，待财务确认
  CONFIRMED = 'CONFIRMED',       // 财务已确认
}

export enum RecallStatus {
  ISSUED = 'ISSUED',             // 已下发门店任务
  PARTIAL_DONE = 'PARTIAL_DONE', // 部分门店已处理
  ALL_DONE = 'ALL_DONE',         // 全部门店处理完成，待运营复核关闭
  CLOSED = 'CLOSED',             // 运营复核关闭
}

export enum RecallTaskStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
}

export enum RedeliveryStatus {
  PENDING = 'PENDING',   // 待门店备货
  READY = 'READY',       // 备货完成待取货
  PICKED = 'PICKED',     // 配送中
  DELIVERED = 'DELIVERED',
}

/**
 * 餐食变质售后单
 * 收集：商品批次、签收时间、温控照片、食用人员；
 * 处置：批量退款、补送、同批次下架。
 */
@Entity('spoiled_reports')
export class SpoiledReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  reportNo: string;

  @Column()
  orderId: number;

  @Column()
  enterpriseId: number;

  /** 责任门店（原单供餐门店） */
  @Column()
  storeId: number;

  /** 联动异常工单 */
  @Column({ nullable: true })
  incidentId: number;

  /** ODOR 饭团异味 / SPOILED 便当变质等 */
  @Column({ default: 'SPOILED' })
  issueType: string;

  /** 变质商品明细 [{productId, name, batchId, batchNo, unitPrice, qty, issueType}] */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  /** 签收时间（快照） */
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  /** 温控照片凭证 [{fileName, surfaceTemp, coreTemp, takenAt, note}] */
  @Column({ type: 'jsonb', default: [] })
  photos: any[];

  /** 食用人员 [{name, phone, symptom}] */
  @Column({ type: 'jsonb', default: [] })
  diners: any[];

  @Column({ type: 'text', nullable: true })
  description: string;

  /** OPEN / PROCESSING / RESOLVED */
  @Column({ default: 'OPEN' })
  status: string;

  /** 批量退款 */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  refundAmount: number;

  /** 退款倍数（如食安 2 倍赔付） */
  @Column({ type: 'float', default: 1 })
  refundMultiplier: number;

  @Column({ default: 'NONE' })
  refundStatus: string;

  @Column({ nullable: true })
  refundProposedBy: number;

  @Column({ nullable: true })
  refundConfirmedBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  refundConfirmedAt: Date;

  @Column({ nullable: true })
  redeliveryId: number;

  @Column({ nullable: true })
  recallId: number;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ nullable: true })
  handledBy: number;

  @Column({ nullable: true })
  createdBy: number;

  /**
   * 临期调拨识别快照（创建售后时按团餐单的企业确认方案判定）：
   * {matched:[{productId,name,batchId,batchNo,qty,labelCodes:[...],reason,afterSalesRule}],
   *  nearExpiryTotalQty, acknowledgedAll:boolean, blocked:boolean, note}
   * 企业已确认的临期份不认定为质量问题，客服不得对其发起食安赔付/同批次下架。
   */
  @Column({ type: 'jsonb', default: {} })
  nearExpiryMatch: any;

  @CreateDateColumn()
  createdAt: Date;
}

/** 同批次下架单（一次售后触发一次扫描） */
@Entity('batch_recalls')
export class BatchRecall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  recallNo: string;

  @Column()
  productId: number;

  @Column()
  productName: string;

  /** 触发下架的批次号 */
  @Column()
  batchNo: string;

  /** 同批次判定快照信息 */
  @Column({ type: 'timestamptz' })
  producedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column()
  reportId: number;

  @Column()
  orderId: number;

  /** ISSUED / PARTIAL_DONE / ALL_DONE / CLOSED */
  @Column({ default: 'ISSUED' })
  status: string;

  /** 扫描结果快照 [{storeId, storeName, stockQty, undelivered:[{orderId,orderNo,qty,deliverAt}]}] */
  @Column({ type: 'jsonb', default: [] })
  affectedStores: any[];

  @Column({ default: 0 })
  totalStockQty: number;

  @Column({ default: 0 })
  totalUndeliveredQty: number;

  @Column({ default: 0 })
  taskTotal: number;

  @Column({ default: 0 })
  taskDone: number;

  /** 运营复核人 */
  @Column({ nullable: true })
  reviewerId: number;

  @Column({ nullable: true })
  reviewerName: string;

  @Column({ type: 'text', nullable: true })
  reviewNote: string;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

/** 门店下架任务：处理截止时间、责任班次、复核人 */
@Entity('recall_tasks')
export class RecallTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  recallId: number;

  @Column()
  storeId: number;

  /** 该店同批次在架数量 */
  @Column({ default: 0 })
  stockQty: number;

  /** 未配送团餐 [{orderId, orderNo, qty, deliverAt}] */
  @Column({ type: 'jsonb', default: [] })
  undelivered: any[];

  /** PENDING / DONE */
  @Column({ default: 'PENDING' })
  status: string;

  /** 处理截止时间（下发后 2 小时） */
  @Column({ type: 'timestamptz' })
  dueAt: Date;

  /** 责任班次：早班 / 中班 / 晚班 */
  @Column()
  responsibleShift: string;

  /** 运营复核人 */
  @Column({ nullable: true })
  reviewerId: number;

  @Column({ nullable: true })
  reviewerName: string;

  /** 门店实际处置数量（下架报损） */
  @Column({ default: 0 })
  disposedQty: number;

  /** 拦截的未配送团餐份数 */
  @Column({ default: 0 })
  heldOrderQty: number;

  @Column({ type: 'text', nullable: true })
  handleNote: string;

  @Column({ nullable: true })
  handledBy: number;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date;

  /** 运营催办次数与最近催办时间 */
  @Column({ default: 0 })
  remindCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  remindedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

/** 补送单 */
@Entity('redeliveries')
export class Redelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  redeliveryNo: string;

  @Column()
  reportId: number;

  @Column()
  orderId: number;

  @Column()
  enterpriseId: number;

  @Column()
  storeId: number;

  /** [{productId, name, quantity, unitPrice}] */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  /** PENDING / READY / PICKED / DELIVERED */
  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
  courierId: number;

  @Column({ type: 'timestamptz', nullable: true })
  readyAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pickedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  /** 企业签收人 */
  @Column({ nullable: true })
  receivedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
