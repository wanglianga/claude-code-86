import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum BatchStatus {
  AVAILABLE = 'AVAILABLE',
  DEPLETED = 'DEPLETED',
  EXPIRED = 'EXPIRED',
  DISPOSED = 'DISPOSED',
}

/** 鲜食生产批次（门店库存） */
@Entity('inventory_batches')
export class InventoryBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batchNo: string;

  @Column()
  storeId: number;

  @Column()
  productId: number;

  @Column({ default: 0 })
  quantity: number;

  @Column({ default: 0 })
  initialQuantity: number;

  @Column({ type: 'timestamptz' })
  producedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: 'CHILLED' })
  tempZone: string;

  @Column({ nullable: true })
  supplierId: number;

  @Column({ type: 'varchar', default: 'AVAILABLE' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** 临期调拨单（门店间） */
@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batchId: number;

  @Column()
  productId: number;

  @Column()
  fromStoreId: number;

  @Column()
  toStoreId: number;

  @Column()
  quantity: number;

  @Column({ nullable: true })
  reason: string;

  /** PENDING / ACCEPTED / REJECTED */
  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  handledAt: Date;
}
