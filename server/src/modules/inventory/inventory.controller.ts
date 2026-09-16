import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Get('batches')
  @Roles(UserRole.ADMIN, UserRole.STORE, UserRole.SERVICE)
  batches(@Query() query: any, @CurrentUser() user: User) {
    return this.svc.listBatches(query, user);
  }

  @Post('batches')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  createBatch(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.createBatch(dto, user);
  }

  @Post('batches/:id/dispose')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  dispose(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.dispose(+id, user);
  }

  @Get('near-expiry')
  nearExpiry(@Query('storeId') storeId: string) {
    return this.svc.nearExpiry(storeId ? +storeId : undefined);
  }

  @Get('transfers')
  transfers(@CurrentUser() user: User) {
    return this.svc.listTransfers(user);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  createTransfer(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.createTransfer(dto, user);
  }

  @Post('transfers/:id/accept')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  accept(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.acceptTransfer(+id, user);
  }

  @Post('transfers/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.STORE)
  reject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.rejectTransfer(+id, user);
  }
}
