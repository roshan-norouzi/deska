import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { APP_PERMISSIONS, MODULE_CATALOG } from '@deska/shared';

const prisma = new PrismaClient();
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@deska.local';
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin@1234', 10);
  const admin = await prisma.user.upsert({ where: { email }, create: { email, passwordHash, name: process.env.SEED_ADMIN_NAME ?? 'مدیر سیستم', role: 'super_admin' }, update: { passwordHash, role: 'super_admin' } });
  const tenant = await prisma.tenant.upsert({ where: { slug: 'default' }, create: { name: 'سازمان پیش‌فرض', slug: 'default', plan: 'enterprise', settings: { currency: 'IRR', timezone: 'Asia/Tehran' } }, update: {} });
  await prisma.tenantMember.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } }, create: { tenantId: tenant.id, userId: admin.id, role: 'owner' }, update: { role: 'owner' } });
  for (const mod of MODULE_CATALOG) {
    await prisma.moduleDefinition.upsert({ where: { id: mod.id }, create: { id: mod.id, name: mod.name, domain: mod.domain, version: mod.version, dependencies: [...mod.dependencies], isCore: 'isCore' in mod ? mod.isCore : false }, update: { name: mod.name, domain: mod.domain, dependencies: [...mod.dependencies], isCore: 'isCore' in mod ? mod.isCore : false } });
    await prisma.tenantModule.upsert({ where: { tenantId_moduleId: { tenantId: tenant.id, moduleId: mod.id } }, create: { tenantId: tenant.id, moduleId: mod.id, enabled: true }, update: { enabled: true } });
  }
  const role = await prisma.roleDefinition.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: 'مدیر' } }, create: { tenantId: tenant.id, name: 'مدیر', description: 'مدیریت هسته و منابع انسانی', isSystem: true }, update: {} });
  for (const permission of APP_PERMISSIONS) await prisma.rolePermission.upsert({ where: { roleId_permission: { roleId: role.id, permission: permission.key } }, create: { roleId: role.id, permission: permission.key }, update: {} });
  await prisma.department.upsert({ where: { id: 'hr-dept-default' }, create: { id: 'hr-dept-default', tenantId: tenant.id, name: 'منابع انسانی' }, update: { name: 'منابع انسانی' } });
  console.log('✅ هسته و منابع انسانی آماده شد');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
