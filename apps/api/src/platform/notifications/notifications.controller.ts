import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { NotificationService } from '../../common/services/audit.service';
import { User } from '../../common/decorators/params.decorator';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(private notifications: NotificationService) {}

  @Get()
  list(@User() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Get('unread')
  unread(@User() user: AuthUser) {
    return this.notifications.list(user.id, true);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @User() user: AuthUser) {
    return this.notifications.markRead(id, user.id);
  }
}
