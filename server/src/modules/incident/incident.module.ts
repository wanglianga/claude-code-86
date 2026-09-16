import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident, IncidentLog } from '../../entities/incident.entity';
import { MealOrder } from '../../entities/order.entity';
import { Invoice } from '../../entities/finance.entity';
import { Archive } from '../../entities/archive.entity';
import { IncidentService } from './incident.service';
import { IncidentController } from './incident.controller';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Incident, IncidentLog, MealOrder, Invoice, Archive]),
    OrderModule,
  ],
  providers: [IncidentService],
  controllers: [IncidentController],
})
export class IncidentModule {}
