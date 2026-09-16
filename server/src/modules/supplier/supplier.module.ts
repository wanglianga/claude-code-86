import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier, SupplierDelivery } from '../../entities/supplier.entity';
import { SupplierController } from './supplier.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierDelivery])],
  controllers: [SupplierController],
})
export class SupplierModule {}
