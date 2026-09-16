import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IncidentService } from './incident.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { User } from '../../entities/user.entity';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentController {
  constructor(private svc: IncidentService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: any) {
    return this.svc.list(user, query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  @Post()
  create(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.create(dto, user);
  }

  @Post(':id/action')
  action(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: User) {
    return this.svc.action(+id, dto, user);
  }
}
