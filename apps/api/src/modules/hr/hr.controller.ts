import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import {
  CreateApplicantDto,
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateJobOpeningDto,
  UpdateApplicantDto,
  UpdateDepartmentDto,
  UpdateEmployeeDto,
  UpdateJobOpeningDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('hr')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get('dashboard')
  @RequirePermission('hr.employee.view')
  getDashboard(@TenantCtx() tenant: TenantContext) {
    return this.hrService.getDashboardStats(tenant.tenantId);
  }

  // --- Departments ---

  @Get('departments')
  @RequirePermission('hr.employee.view')
  findDepartments(@TenantCtx() tenant: TenantContext) {
    return this.hrService.findDepartments(tenant.tenantId);
  }

  @Get('departments/:id')
  @RequirePermission('hr.employee.view')
  findDepartment(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.findDepartment(tenant.tenantId, id);
  }

  @Post('departments')
  @RequirePermission('hr.employee.manage')
  createDepartment(@TenantCtx() tenant: TenantContext, @Body() body: CreateDepartmentDto) {
    return this.hrService.createDepartment(tenant.tenantId, body);
  }

  @Patch('departments/:id')
  @RequirePermission('hr.employee.manage')
  updateDepartment(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateDepartmentDto,
  ) {
    return this.hrService.updateDepartment(tenant.tenantId, id, body);
  }

  @Delete('departments/:id')
  @RequirePermission('hr.employee.manage')
  removeDepartment(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.removeDepartment(tenant.tenantId, id);
  }

  // --- Employees ---

  @Get('employees')
  @RequirePermission('hr.employee.view')
  findEmployees(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) {
    return this.hrService.findEmployees(tenant.tenantId, status);
  }

  @Get('employees/:id/profile')
  @RequirePermission('hr.employee.view')
  findEmployeeProfile(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.findEmployeeProfile(tenant.tenantId, id);
  }

  @Get('employees/:id')
  @RequirePermission('hr.employee.view')
  findEmployee(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.findEmployee(tenant.tenantId, id);
  }

  @Post('employees')
  @RequirePermission('hr.employee.manage')
  createEmployee(@TenantCtx() tenant: TenantContext, @Body() body: CreateEmployeeDto) {
    return this.hrService.createEmployee(tenant.tenantId, body);
  }

  @Patch('employees/:id')
  @RequirePermission('hr.employee.manage')
  updateEmployee(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.hrService.updateEmployee(tenant.tenantId, id, body);
  }

  @Delete('employees/:id')
  @RequirePermission('hr.employee.manage')
  removeEmployee(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.removeEmployee(tenant.tenantId, id);
  }


  // --- Job Openings ---

  @Get('job-openings')
  @RequirePermission('hr.recruitment.view')
  findJobOpenings(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) {
    return this.hrService.findJobOpenings(tenant.tenantId, status);
  }

  @Get('job-openings/:id')
  @RequirePermission('hr.recruitment.view')
  findJobOpening(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.findJobOpening(tenant.tenantId, id);
  }

  @Post('job-openings')
  @RequirePermission('hr.recruitment.manage')
  createJobOpening(@TenantCtx() tenant: TenantContext, @Body() body: CreateJobOpeningDto) {
    return this.hrService.createJobOpening(tenant.tenantId, body);
  }

  @Patch('job-openings/:id')
  @RequirePermission('hr.recruitment.manage')
  updateJobOpening(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateJobOpeningDto,
  ) {
    return this.hrService.updateJobOpening(tenant.tenantId, id, body);
  }

  @Delete('job-openings/:id')
  @RequirePermission('hr.recruitment.manage')
  removeJobOpening(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.removeJobOpening(tenant.tenantId, id);
  }

  // --- Applicants ---

  @Get('job-openings/:openingId/applicants')
  @RequirePermission('hr.recruitment.view')
  findApplicants(
    @TenantCtx() tenant: TenantContext,
    @Param('openingId') openingId: string,
  ) {
    return this.hrService.findApplicants(tenant.tenantId, openingId);
  }

  @Post('job-openings/:openingId/applicants')
  @RequirePermission('hr.recruitment.manage')
  createApplicant(
    @TenantCtx() tenant: TenantContext,
    @Param('openingId') openingId: string,
    @Body() body: CreateApplicantDto,
  ) {
    return this.hrService.createApplicant(tenant.tenantId, openingId, body);
  }

  @Patch('applicants/:id/hire')
  @RequirePermission('hr.recruitment.manage')
  hireApplicant(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.hireApplicant(tenant.tenantId, id);
  }

  @Patch('applicants/:id')
  @RequirePermission('hr.recruitment.manage')
  updateApplicant(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateApplicantDto,
  ) {
    return this.hrService.updateApplicant(tenant.tenantId, id, body);
  }

  @Delete('applicants/:id')
  @RequirePermission('hr.recruitment.manage')
  removeApplicant(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.hrService.removeApplicant(tenant.tenantId, id);
  }

}

