import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(private svc: DeliveryService) {}

  @Get()
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN, UserRole.SERVICE, UserRole.STORE)
  list(@CurrentUser() user: User) {
    return this.svc.list(user);
  }

  @Post(':id/outbound')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  outbound(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.outbound(+id, dto, user);
  }

  @Post(':id/pickup')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  pickup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.pickup(+id, user);
  }

  @Post(':id/deliver')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  deliver(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.deliver(+id, user);
  }
}
