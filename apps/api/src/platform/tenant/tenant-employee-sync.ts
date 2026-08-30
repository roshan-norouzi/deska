import { Prisma, PrismaClient } from '@prisma/client';
import { backfillEmployeeProfile, backfillTenantEmployeeProfiles } from './employee-profile-backfill';

type SequenceRow = { prefix: string; suffix: string; padding: number; nextNumber: number };

async function nextEmployeeCode(prisma: PrismaClient, tenantId: string): Promise<string> {
  // UPDATE ... RETURNING makes the increment and the allocated number atomic.
  const updated = await prisma.$queryRaw<SequenceRow[]>(Prisma.sql`
    UPDATE "NumberSequence"
    SET "nextNumber" = "nextNumber" + 1
    WHERE "tenantId" = ${tenantId} AND "code" = 'employee'
    RETURNING "prefix", "suffix", "padding", "nextNumber"
  `);

  let sequence = updated[0];
  const number = sequence ? sequence.nextNumber - 1 : 1;

  if (!sequence) {
    try {
      sequence = await prisma.numberSequence.create({
        data: {
          tenantId,
          code: 'employee',
          prefix: 'EMP-',
          suffix: '',
          nextNumber: 2,
          padding: 4,
        },
        select: { prefix: true, suffix: true, padding: true, nextNumber: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return nextEmployeeCode(prisma, tenantId);
    }
  }

  return `${sequence.prefix}${String(number).padStart(Math.max(1, sequence.padding), '0')}${sequence.suffix}`;
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

  const employeeCode = await nextEmployeeCode(prisma, tenantId);

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
