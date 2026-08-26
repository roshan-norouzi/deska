import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: params.changes as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async create(params: {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.activity.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.activity.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async notify(params: {
    tenantId: string;
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) {
    return this.prisma.notification.create({ data: params });
  }

  async list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }
}
