import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ModulesModule } from './modules/modules.module';
import { RolesModule } from './roles/roles.module';
import { TenantModule } from './tenant/tenant.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    TenantModule,
    RolesModule,
    ModulesModule,
    HealthModule,
    NotificationsModule,
  ],
  exports: [
    AuthModule,
    TenantModule,
    RolesModule,
    ModulesModule,
  ],
})
export class PlatformModule {}
