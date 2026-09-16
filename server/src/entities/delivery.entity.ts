import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** 配送单 */
@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  orderId: number;

  @Column({ nullable: true })
  courierId: number;

  /** 保温箱编号 */
  @Column({ nullable: true })
  thermalBoxNo: string;

  /** 配送路线 */
  @Column({ nullable: true })
  route: string;

  /** 出库时间 */
  @Column({ type: 'timestamptz', nullable: true })
  outboundAt: Date;

  /** 取货时间 */
  @Column({ type: 'timestamptz', nullable: true })
  pickedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  signedAt: Date;

  @Column({ nullable: true })
  signerName: string;

  @Column({ nullable: true })
  signNote: string;

  /** PENDING / ASSIGNED / OUTBOUND / PICKED / DELIVERED / SIGNED */
  @Column({ default: 'PENDING' })
  status: string;

  @Column({ default: false })
  late: boolean;

  /** 特殊餐标（临时加餐同步）：[{name, tag, productName, labelCode, source:'ORIGIN'|'TOPUP'}] */
  @Column({ type: 'jsonb', default: [] })
  specialLabels: any[];

  /** 原保温箱容量（份），配送容量核查依据 */
  @Column({ default: 60 })
  boxCapacity: number;

  /** 临时加餐是否加派配送员/保温箱 */
  @Column({ default: false })
  extraDispatch: boolean;

  @Column({ nullable: true })
  extraCourierId: number;

  /** 追加份数（用于配送员核对总份数） */
  @Column({ default: 0 })
  topUpQty: number;

  @CreateDateColumn()
  createdAt: Date;
}
