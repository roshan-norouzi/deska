import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @RequirePermission('dashboard.view')
  getStats(@TenantCtx() tenant: TenantContext) {
    return this.dashboardService.getStats(tenant.tenantId);
  }
}
