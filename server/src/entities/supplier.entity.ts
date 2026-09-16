import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  contact: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** 供应商到货（延迟预警） */
@Entity('supplier_deliveries')
export class SupplierDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplierId: number;

  @Column()
  storeId: number;

  @Column({ type: 'timestamptz' })
  expectedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  arrivedAt: Date;

  /** SCHEDULED / ARRIVED / DELAYED */
  @Column({ default: 'SCHEDULED' })
  status: string;

  /** [{productId, quantity}] */
  @Column({ type: 'jsonb', default: [] })
  items: any[];

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
