import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('enterprises')
export class Enterprise {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  contactName: string;

  @Column()
  contactPhone: string;

  @Column({ nullable: true })
  backupContactName: string;

  @Column({ nullable: true })
  backupContactPhone: string;

  @Column()
  address: string;

  @Column({ type: 'float', default: 0 })
  lat: number;

  @Column({ type: 'float', default: 0 })
  lng: number;

  @Column({ nullable: true })
  taxNo: string;

  @Column({ nullable: true })
  invoiceTitle: string;

  /** 历史偏好 { likes: ['BENTO','COFFEE'], dislikes: [], note: '' } */
  @Column({ type: 'jsonb', default: {} })
  preferences: any;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  enterpriseId: number;

  @Column()
  title: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  /** 合同默认餐标（人均） */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  mealBudget: number;

  /** 合同折扣，如 0.95 */
  @Column({ type: 'float', default: 1 })
  discount: number;

  /** PER_ORDER 单结 / MONTHLY 月结 */
  @Column({ default: 'PER_ORDER' })
  settlementType: string;

  /** ACTIVE / EXPIRED */
  @Column({ default: 'ACTIVE' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
