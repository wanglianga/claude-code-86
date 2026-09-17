import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NearExpiryOffer } from '../../entities/near-expiry.entity';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { InventoryBatch, Transfer } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { User } from '../../entities/user.entity';
import { NearExpiryService } from './near-expiry.service';
import { NearExpiryController } from './near-expiry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([
    NearExpiryOffer, MealOrder, MealPlan, InventoryBatch, Transfer,
    Product, Store, Enterprise, Contract, User,
  ])],
  providers: [NearExpiryService],
  controllers: [NearExpiryController],
  exports: [NearExpiryService, TypeOrmModule],
})
export class NearExpiryModule {}
