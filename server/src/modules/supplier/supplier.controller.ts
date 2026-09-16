import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier, SupplierDelivery } from '../../entities/supplier.entity';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';
import { NotificationService } from '../notification/notification.service';
import { BadRequestException } from '@nestjs/common';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierController {
  constructor(
    @InjectRepository(Supplier) private supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierDelivery) private deliveryRepo: Repository<SupplierDelivery>,
    private notify: NotificationService,
  ) {}

  @Get()
  suppliers() {
    return this.supplierRepo.find({ order: { id: 'ASC' } });
  }

  @Post()
  @Roles(UserRole.ADMIN)
  createSupplier(@Body() dto: any) {
    return this.supplierRepo.save(this.supplierRepo.create(dto));
  }

  @Get('deliveries')
  async deliveries(@CurrentUser() user: User) {
    const where: any = user.storeId ? { storeId: user.storeId } : {};
    const list = await this.deliveryRepo.find({ where, order: { expectedAt: 'DESC' }, take: 100 });
    const suppliers = await this.supplierRepo.find();
    const smap = new Map(suppliers.map(s => [s.id, s.name]));
    return list.map(d => ({ ...d, supplierName: smap.get(d.supplierId) }));
  }

  @Post('deliveries')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  createDelivery(@Body() dto: any, @CurrentUser() user: User) {
    const d = this.deliveryRepo.create({
      supplierId: +dto.supplierId,
      storeId: user.storeId || +dto.storeId,
      expectedAt: new Date(dto.expectedAt),
      items: dto.items || [],
      note: dto.note,
      status: 'SCHEDULED',
    });
    return this.deliveryRepo.save(d);
  }

  /** 门店登记到货；晚于预期即标记延迟并预警 */
  @Post('deliveries/:id/arrive')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  async arrive(@Param('id') id: string) {
    const d = await this.deliveryRepo.findOne({ where: { id: +id } });
    if (!d) throw new BadRequestException('到货单不存在');
    d.arrivedAt = new Date();
    d.status = d.arrivedAt > new Date(d.expectedAt) ? 'DELAYED' : 'ARRIVED';
    await this.deliveryRepo.save(d);
    if (d.status === 'DELAYED') {
      const mins = Math.round((d.arrivedAt.getTime() - new Date(d.expectedAt).getTime()) / 60000);
      await this.notify.send({
        role: 'STORE', storeId: d.storeId,
        title: '供应商延迟到货',
        content: `到货单 #${d.id} 延迟 ${mins} 分钟到货，请评估对鲜食生产批次与团餐备货的影响`,
        type: 'INVENTORY',
      });
    }
    return d;
  }
}
