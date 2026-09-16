import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private svc: FinanceService) {}

  @Get('invoices')
  @Roles(UserRole.FINANCE, UserRole.ADMIN, UserRole.ENTERPRISE, UserRole.SERVICE)
  invoices(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.listInvoices(user, query);
  }

  @Post('invoices/:id/issue')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  issue(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.issueInvoice(+id, user);
  }

  @Post('invoices/:id/reissue')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  reissue(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.reissueInvoice(+id, dto, user);
  }

  @Get('settlements')
  @Roles(UserRole.FINANCE, UserRole.ADMIN, UserRole.ENTERPRISE)
  settlements(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.listSettlements(user, query);
  }

  @Get('settlements/:id/orders')
  settlementOrders(@Param('id') id: string) {
    return this.svc.settlementOrders(+id);
  }

  @Post('settlements/generate')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  generate(@Body() dto: any) {
    return this.svc.generateSettlement(+dto.enterpriseId, dto.month);
  }

  @Post('settlements/:id/confirm')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  confirm(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.confirmSettlement(+id, user);
  }

  @Post('settlements/:id/invoice')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  invoice(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.invoiceSettlement(+id, user);
  }

  @Post('settlements/:id/pay')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  pay(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.paySettlement(+id, user);
  }
}
