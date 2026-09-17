import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SpoiledReport, BatchRecall, RecallTask, Redelivery,
} from '../../entities/spoiled.entity';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Product } from '../../entities/product.entity';
import { Store } from '../../entities/store.entity';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { Archive, Feedback } from '../../entities/archive.entity';
import { Delivery } from '../../entities/delivery.entity';
import { User } from '../../entities/user.entity';
import { NearExpiryOffer } from '../../entities/near-expiry.entity';
import { SpoiledService } from './spoiled.service';
import { SpoiledController } from './spoiled.controller';

@Module({
  imports: [TypeOrmModule.forFeature([
    SpoiledReport, BatchRecall, RecallTask, Redelivery,
    MealOrder, MealPlan, InventoryBatch, Product, Store,
    Incident, IncidentLog, Archive, Feedback, Delivery, User, NearExpiryOffer,
  ])],
  providers: [SpoiledService],
  controllers: [SpoiledController],
  exports: [SpoiledService],
})
export class SpoiledModule {}
