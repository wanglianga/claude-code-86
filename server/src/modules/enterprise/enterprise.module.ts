import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Archive } from '../../entities/archive.entity';
import { MealOrder } from '../../entities/order.entity';
import { Incident } from '../../entities/incident.entity';
import { Invoice } from '../../entities/finance.entity';
import { EnterpriseService } from './enterprise.service';
import { EnterpriseController } from './enterprise.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Enterprise, Contract, Archive, MealOrder, Incident, Invoice])],
  providers: [EnterpriseService],
  controllers: [EnterpriseController],
  exports: [EnterpriseService],
})
export class EnterpriseModule {}
