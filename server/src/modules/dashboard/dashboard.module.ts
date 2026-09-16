import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MealOrder } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive } from '../../entities/archive.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MealOrder, Incident, InventoryBatch, Delivery, Invoice, Archive])],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
