import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { EnterpriseService } from './enterprise.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('enterprises')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnterpriseController {
  constructor(private svc: EnterpriseService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SERVICE, UserRole.FINANCE, UserRole.ENTERPRISE)
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(+id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.ENTERPRISE)
  update(@Param('id') id: string, @Body() dto: any) {
    return this.svc.update(+id, dto);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.svc.stats(+id);
  }

  @Post(':id/contracts')
  @Roles(UserRole.ADMIN)
  createContract(@Param('id') id: string, @Body() dto: any) {
    return this.svc.createContract({ ...dto, enterpriseId: +id });
  }

  @Put('contracts/:cid')
  @Roles(UserRole.ADMIN)
  updateContract(@Param('cid') cid: string, @Body() dto: any) {
    return this.svc.updateContract(+cid, dto);
  }
}
