import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MealOrder, MealPlan } from '../../entities/order.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Store, StoreShift } from '../../entities/store.entity';
import { Product } from '../../entities/product.entity';
import { InventoryBatch } from '../../entities/inventory.entity';
import { Delivery } from '../../entities/delivery.entity';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive, Feedback } from '../../entities/archive.entity';
import { User } from '../../entities/user.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    MealOrder, MealPlan, Enterprise, Contract, Store, StoreShift,
    Product, InventoryBatch, Delivery, Incident, IncidentLog,
    Invoice, Archive, Feedback, User,
  ])],
  providers: [OrderService, PlanService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrderModule {}
