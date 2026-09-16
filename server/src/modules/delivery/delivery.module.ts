import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from '../../entities/delivery.entity';
import { MealOrder } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { Store } from '../../entities/store.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { MealTopUp } from '../../entities/topup.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery, MealOrder, Incident, Store, Enterprise, MealTopUp])],
  providers: [DeliveryService],
  controllers: [DeliveryController],
})
export class DeliveryModule {}
