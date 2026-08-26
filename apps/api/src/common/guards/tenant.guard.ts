import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const tenantMode = this.config.get<string>('TENANT_MODE', 'multi');
    let tenantId = request.headers['x-tenant-id'] as string | undefined;

    if (tenantMode === 'single') {
      const defaultSlug = this.config.get<string>('DEFAULT_TENANT_SLUG', 'default');
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: defaultSlug } });
      if (!tenant) throw new BadRequestException('سازمان پیش‌فرض یافت نشد');
      tenantId = tenant.id;
    }

    if (!tenantId) {
      throw new BadRequestException('شناسه سازمان الزامی است');
    }

    if (user.role === 'super_admin') {
      request.tenant = { tenantId, memberRole: 'owner' };
      return true;
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });

    if (!member) {
      throw new ForbiddenException('دسترسی به این سازمان مجاز نیست');
    }

    request.tenant = { tenantId, memberRole: member.role };
    return true;
  }
}
