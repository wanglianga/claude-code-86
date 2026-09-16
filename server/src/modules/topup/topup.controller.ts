import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TopUpService } from './topup.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('topups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TopUpController {
  constructor(private svc: TopUpService) {}

  /** 第一步：核查周边门店库存/批次/产能/配送容量/发票金额（不落库扣减） */
  @Post('order/:orderId/check')
  @Roles(UserRole.ENTERPRISE, UserRole.SERVICE, UserRole.ADMIN)
  check(@Param('orderId') orderId: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.check(+orderId, dto, user);
  }

  /** 某团餐单的全部临时加餐记录 */
  @Get('order/:orderId')
  listByOrder(@Param('orderId') orderId: string) {
    return this.svc.listByOrder(+orderId);
  }

  /** 第二步：企业确认加餐（扣库存、更新订单/配送/发票、同步三方） */
  @Post(':id/confirm')
  @Roles(UserRole.ENTERPRISE, UserRole.SERVICE, UserRole.ADMIN)
  confirm(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.confirm(+id, user);
  }

  /** 第三步：门店按企业名单完成特殊餐贴标后确认 */
  @Post(':id/label')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  label(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.label(+id, dto, user);
  }

  /** 取消未确认的核查单 */
  @Post(':id/cancel')
  @Roles(UserRole.ENTERPRISE, UserRole.SERVICE, UserRole.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.cancel(+id, user);
  }

  /** 门店拣货清单（原方案 + 临时追加，特殊餐标分组，防漏贴） */
  @Get('picklist')
  @Roles(UserRole.STORE, UserRole.ADMIN, UserRole.SERVICE)
  pickList(@CurrentUser() user: User, @Query('storeId') storeId: string) {
    return this.svc.pickList(user, storeId ? +storeId : null);
  }
}
