import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private svc: OrderService) {}

  @Post()
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.create(dto, user);
  }

  @Post('preview')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  preview(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.preview(dto, user);
  }

  @Get()
  list(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.list(user, query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  @Post(':id/confirm')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  confirm(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.confirm(+id, user);
  }

  @Post(':id/replan')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  replan(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.replan(+id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.cancel(+id, user);
  }

  @Post(':id/adjust')
  @Roles(UserRole.ENTERPRISE, UserRole.SERVICE, UserRole.ADMIN)
  adjust(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.adjust(+id, dto, user);
  }

  @Post(':id/prepare')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  prepare(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.prepare(+id, user);
  }

  @Post(':id/ready')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  ready(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.ready(+id, user);
  }

  @Post(':id/sign')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  sign(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.sign(+id, dto, user);
  }

  @Post(':id/feedback')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  feedback(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.feedback(+id, dto, user);
  }
}
