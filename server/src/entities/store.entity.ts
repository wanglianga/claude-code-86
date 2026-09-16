import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column({ type: 'float', default: 0 })
  lat: number;

  @Column({ type: 'float', default: 0 })
  lng: number;

  /** 门店每日可承接团餐份数 */
  @Column({ default: 100 })
  dailyCapacity: number;

  /** 散客高峰时段 [{start:'11:30', end:'13:00'}] */
  @Column({ type: 'jsonb', default: [] })
  peakHours: any[];

  @Column({ default: 5 })
  staffCount: number;

  /** OPEN / CLOSED */
  @Column({ default: 'OPEN' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

/** 门店排班（缺员预警） */
@Entity('store_shifts')
export class StoreShift {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  storeId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ default: 5 })
  requiredStaff: number;

  @Column({ default: 5 })
  actualStaff: number;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
