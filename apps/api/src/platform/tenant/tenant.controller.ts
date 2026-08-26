import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PLATFORM_ROLES } from '@deska/shared';
import { User, TenantCtx } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantService } from './tenant.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get()
  findAll(@User() user: AuthUser) {
    const isSuperAdmin = user.role === PLATFORM_ROLES.SUPER_ADMIN;
    return this.tenantService.findAll(user.id, isSuperAdmin);
  }

  @Post()
  create(@User() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.tenantService.create(user.id, dto);
  }

  @Get('current')
  @UseGuards(TenantGuard)
  getCurrent(@TenantCtx() tenant: TenantContext) {
    return this.tenantService.getCurrent(tenant.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(TenantGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @TenantCtx() tenant: TenantContext,
  ) {
    return this.tenantService.update(id, dto, tenant.memberRole);
  }

  @Post(':id/invite')
  @UseGuards(TenantGuard)
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @TenantCtx() tenant: TenantContext,
  ) {
    return this.tenantService.inviteMember(id, dto, tenant.memberRole);
  }

  @Post('invites/accept')
  acceptInvite(@User() user: AuthUser, @Body() dto: AcceptInviteDto) {
    return this.tenantService.acceptInvite(user.id, dto);
  }

  @Get(':id/members')
  @UseGuards(TenantGuard)
  listMembers(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    return this.tenantService.listMembers(id, tenant.memberRole);
  }

  @Get(':id/departments')
  @UseGuards(TenantGuard)
  listDepartments(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    return this.tenantService.listDepartments(id, tenant.memberRole);
  }

  @Patch(':id/members/:userId')
  @UseGuards(TenantGuard)
  updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @TenantCtx() tenant: TenantContext,
  ) {
    return this.tenantService.updateMember(id, userId, dto, tenant.memberRole);
  }

  @Delete(':id/members/:userId')
  @UseGuards(TenantGuard)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @User() user: AuthUser,
    @TenantCtx() tenant: TenantContext,
  ) {
    return this.tenantService.removeMember(id, userId, user.id, tenant.memberRole);
  }
}
