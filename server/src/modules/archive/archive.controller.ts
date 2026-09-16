import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Archive } from '../../entities/archive.entity';
import { MealOrder } from '../../entities/order.entity';
import { Enterprise } from '../../entities/enterprise.entity';
import { Store } from '../../entities/store.entity';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('archives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchiveController {
  constructor(
    @InjectRepository(Archive) private repo: Repository<Archive>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
  ) {}

  @Get()
  async list(@CurrentUser() user: User, @Query('enterpriseId') enterpriseId: string) {
    const where: any = {};
    if (user.role === UserRole.ENTERPRISE) where.enterpriseId = user.enterpriseId;
    else if (enterpriseId) where.enterpriseId = +enterpriseId;
    const list = await this.repo.find({ where, order: { id: 'DESC' }, take: 200 });
    const orders = await this.orderRepo.find();
    const omap = new Map(orders.map(o => [o.id, o]));
    const enterprises = await this.enterpriseRepo.find();
    const emap = new Map(enterprises.map(e => [e.id, e.name]));
    const stores = await this.storeRepo.find();
    const smap = new Map(stores.map(s => [s.id, s.name]));
    return list.map(a => ({
      ...a,
      order: omap.get(a.orderId),
      enterpriseName: emap.get(a.enterpriseId),
      storeName: smap.get(a.storeId),
    }));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const a = await this.repo.findOne({ where: { id: +id } });
    const order = await this.orderRepo.findOne({ where: { id: a.orderId } });
    return { ...a, order };
  }
}
