import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../../entities/user.entity';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  @Get()
  async findAll(@Query('role') role: string) {
    const where: any = {};
    if (role) where.role = role;
    const users = await this.repo.find({ where, order: { id: 'ASC' } });
    return users.map(u => ({ ...u, password: undefined }));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() dto: any) {
    const user = this.repo.create({
      username: dto.username,
      password: await bcrypt.hash(dto.password || '123456', 10),
      name: dto.name,
      role: dto.role,
      phone: dto.phone,
      enterpriseId: dto.enterpriseId ?? null,
      storeId: dto.storeId ?? null,
    });
    const saved = await this.repo.save(user);
    return { ...saved, password: undefined };
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: any) {
    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);
    else delete data.password;
    await this.repo.update({ id: +id }, data);
    const u = await this.repo.findOne({ where: { id: +id } });
    return { ...u, password: undefined };
  }
}
