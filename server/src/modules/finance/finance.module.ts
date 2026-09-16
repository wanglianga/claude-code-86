import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice, Settlement } from '../../entities/finance.entity';
import { MealOrder } from '../../entities/order.entity';
import { Enterprise, Contract } from '../../entities/enterprise.entity';
import { Archive } from '../../entities/archive.entity';
import { Incident } from '../../entities/incident.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, Settlement, MealOrder, Enterprise, Contract, Archive, Incident])],
  providers: [FinanceService],
  controllers: [FinanceController],
})
export class FinanceModule {}
