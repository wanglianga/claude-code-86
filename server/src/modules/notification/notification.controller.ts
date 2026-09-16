import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { User } from '../../entities/user.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private svc: NotificationService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('unread') unread: string) {
    return this.svc.listFor(user, unread === '1');
  }

  @Get('unread-count')
  count(@CurrentUser() user: User) {
    return this.svc.unreadCount(user);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.markRead(+id, user);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: User) {
    return this.svc.markAllRead(user);
  }
}
