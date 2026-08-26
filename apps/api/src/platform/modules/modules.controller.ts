import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ToggleModuleDto } from './dto/toggle-module.dto';
import { ModulesService } from './modules.service';

@Controller('modules')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModulesController {
  constructor(private modulesService: ModulesService) {}

  @Get()
  listCatalog() {
    return this.modulesService.listCatalog();
  }

  @Get('tenant')
  listTenantModules(@TenantCtx() tenant: TenantContext) {
    return this.modulesService.listTenantModules(tenant.tenantId);
  }

  @Get('installed')
  @UseGuards(PermissionsGuard)
  @RequirePermission('modules.manage')
  listInstalledModules() {
    return this.modulesService.listInstalledModules();
  }

  @Post('install')
  @UseGuards(PermissionsGuard)
  @UseInterceptors(FileInterceptor('package'))
  @RequirePermission('modules.manage')
  installPackage(@Body('manifest') manifest: string, @UploadedFile() file: Express.Multer.File) {
    return this.modulesService.installPackage(manifest, file);
  }

  @Post(':id/update')
  @UseGuards(PermissionsGuard)
  @UseInterceptors(FileInterceptor('package'))
  @RequirePermission('modules.manage')
  updatePackage(@Param('id') id: string, @Body('manifest') manifest: string, @UploadedFile() file: Express.Multer.File) {
    return this.modulesService.updatePackage(id, manifest, file);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('modules.manage')
  uninstallPackage(@Param('id') id: string) {
    return this.modulesService.uninstallPackage(id);
  }

  @Patch(':id/toggle')
  @UseGuards(PermissionsGuard)
  @RequirePermission('modules.manage')
  toggleModule(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ToggleModuleDto,
  ) {
    return this.modulesService.toggleModule(tenant.tenantId, id, dto);
  }
}
