import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',           // 平台运营
  ENTERPRISE = 'ENTERPRISE', // 企业行政
  STORE = 'STORE',           // 门店
  LOGISTICS = 'LOGISTICS',   // 仓配
  SERVICE = 'SERVICE',       // 客服
  FINANCE = 'FINANCE',       // 财务
}

export const ROLE_NAMES: Record<string, string> = {
  ADMIN: '平台运营',
  ENTERPRISE: '企业行政',
  STORE: '门店',
  LOGISTICS: '仓配',
  SERVICE: '客服',
  FINANCE: '财务',
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 20 })
  role: UserRole;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  enterpriseId: number;

  @Column({ nullable: true })
  storeId: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
