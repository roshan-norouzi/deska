import { PrismaClient } from '@prisma/client';
import { backfillEmployeeProfile, backfillTenantEmployeeProfiles } from './employee-profile-backfill';

function buildEmployeeCode(userId: string): string {
  return `EMP-${userId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'USER'}`;
}

export async function ensureEmployeeForUser(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  joinedAt?: Date,
) {
  const existing = await prisma.employee.findFirst({
    where: { tenantId, userId },
    include: { department: true },
  });

  if (existing) {
    if (existing.status !== 'active') {
      return prisma.employee.update({
        where: { id: existing.id },
        data: { status: 'active', ...(joinedAt ? { hireDate: joinedAt } : {}) },
        include: { department: true },
      });
    }
    if (existing.userId) {
      const user = await prisma.user.findUnique({ where: { id: existing.userId } });
      if (user && (!existing.firstName || !existing.lastName)) {
        return backfillEmployeeProfile(prisma, existing, user);
      }
    }
    return existing;
  }

  let employeeCode = buildEmployeeCode(userId);
  const codeTaken = await prisma.employee.findFirst({
    where: { tenantId, employeeCode },
  });

  if (codeTaken) {
    employeeCode = `EMP-${userId.slice(0, 8).toUpperCase()}`;
  }

  return prisma.employee.create({
    data: {
      tenantId,
      userId,
      employeeCode,
      hireDate: joinedAt ?? new Date(),
      status: 'active',
    },
    include: { department: true },
  });
}

export async function syncTenantMemberEmployees(prisma: PrismaClient, tenantId: string) {
  const members = await prisma.tenantMember.findMany({
    where: { tenantId },
    select: { userId: true, joinedAt: true },
  });

  for (const member of members) {
    await ensureEmployeeForUser(prisma, tenantId, member.userId, member.joinedAt);
  }

  await backfillTenantEmployeeProfiles(prisma, tenantId);
}
