import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  /** 指定用户（优先） */
  @Column({ nullable: true })
  userId: number;

  /** 或按角色广播 */
  @Column({ nullable: true })
  role: string;

  @Column({ nullable: true })
  storeId: number;

  @Column({ nullable: true })
  enterpriseId: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** ORDER / INCIDENT / INVENTORY / FINANCE / SYSTEM */
  @Column({ default: 'SYSTEM' })
  type: string;

  @Column({ nullable: true })
  orderId: number;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
