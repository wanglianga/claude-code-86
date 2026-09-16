import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoreController {
  constructor(private svc: StoreService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(+id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(+id, dto);
  }

  @Get(':id/balance')
  balance(@Param('id') id: string, @Query('date') date: string) {
    return this.svc.balance(+id, date);
  }

  @Get(':id/shifts')
  shifts(@Param('id') id: string) {
    return this.svc.shifts(+id);
  }

  @Post(':id/shifts')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  createShift(@Param('id') id: string, @Body() dto: any) {
    return this.svc.createShift({ ...dto, storeId: +id });
  }
}
