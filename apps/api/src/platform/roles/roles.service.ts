import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_PERMISSIONS } from '@deska/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const VALID_PERMISSIONS = new Set(APP_PERMISSIONS.map((p) => p.key));

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.roleDefinition.findMany({
      where: { tenantId },
      include: { permissions: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(tenantId: string, roleId: string) {
    const role = await this.prisma.roleDefinition.findFirst({
      where: { id: roleId, tenantId },
      include: { permissions: true },
    });

    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }

    return role;
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.roleDefinition.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name } },
    });

    if (existing) {
      throw new ConflictException('نقشی با این نام قبلاً وجود دارد');
    }

    return this.prisma.roleDefinition.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
      },
      include: { permissions: true },
    });
  }

  async update(tenantId: string, roleId: string, dto: UpdateRoleDto) {
    const role = await this.findOne(tenantId, roleId);

    if (role.isSystem) {
      throw new ForbiddenException('نقش‌های سیستمی قابل ویرایش نیستند');
    }

    if (dto.name && dto.name !== role.name) {
      const duplicate = await this.prisma.roleDefinition.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name } },
      });

      if (duplicate) {
        throw new ConflictException('نقشی با این نام قبلاً وجود دارد');
      }
    }

    return this.prisma.roleDefinition.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: { permissions: true },
    });
  }

  async remove(tenantId: string, roleId: string) {
    const role = await this.findOne(tenantId, roleId);

    if (role.isSystem) {
      throw new ForbiddenException('نقش‌های سیستمی قابل حذف نیستند');
    }

    await this.prisma.roleDefinition.delete({ where: { id: roleId } });

    return { success: true, message: 'نقش با موفقیت حذف شد' };
  }

  async assignPermissions(tenantId: string, roleId: string, dto: AssignPermissionsDto) {
    const role = await this.findOne(tenantId, roleId);

    const invalid = dto.permissions.filter((p) => !VALID_PERMISSIONS.has(p as typeof APP_PERMISSIONS[number]['key']));
    if (invalid.length > 0) {
      throw new BadRequestException(`دسترسی‌های نامعتبر: ${invalid.join(', ')}`);
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });

      if (dto.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissions.map((permission) => ({
            roleId: role.id,
            permission,
          })),
        });
      }
    });

    return this.findOne(tenantId, roleId);
  }

  async getAvailablePermissions() {
    return APP_PERMISSIONS;
  }
}
