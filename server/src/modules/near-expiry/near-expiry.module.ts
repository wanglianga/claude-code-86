import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NearExpiryOffer, SettlementAttachment } from '../../entities/near-expiry.entity';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { User } from '../../entities/user.entity';
import { NearExpiryService } from './near-expiry.service';
import { NearExpiryController } from './near-expiry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([
    NearExpiryOffer, SettlementAttachment, MealOrder, MealPlan,
    InventoryBatch, Product, Store, Enterprise, User,
  ])],
  providers: [NearExpiryService],
  controllers: [NearExpiryController],
  exports: [NearExpiryService],
})
export class NearExpiryModule {}
