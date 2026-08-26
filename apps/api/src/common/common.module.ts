import { Global, Module } from '@nestjs/common';
import { NumberingService } from './services/numbering.service';
import {
  ActivityService,
  AuditService,
  NotificationService,
} from './services/audit.service';

@Global()
@Module({
  providers: [NumberingService, AuditService, ActivityService, NotificationService],
  exports: [NumberingService, AuditService, ActivityService, NotificationService],
})
export class CommonModule {}
