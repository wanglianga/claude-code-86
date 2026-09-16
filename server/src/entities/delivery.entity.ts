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

  @CreateDateColumn()
  createdAt: Date;
}
