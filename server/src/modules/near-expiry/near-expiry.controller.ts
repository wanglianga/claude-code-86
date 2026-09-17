import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NearExpiryService } from './near-expiry.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('near-expiry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NearExpiryController {
  constructor(private svc: NearExpiryService) {}

  /** 平台临期池 + 可推荐团餐单候选 */
  @Get('pool')
  @Roles(UserRole.ADMIN, UserRole.SERVICE, UserRole.STORE, UserRole.FINANCE)
  pool(@CurrentUser() user: User, @Query('storeId') storeId: string) {
    return this.svc.pool(user, storeId ? +storeId : undefined);
  }

  /** 平台为团餐单推荐/刷新折扣方案 */
  @Post('orders/:orderId/recommend')
  @Roles(UserRole.ADMIN, UserRole.SERVICE)
  recommend(@Param('orderId') orderId: string, @CurrentUser() user: User) {
    return this.svc.recommend(+orderId, user);
  }

  /** 企业行政查看本团餐单的折扣方案 */
  @Get('orders/:orderId')
  listByOrder(@Param('orderId') orderId: string) {
    return this.svc.listByOrder(+orderId);
  }

  /** 方案列表（按角色过滤） */
  @Get('offers')
  list(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.listOffers(user, query);
  }

  @Get('offers/:id')
  detail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.detail(+id, user);
  }

  /** 企业行政接受折扣方案（确认快照写入团餐单 + 月结附件） */
  @Post('offers/:id/accept')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  accept(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.accept(+id, dto, user);
  }

  /** 企业行政拒绝折扣方案 */
  @Post('offers/:id/reject')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN)
  reject(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.reject(+id, dto, user);
  }

  /** 月结附件（企业确认记录；企业/财务/运营） */
  @Get('attachments')
  @Roles(UserRole.ENTERPRISE, UserRole.FINANCE, UserRole.ADMIN, UserRole.SERVICE)
  attachments(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.listAttachments(user, query);
  }
}
