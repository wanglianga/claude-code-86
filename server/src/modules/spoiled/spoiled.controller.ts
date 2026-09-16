import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SpoiledService } from './spoiled.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

@Controller('spoiled')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpoiledController {
  constructor(private svc: SpoiledService) {}

  /** 反馈上下文：订单商品批次、签收时间 */
  @Get('context/:orderId')
  context(@Param('orderId') orderId: string, @CurrentUser() user: User) {
    return this.svc.reportContext(+orderId, user);
  }

  /** 员工提交变质售后（批次/签收时间/温控照片/食用人员） */
  @Post('reports')
  @Roles(UserRole.ENTERPRISE, UserRole.SERVICE, UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.create(dto, user);
  }

  @Get('reports')
  list(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.list(user, query);
  }

  @Get('reports/:id')
  detail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.detail(+id, user);
  }

  /** 客服受理 */
  @Post('reports/:id/claim')
  @Roles(UserRole.SERVICE, UserRole.ADMIN)
  claim(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.claim(+id, user);
  }

  /** 客服提出批量退款 */
  @Post('reports/:id/refund-propose')
  @Roles(UserRole.SERVICE, UserRole.ADMIN)
  proposeRefund(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.proposeRefund(+id, dto, user);
  }

  /** 财务确认退款 */
  @Post('reports/:id/refund-confirm')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  confirmRefund(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.confirmRefund(+id, user);
  }

  /** 客服发起补送 */
  @Post('reports/:id/redelivery')
  @Roles(UserRole.SERVICE, UserRole.ADMIN)
  createRedelivery(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.createRedelivery(+id, dto, user);
  }

  /** 客服触发同批次下架（生成全门店任务） */
  @Post('reports/:id/recall')
  @Roles(UserRole.SERVICE, UserRole.ADMIN)
  triggerRecall(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.triggerRecall(+id, user);
  }

  /** 客服办结 */
  @Post('reports/:id/resolve')
  @Roles(UserRole.SERVICE, UserRole.ADMIN)
  resolve(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.resolve(+id, dto, user);
  }

  /** 门店售后工作台：下架任务 + 补送备货 */
  @Get('store-desk')
  @Roles(UserRole.STORE, UserRole.ADMIN, UserRole.SERVICE)
  storeDesk(@CurrentUser() user: User) {
    return this.svc.storeDesk(user);
  }

  /** 门店执行下架任务 */
  @Post('tasks/:id/handle')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  handleTask(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.handleTask(+id, dto, user);
  }

  /** 运营催办未处理门店 */
  @Post('tasks/:id/remind')
  @Roles(UserRole.ADMIN, UserRole.SERVICE)
  remind(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.remindTask(+id, user);
  }

  /** 运营复核关闭召回单 */
  @Post('recalls/:id/review')
  @Roles(UserRole.ADMIN)
  review(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.reviewRecall(+id, dto, user);
  }

  /** 骑手补送工作台 */
  @Get('courier-desk')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  courierDesk(@CurrentUser() user: User) {
    return this.svc.courierDesk(user);
  }

  @Post('redeliveries/:id/ready')
  @Roles(UserRole.STORE, UserRole.ADMIN)
  rdReady(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.redeliveryReady(+id, user);
  }

  @Post('redeliveries/:id/pickup')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  rdPickup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.redeliveryPickup(+id, user);
  }

  @Post('redeliveries/:id/deliver')
  @Roles(UserRole.LOGISTICS, UserRole.ADMIN)
  rdDeliver(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.redeliveryDeliver(+id, dto, user);
  }
}
