import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MealTopUp } from '../../entities/topup.entity';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Invoice } from '../../entities/finance.entity';
import { Product } from '../../entities/product.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { User } from '../../entities/user.entity';
import { TopUpService } from './topup.service';
import { TopUpController } from './topup.controller';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MealTopUp, MealOrder, MealPlan, InventoryBatch, Delivery,
      Invoice, Product, Enterprise, Contract, User,
    ]),
    OrderModule,
  ],
  providers: [TopUpService],
  controllers: [TopUpController],
  exports: [TopUpService],
})
export class TopUpModule {}
