import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  invoiceNo: string;

  @Column()
  enterpriseId: number;

  @Column({ nullable: true })
  orderId: number;

  @Column({ nullable: true })
  settlementId: number;

  @Column()
  title: string;

  @Column()
  taxNo: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** PENDING / ISSUED / ERROR / REISSUED */
  @Column({ default: 'PENDING' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt: Date;

  @Column({ nullable: true })
  errorNote: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** 月结账单 */
@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  enterpriseId: number;

  /** 账期月份，如 2026-09 */
  @Column()
  month: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ default: 0 })
  orderCount: number;

  /** OPEN / CONFIRMED / INVOICED / PAID */
  @Column({ default: 'OPEN' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
