import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MODULE_CATALOG, TENANT_ROLES, normalizeEmployeeProfile, pickProvidedProfileFields } from '@deska/shared';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ensureEmployeeForUser, syncTenantMemberEmployees } from './tenant-employee-sync';
import {
  applyEmployeeProfileToUpdate,
  assertUniqueNationalId,
  assertValidEmployeeProfile,
  resolveUserDisplayName,
} from './employee-profile.helper';
import { serializeEmployeeForApi } from './employee-profile-backfill';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async findAll(userId: string, isSuperAdmin: boolean) {
    if (isSuperAdmin) {
      return this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          primaryOwner: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true } },
        },
      });
    }

    const memberships = await this.prisma.tenantMember.findMany({
      where: { userId, status: 'active' },
      include: {
        tenant: {
          include: {
            primaryOwner: { select: { id: true, name: true, email: true } },
            _count: { select: { members: true } },
          },
        },
      },
    });

    return memberships.map((m: { tenant: Record<string, unknown>; role: string }) => ({
      ...m.tenant,
      memberRole: m.role,
      membershipStatus: (m as { status?: string }).status ?? 'active',
      joinedAt: (m as { joinedAt?: Date }).joinedAt,
    }));
  }

  async create(userId: string, dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('این شناسه URL قبلاً استفاده شده است');
    }

    const plan = dto.plan ?? 'starter';

    const tenant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          plan,
          locale: dto.locale ?? 'fa-IR',
          status: 'active',
          createdByUserId: userId,
          primaryOwnerUserId: userId,
        },
      });

      await tx.tenantMember.create({
        data: {
          tenantId: created.id,
          userId,
          role: TENANT_ROLES.OWNER,
          status: 'active',
        },
      });

      for (const mod of MODULE_CATALOG) {
        const isCore = 'isCore' in mod ? mod.isCore : false;
        await tx.moduleDefinition.upsert({
          where: { id: mod.id },
          create: {
            id: mod.id,
            name: mod.name,
            domain: mod.domain,
            version: mod.version,
            dependencies: [...mod.dependencies],
            isCore,
          },
          update: {},
        });

        await tx.tenantModule.create({
          data: {
            tenantId: created.id,
            moduleId: mod.id,
            enabled: isCore,
          },
        });
      }

      await tx.roleDefinition.create({
        data: {
          tenantId: created.id,
          name: 'مدیر',
          description: 'دسترسی کامل به سازمان',
          isSystem: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: created.id,
          userId,
          action: 'organization.created',
          entityType: 'Tenant',
          entityId: created.id,
          changes: { name: created.name, slug: created.slug },
        },
      });

      return created;
    });

    return tenant;
  }

  async findOne(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { members: true, modules: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return tenant;
  }

  async getCurrent(tenantId: string) {
    return this.findOne(tenantId);
  }

  async update(tenantId: string, dto: UpdateTenantDto, memberRole: string) {
    this.assertAdmin(memberRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.plan !== undefined && { plan: dto.plan }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async inviteMember(
    tenantId: string,
    dto: InviteMemberDto,
    memberRole: string,
    invitedByUserId?: string,
  ) {
    this.assertAdmin(memberRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const email = dto.email.toLowerCase();

    if (dto.password) {
      const providedProfile = pickProvidedProfileFields(dto);
      assertValidEmployeeProfile(providedProfile, { requireAll: false });
      const displayName = resolveUserDisplayName(dto) || email.split('@')[0] || 'کارمند';

      return this.createMemberWithAccount(tenantId, {
        email,
        name: displayName,
        role: dto.role,
        password: dto.password,
        employeeCode: dto.employeeCode,
        jobTitle: dto.jobTitle,
        departmentId: dto.departmentId,
        hireDate: dto.hireDate,
        profile: dto,
      });
    }

    const existingMember = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingMember) {
      const membership = await this.prisma.tenantMember.findUnique({
        where: {
          tenantId_userId: { tenantId, userId: existingMember.id },
        },
      });

      if (membership) {
        throw new ConflictException('این کاربر قبلاً عضو سازمان است');
      }
    }

    const pendingInvite = await this.prisma.tenantInvitation.findFirst({
      where: {
        tenantId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (pendingInvite) {
      throw new ConflictException('دعوت‌نامه فعالی برای این ایمیل وجود دارد');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.tenantInvitation.create({
      data: {
        tenantId,
        email,
        role: dto.role,
        token: tokenHash,
        tokenHash,
        status: 'pending',
        invitedByUserId,
        expiresAt,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      token,
      expiresAt: invitation.expiresAt,
    };
  }

  private async createMemberWithAccount(
    tenantId: string,
    data: {
      email: string;
      name: string;
      role: string;
      password: string;
      employeeCode?: string;
      jobTitle?: string;
      departmentId?: string;
      hireDate?: string;
      profile: InviteMemberDto;
    },
  ) {
    if (data.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان تعیین نقش مالک از این مسیر وجود ندارد');
    }

    let user = await this.prisma.user.findUnique({ where: { email: data.email } });

    if (user) {
      const membership = await this.prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });
      if (membership) {
        throw new ConflictException('این کاربر قبلاً عضو سازمان است');
      }
      throw new ConflictException(
        'برای کاربر موجود امکان تعیین رمز عبور وجود ندارد؛ دعوت‌نامه بدون رمز ارسال کنید',
      );
    } else {
      user = await this.authService.registerUser({
        email: data.email,
        name: data.name,
        password: data.password,
      });
    }

    await this.prisma.tenantMember.create({
      data: {
        tenantId,
        userId: user.id,
        role: data.role,
        status: 'active',
        jobTitle: data.jobTitle,
      },
    });

    const employee = await ensureEmployeeForUser(this.prisma, tenantId, user.id, new Date());

    await assertUniqueNationalId(
      this.prisma,
      tenantId,
      normalizeEmployeeProfile(pickProvidedProfileFields(data.profile)).nationalId,
      employee.id,
    );

    const employeeUpdate: Prisma.EmployeeUpdateInput = {};
    applyEmployeeProfileToUpdate(data.profile, employeeUpdate);

    if (data.employeeCode) {
      const duplicateCode = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          employeeCode: data.employeeCode,
          NOT: { id: employee.id },
        },
      });
      if (duplicateCode) {
        throw new ConflictException('این کد پرسنلی قبلاً استفاده شده است');
      }
      employeeUpdate.employeeCode = data.employeeCode;
    }
    if (data.jobTitle) {
      employeeUpdate.jobTitle = data.jobTitle;
    }
    if (data.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: data.departmentId, tenantId },
      });
      if (!department) {
        throw new NotFoundException('واحد سازمانی یافت نشد');
      }
      employeeUpdate.department = { connect: { id: data.departmentId } };
    }
    if (data.hireDate) {
      employeeUpdate.hireDate = new Date(data.hireDate);
    }
    if (Object.keys(employeeUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: employeeUpdate,
      });
    }

    return this.getMemberWithEmployee(tenantId, user.id);
  }

  async acceptInvite(userId: string, dto: AcceptInviteDto) {
    const tokenHash = this.hashInvitationToken(dto.token);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: {
        OR: [{ tokenHash }, { token: tokenHash }, { token: dto.token }],
      },
      include: { tenant: true },
    });

    if (!invitation) {
      throw new NotFoundException('دعوت‌نامه یافت نشد');
    }

    if (invitation.accepted || invitation.status === 'accepted') {
      throw new BadRequestException('این دعوت‌نامه قبلاً پذیرفته شده است');
    }

    if (invitation.status === 'revoked' || invitation.revokedAt) {
      throw new BadRequestException('این دعوت‌نامه لغو شده است');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('دعوت‌نامه منقضی شده است');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException('این دعوت‌نامه برای ایمیل شما صادر نشده است');
    }

    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
    });

    if (existing) {
      throw new ConflictException('شما قبلاً عضو این سازمان هستید');
    }

    await this.prisma.$transaction([
      this.prisma.tenantMember.create({
        data: {
          tenantId: invitation.tenantId,
          userId,
          role: invitation.role,
          status: 'active',
        },
      }),
      this.prisma.tenantInvitation.update({
        where: { id: invitation.id },
        data: { accepted: true, status: 'accepted', acceptedAt: new Date() },
      }),
    ]);

    await ensureEmployeeForUser(
      this.prisma,
      invitation.tenantId,
      userId,
      new Date(),
    );

    return {
      tenantId: invitation.tenantId,
      tenantName: invitation.tenant.name,
      role: invitation.role,
    };
  }

  async listMembers(tenantId: string, requesterRole: string) {
    this.assertMember(requesterRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    // Legacy releases could contain memberships without a matching employee.
    // Avoid the former N+1 write pass on every GET; run reconciliation only
    // when a concrete missing relation is detected.
    const missingEmployee = await this.prisma.tenantMember.findFirst({
      where: {
        tenantId,
        user: { employees: { none: { tenantId } } },
      },
      select: { userId: true },
    });
    if (missingEmployee) await syncTenantMemberEmployees(this.prisma, tenantId);

    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        userId: { in: members.map((member) => member.userId) },
      },
      include: { department: true },
    });

    const employeeByUserId = new Map(
      employees
        .filter((employee) => employee.userId)
        .map((employee) => [employee.userId as string, employee]),
    );

    return members.map((member) => ({
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.user,
      employee: (() => {
        const emp = employeeByUserId.get(member.userId);
        return emp ? serializeEmployeeForApi(emp) : null;
      })(),
    }));
  }

  async listDepartments(tenantId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async updateMember(
    tenantId: string,
    userId: string,
    dto: UpdateMemberDto,
    requesterRole: string,
  ) {
    this.assertAdmin(requesterRole);

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER && dto.role && dto.role !== TENANT_ROLES.OWNER) {
      throw new ForbiddenException('نقش مالک سازمان قابل تغییر نیست');
    }

    if (dto.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان تعیین نقش مالک از این مسیر وجود ندارد');
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, tenantId },
      });
      if (!department) {
        throw new NotFoundException('واحد سازمانی یافت نشد');
      }
    }

    if (dto.employeeCode) {
      const duplicateCode = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          employeeCode: dto.employeeCode,
          NOT: { userId },
        },
      });
      if (duplicateCode) {
        throw new ConflictException('این کد پرسنلی قبلاً استفاده شده است');
      }
    }

    if (dto.name || dto.firstName || dto.lastName) {
      const displayName = resolveUserDisplayName(dto);
      if (displayName) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { name: displayName },
        });
      }
    }

    if (dto.email) {
      const normalizedEmail = dto.email.toLowerCase();
      if (normalizedEmail !== member.user.email.toLowerCase()) {
        throw new ForbiddenException('تغییر ایمیل ورود فقط توسط خود کاربر یا مدیر پلتفرم مجاز است');
      }
    }

    if (dto.password) {
      throw new ForbiddenException('بازنشانی رمز عبور از مدیریت سازمان مجاز نیست');
    }

    if (dto.role && member.role !== TENANT_ROLES.OWNER) {
      await this.prisma.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId } },
        data: { role: dto.role, roleChangedAt: new Date() },
      });
    }

    const employee = await ensureEmployeeForUser(
      this.prisma,
      tenantId,
      userId,
      member.joinedAt,
    );

    const providedProfile = pickProvidedProfileFields(dto);

    if (Object.keys(providedProfile).length > 0) {
      assertValidEmployeeProfile(providedProfile, { requireAll: false });
      const normalized = normalizeEmployeeProfile(providedProfile);
      await assertUniqueNationalId(this.prisma, tenantId, normalized.nationalId, employee.id);
    }

    const employeeUpdate: Prisma.EmployeeUpdateInput = {};

    if (Object.keys(providedProfile).length > 0) {
      applyEmployeeProfileToUpdate(providedProfile, employeeUpdate);
    }

    if (dto.employeeCode !== undefined) {
      employeeUpdate.employeeCode = dto.employeeCode;
    }
    if (dto.jobTitle !== undefined) {
      employeeUpdate.jobTitle = dto.jobTitle || null;
    }
    if (dto.departmentId !== undefined) {
      employeeUpdate.department = dto.departmentId
        ? { connect: { id: dto.departmentId } }
        : { disconnect: true };
    }
    if (dto.status !== undefined) {
      employeeUpdate.status = dto.status;
    }
    if (dto.hireDate !== undefined) {
      employeeUpdate.hireDate = dto.hireDate ? new Date(dto.hireDate) : null;
    }
    if (Object.keys(employeeUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: employeeUpdate,
      });
    }

    return this.getMemberWithEmployee(tenantId, userId);
  }

  async removeMember(
    tenantId: string,
    userId: string,
    requesterUserId: string,
    requesterRole: string,
  ) {
    this.assertAdmin(requesterRole);

    if (userId === requesterUserId) {
      throw new BadRequestException('امکان حذف حساب خودتان وجود ندارد');
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    if (member.role === TENANT_ROLES.OWNER) {
      throw new ForbiddenException('امکان حذف مالک سازمان وجود ندارد');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
    });

    await this.prisma.$transaction(async (tx) => {
      if (employee) {
        await tx.employee.update({ where: { id: employee.id }, data: { status: 'inactive' } });
      }
      await tx.tenantMember.delete({
        where: { tenantId_userId: { tenantId, userId } },
      });
    });

    return { success: true };
  }

  private async getMemberWithEmployee(tenantId: string, userId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, userId },
      include: { department: true },
    });

    return {
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.user,
      employee: employee ? serializeEmployeeForApi(employee) : null,
    };
  }

  private assertAdmin(memberRole: string) {
    const allowed = [TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN];
    if (!allowed.includes(memberRole as typeof TENANT_ROLES.OWNER)) {
      throw new ForbiddenException('فقط مالک یا مدیر ارشد می‌تواند این عملیات را انجام دهد');
    }
  }

  private assertMember(memberRole: string) {
    const allowed = Object.values(TENANT_ROLES);
    if (!allowed.includes(memberRole as typeof TENANT_ROLES.OWNER)) {
      throw new ForbiddenException('دسترسی به اعضای سازمان مجاز نیست');
    }
  }

  async listInvitations(tenantId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);
    await this.prisma.tenantInvitation.updateMany({
      where: { tenantId, status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    return this.prisma.tenantInvitation.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(tenantId: string, invitationId: string, requesterRole: string) {
    this.assertAdmin(requesterRole);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    if (invitation.status !== 'pending') {
      throw new BadRequestException('فقط دعوت‌نامه در انتظار قابل لغو است');
    }
    return this.prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: { status: 'revoked', revokedAt: new Date() },
      select: { id: true, status: true, revokedAt: true },
    });
  }

  async resendInvitation(
    tenantId: string,
    invitationId: string,
    requesterRole: string,
    invitedByUserId?: string,
  ) {
    this.assertAdmin(requesterRole);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation) throw new NotFoundException('دعوت‌نامه یافت نشد');
    if (invitation.status === 'accepted') {
      throw new BadRequestException('دعوت‌نامه پذیرفته‌شده قابل ارسال مجدد نیست');
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashInvitationToken(token);
    const updated = await this.prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: {
        token: tokenHash,
        tokenHash,
        status: 'pending',
        accepted: false,
        revokedAt: null,
        acceptedAt: null,
        invitedByUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { id: updated.id, email: updated.email, role: updated.role, token, expiresAt: updated.expiresAt };
  }

  async transferOwnership(
    tenantId: string,
    targetUserId: string,
    requesterUserId: string,
    requesterRole: string,
  ) {
    if (requesterRole !== TENANT_ROLES.OWNER) {
      throw new ForbiddenException('فقط مالک سازمان می‌تواند مالکیت اصلی را منتقل کند');
    }
    if (targetUserId === requesterUserId) {
      throw new BadRequestException('کاربر مقصد هم‌اکنون مالک اصلی است');
    }
    const target = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });
    if (!target || target.status !== 'active') {
      throw new NotFoundException('عضو فعال مقصد یافت نشد');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { role: TENANT_ROLES.OWNER, roleChangedAt: new Date() },
      });
      await tx.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId: requesterUserId } },
        data: { role: TENANT_ROLES.ADMIN, roleChangedAt: new Date() },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { primaryOwnerUserId: targetUserId } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: requesterUserId,
          action: 'organization.ownership_transferred',
          entityType: 'Tenant',
          entityId: tenantId,
          changes: { fromUserId: requesterUserId, toUserId: targetUserId },
        },
      });
    });
    return { success: true, primaryOwnerUserId: targetUserId };
  }

  private hashInvitationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
