import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Archive } from '../../entities/archive.entity';
import { MealOrder } from '../../entities/order.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { Store } from '../../entities/store.entity';
import { ArchiveController } from './archive.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Archive, MealOrder, Enterprise, Store])],
  controllers: [ArchiveController],
})
export class ArchiveModule {}
