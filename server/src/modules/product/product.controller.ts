import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductController {
  constructor(@InjectRepository(Product) private repo: Repository<Product>) {}

  @Get()
  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: Partial<Product>) {
    return this.repo.save(this.repo.create(dto as any));
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: Partial<Product>) {
    await this.repo.update({ id: +id }, dto as any);
    return this.repo.findOne({ where: { id: +id } });
  }
}
