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

  /** 门店/运营为团餐单推荐临期折扣方案（扫描本店+周边门店临期批次，不扣库存） */
  @Post('order/:orderId/recommend')
  @Roles(UserRole.STORE, UserRole.ADMIN, UserRole.SERVICE)
  recommend(@Param('orderId') orderId: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.recommend(+orderId, dto || {}, user);
  }

  /** 某团餐单的全部临期折扣方案 */
  @Get('order/:orderId')
  listByOrder(@Param('orderId') orderId: string) {
    return this.svc.listByOrder(+orderId);
  }

  /** 方案详情 */
  @Get('offers/:id')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  /** 企业行政确认折扣方案（锁定批次、写入团餐单、逐份标记、确认快照入月结附件） */
  @Post('offers/:id/confirm')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN, UserRole.SERVICE)
  confirm(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.confirm(+id, user);
  }

  /** 企业拒绝 */
  @Post('offers/:id/reject')
  @Roles(UserRole.ENTERPRISE, UserRole.ADMIN, UserRole.SERVICE)
  reject(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.reject(+id, dto || {}, user);
  }

  /** 门店逐份贴标确认 */
  @Post('offers/:id/label')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  label(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.label(+id, dto || {}, user);
  }

  /** 门店拣货视角：已确认临期折扣方案与逐份标记 */
  @Get('pick-offers')
  @Roles(UserRole.STORE, UserRole.ADMIN, UserRole.SERVICE, UserRole.LOGISTICS)
  pickOffers(@CurrentUser() user: User, @Query('storeId') storeId: string) {
    return this.svc.pickOffers(user.storeId || +storeId);
  }
}
