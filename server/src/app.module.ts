import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Enterprise, Contract } from './entities/enterprise.entity';
import { Store, StoreShift } from './entities/store.entity';
import { Product } from './entities/product.entity';
import { InventoryBatch, Transfer } from './entities/inventory.entity';
import { MealOrder, MealPlan } from './entities/order.entity';
import { Delivery } from './entities/delivery.entity';
import { Incident, IncidentLog } from './entities/incident.entity';
import { Invoice, Settlement } from './entities/finance.entity';
import { Archive, Feedback } from './entities/archive.entity';
import { Supplier, SupplierDelivery } from './entities/supplier.entity';
import { Notification } from './entities/notification.entity';
import { MealTopUp } from './entities/topup.entity';
import { SpoiledReport, BatchRecall, RecallTask, Redelivery } from './entities/spoiled.entity';
import { NearExpiryOffer, SettlementAttachment } from './entities/near-expiry.entity';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationModule } from './modules/notification/notification.module';
import { EnterpriseModule } from './modules/enterprise/enterprise.module';
import { StoreModule } from './modules/store/store.module';
import { ProductModule } from './modules/product/product.module';
import { UserModule } from './modules/user/user.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrderModule } from './modules/order/order.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { IncidentModule } from './modules/incident/incident.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ArchiveModule } from './modules/archive/archive.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TopUpModule } from './modules/topup/topup.module';
import { SpoiledModule } from './modules/spoiled/spoiled.module';
import { NearExpiryModule } from './modules/near-expiry/near-expiry.module';
import { SeedModule } from './seed/seed.module';
import { CoreModule } from './core/core.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'freshmeal',
      entities: [
        User, Enterprise, Contract, Store, StoreShift, Product,
        InventoryBatch, Transfer, MealOrder, MealPlan, Delivery,
        Incident, IncidentLog, Invoice, Settlement, Archive, Feedback,
        Supplier, SupplierDelivery, Notification, MealTopUp,
        SpoiledReport, BatchRecall, RecallTask, Redelivery,
        NearExpiryOffer, SettlementAttachment,
      ],
      synchronize: true,
      retryAttempts: 10,
      retryDelay: 3000,
    }),
    CoreModule,
    NotificationModule,
    AuthModule,
    EnterpriseModule,
    StoreModule,
    ProductModule,
    UserModule,
    InventoryModule,
    OrderModule,
    DeliveryModule,
    IncidentModule,
    FinanceModule,
    ArchiveModule,
    SupplierModule,
    DashboardModule,
    TopUpModule,
    SpoiledModule,
    NearExpiryModule,
    SeedModule,
  ],
})
export class AppModule {}
