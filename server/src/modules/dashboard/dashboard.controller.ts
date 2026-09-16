import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { User } from '../../entities/user.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private svc: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: User) {
    return this.svc.summary(user);
  }
}
