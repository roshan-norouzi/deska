import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PLATFORM_ROLES, TENANT_ROLES } from '@deska/shared';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type ListQuery = { q?: string; status?: string; role?: string; page?: string; limit?: string };

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthUser) {
    this.assertAdmin(actor);
    const [users, activeUsers, organizations, activeOrganizations, memberships] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'active', isActive: true } }),
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active', isActive: true } }),
      this.prisma.tenantMember.count({ where: { status: 'active' } }),
    ]);
    return { users, activeUsers, organizations, activeOrganizations, memberships };
  }

  async listUsers(actor: AuthUser, query: ListQuery) {
    this.assertAdmin(actor);
    const { skip, take, page } = this.pagination(query);
    const where: Prisma.UserWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.role && { role: query.role }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, phone: true, name: true, role: true, status: true,
          isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true,
          tenantMembers: {
            select: {
              role: true, status: true, joinedAt: true,
              tenant: { select: { id: true, name: true, slug: true, status: true, primaryOwnerUserId: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  async getUser(actor: AuthUser, id: string) {
    this.assertAdmin(actor);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, phone: true, name: true, role: true, status: true,
        isActive: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        tenantMembers: {
          select: {
            role: true, status: true, jobTitle: true, joinedAt: true, leftAt: true,
            tenant: { select: { id: true, name: true, slug: true, status: true, primaryOwnerUserId: true } },
          },
        },
        employees: { select: { id: true, tenantId: true, employeeCode: true, jobTitle: true, status: true } },
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return user;
  }

  async updateUserStatus(actor: AuthUser, id: string, status: string) {
    this.assertAdmin(actor);
    if (id === actor.id && status !== 'active') {
      throw new BadRequestException('نمی‌توانید حساب فعال خودتان را مسدود یا غیرفعال کنید');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    this.assertCanManageTarget(actor, target.role);
    const isActive = status === 'active';
    if (!isActive) {
      const ownedOrganizations = await this.prisma.tenant.count({
        where: { primaryOwnerUserId: id, status: 'active', isActive: true },
      });
      if (ownedOrganizations > 0) {
        throw new BadRequestException('پیش از غیرفعال‌کردن کاربر، مالکیت سازمان‌های فعال او را منتقل کنید');
      }
    }
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          status,
          isActive,
          ...(!isActive ? { sessionsInvalidatedAt: new Date() } : {}),
        },
      }),
      ...(!isActive ? [this.prisma.refreshToken.deleteMany({ where: { userId: id } })] : []),
      this.prisma.auditLog.create({
        data: { tenantId: null, userId: actor.id, action: 'platform.user_status_changed', entityType: 'User', entityId: id, changes: { status } },
      }),
    ]);
    return { id: user.id, status: user.status, isActive: user.isActive };
  }

  async updateUserRole(actor: AuthUser, id: string, role: string) {
    this.assertAdmin(actor);
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('کاربر یافت نشد');
    this.assertCanManageTarget(actor, target.role);
    if (role === PLATFORM_ROLES.SUPER_ADMIN && actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('فقط مدیر کل می‌تواند مدیر کل دیگری تعیین کند');
    }
    if (id === actor.id && role !== actor.role) {
      throw new BadRequestException('نقش حساب خودتان را از این مسیر تغییر ندهید');
    }
    const user = await this.prisma.user.update({ where: { id }, data: { role } });
    await this.prisma.auditLog.create({
      data: { tenantId: null, userId: actor.id, action: 'platform.user_role_changed', entityType: 'User', entityId: id, changes: { from: target.role, to: role } },
    });
    return { id: user.id, role: user.role };
  }

  async listOrganizations(actor: AuthUser, query: ListQuery) {
    this.assertAdmin(actor);
    const { skip, take, page } = this.pagination(query);
    const where: Prisma.TenantWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.q && { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { slug: { contains: query.q, mode: 'insensitive' } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          primaryOwner: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true, modules: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  async getOrganization(actor: AuthUser, id: string) {
    this.assertAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        primaryOwner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, status: true, role: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        invitations: { select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true } },
        _count: { select: { modules: true } },
      },
    });
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    return tenant;
  }

  async updateOrganizationStatus(actor: AuthUser, id: string, status: string) {
    this.assertAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    const updated = await this.prisma.tenant.update({
      where: { id }, data: { status, isActive: status === 'active' },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: id, userId: actor.id, action: 'platform.organization_status_changed', entityType: 'Tenant', entityId: id, changes: { from: tenant.status, to: status } },
    });
    return { id: updated.id, status: updated.status, isActive: updated.isActive };
  }

  async transferOwnership(actor: AuthUser, tenantId: string, targetUserId: string) {
    this.assertAdmin(actor);
    const [tenant, target] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.tenantMember.findUnique({ where: { tenantId_userId: { tenantId, userId: targetUserId } } }),
    ]);
    if (!tenant) throw new NotFoundException('سازمان یافت نشد');
    if (!target || target.status !== 'active') throw new NotFoundException('عضو فعال مقصد یافت نشد');
    if (tenant.primaryOwnerUserId === targetUserId) throw new BadRequestException('این کاربر هم‌اکنون مالک اصلی است');
    await this.prisma.$transaction(async (tx) => {
      if (tenant.primaryOwnerUserId) {
        const current = await tx.tenantMember.findUnique({ where: { tenantId_userId: { tenantId, userId: tenant.primaryOwnerUserId } } });
        if (current) await tx.tenantMember.update({ where: { tenantId_userId: { tenantId, userId: current.userId } }, data: { role: TENANT_ROLES.ADMIN, roleChangedAt: new Date() } });
      }
      await tx.tenantMember.update({ where: { tenantId_userId: { tenantId, userId: targetUserId } }, data: { role: TENANT_ROLES.OWNER, roleChangedAt: new Date() } });
      await tx.tenant.update({ where: { id: tenantId }, data: { primaryOwnerUserId: targetUserId } });
      await tx.auditLog.create({ data: { tenantId, userId: actor.id, action: 'platform.organization_ownership_transferred', entityType: 'Tenant', entityId: tenantId, changes: { fromUserId: tenant.primaryOwnerUserId, toUserId: targetUserId } } });
    });
    return { success: true, primaryOwnerUserId: targetUserId };
  }

  private assertAdmin(actor: AuthUser) {
    if (![PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.ADMIN].includes(actor.role as 'super_admin')) {
      throw new ForbiddenException('دسترسی مدیریت پلتفرم مجاز نیست');
    }
  }

  private assertCanManageTarget(actor: AuthUser, targetRole: string) {
    if (targetRole === PLATFORM_ROLES.SUPER_ADMIN && actor.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('مدیریت حساب مدیر کل مجاز نیست');
    }
  }

  private pagination(query: ListQuery) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const take = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '25', 10) || 25));
    return { page, take, skip: (page - 1) * take };
  }
}
