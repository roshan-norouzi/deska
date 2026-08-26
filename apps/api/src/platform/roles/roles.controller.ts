import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  @RequirePermission('roles.manage')
  findAll(@TenantCtx() tenant: TenantContext) {
    return this.rolesService.findAll(tenant.tenantId);
  }

  @Get('permissions')
  @RequirePermission('roles.manage')
  getAvailablePermissions() {
    return this.rolesService.getAvailablePermissions();
  }

  @Get(':id')
  @RequirePermission('roles.manage')
  findOne(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.rolesService.findOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermission('roles.manage')
  create(@TenantCtx() tenant: TenantContext, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(tenant.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('roles.manage')
  update(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('roles.manage')
  remove(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.rolesService.remove(tenant.tenantId, id);
  }

  @Put(':id/permissions')
  @RequirePermission('roles.manage')
  assignPermissions(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.rolesService.assignPermissions(tenant.tenantId, id, dto);
  }
}
