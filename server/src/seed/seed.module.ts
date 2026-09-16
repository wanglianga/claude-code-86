import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Enterprise, Contract } from '../entities/enterprise.entity';
import { Store, StoreShift } from '../entities/store.entity';
import { Product } from '../entities/product.entity';
import { InventoryBatch } from '../entities/inventory.entity';
import { Supplier, SupplierDelivery } from '../entities/supplier.entity';
import { MealOrder, MealPlan } from '../entities/order.entity';
import { Delivery } from '../entities/delivery.entity';
import { Incident, IncidentLog } from '../entities/incident.entity';
import { Invoice, Settlement } from '../entities/finance.entity';
import { Archive, Feedback } from '../entities/archive.entity';
import { MealTopUp } from '../entities/topup.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    User, Enterprise, Contract, Store, StoreShift, Product, InventoryBatch,
    Supplier, SupplierDelivery, MealOrder, MealPlan, Delivery,
    Incident, IncidentLog, Invoice, Settlement, Archive, Feedback, MealTopUp,
  ])],
  providers: [SeedService],
})
export class SeedModule {}
