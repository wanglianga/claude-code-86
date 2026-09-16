import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum Category {
  RICE_BALL = 'RICE_BALL',
  BENTO = 'BENTO',
  SANDWICH = 'SANDWICH',
  COFFEE = 'COFFEE',
  DRINK = 'DRINK',
  FRUIT = 'FRUIT',
}

export const CATEGORY_NAMES: Record<string, string> = {
  RICE_BALL: '饭团',
  BENTO: '便当',
  SANDWICH: '三明治',
  COFFEE: '咖啡',
  DRINK: '饮料',
  FRUIT: '水果',
};

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 20 })
  category: Category;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cost: number;

  @Column({ default: 24 })
  shelfLifeHours: number;

  /** CHILLED 冷藏 / FROZEN 冷冻 / AMBIENT 常温 / HOT 热链 */
  @Column({ default: 'CHILLED' })
  tempZone: string;

  /** 过敏原：麸质/蛋/奶/花生/海鲜/大豆 等 */
  @Column({ type: 'jsonb', default: [] })
  allergens: string[];

  @Column({ default: false })
  vegetarian: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
