import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store, StoreShift } from '../../entities/store.entity';
import { MealOrder } from '../../entities/order.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Store, StoreShift, MealOrder, InventoryBatch])],
  providers: [StoreService],
  controllers: [StoreController],
  exports: [StoreService],
})
export class StoreModule {}
