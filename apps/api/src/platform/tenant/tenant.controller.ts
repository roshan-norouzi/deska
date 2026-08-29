import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ForbiddenException,
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
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
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
  @UseGuards(TenantGuard)
  findOne(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.findOne(tenant.tenantId);
  }

  @Patch(':id')
  @UseGuards(TenantGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.update(tenant.tenantId, dto, tenant.memberRole);
  }

  @Post(':id/invite')
  @UseGuards(TenantGuard)
  invite(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
    @User() user: AuthUser,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.inviteMember(tenant.tenantId, dto, tenant.memberRole, user.id);
  }

  @Post('invites/accept')
  acceptInvite(@User() user: AuthUser, @Body() dto: AcceptInviteDto) {
    return this.tenantService.acceptInvite(user.id, dto);
  }

  @Get(':id/members')
  @UseGuards(TenantGuard)
  listMembers(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.listMembers(tenant.tenantId, tenant.memberRole);
  }

  @Get(':id/departments')
  @UseGuards(TenantGuard)
  listDepartments(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.listDepartments(tenant.tenantId, tenant.memberRole);
  }

  @Patch(':id/members/:userId')
  @UseGuards(TenantGuard)
  updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.updateMember(tenant.tenantId, userId, dto, tenant.memberRole);
  }

  @Delete(':id/members/:userId')
  @UseGuards(TenantGuard)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @User() user: AuthUser,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.removeMember(tenant.tenantId, userId, user.id, tenant.memberRole);
  }

  @Get(':id/invitations')
  @UseGuards(TenantGuard)
  listInvitations(@Param('id') id: string, @TenantCtx() tenant: TenantContext) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.listInvitations(tenant.tenantId, tenant.memberRole);
  }

  @Post(':id/invitations/:invitationId/resend')
  @UseGuards(TenantGuard)
  resendInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @User() user: AuthUser,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.resendInvitation(
      tenant.tenantId,
      invitationId,
      tenant.memberRole,
      user.id,
    );
  }

  @Delete(':id/invitations/:invitationId')
  @UseGuards(TenantGuard)
  revokeInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.revokeInvitation(tenant.tenantId, invitationId, tenant.memberRole);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(TenantGuard)
  transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
    @User() user: AuthUser,
    @TenantCtx() tenant: TenantContext,
  ) {
    this.assertTenantMatch(id, tenant.tenantId);
    return this.tenantService.transferOwnership(
      tenant.tenantId,
      dto.targetUserId,
      user.id,
      tenant.memberRole,
    );
  }

  private assertTenantMatch(routeTenantId: string, activeTenantId: string) {
    if (routeTenantId !== activeTenantId) {
      throw new ForbiddenException('شناسه سازمان مسیر با سازمان فعال یکسان نیست');
    }
  }
}
