import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePublishArticleDto, CreatePublishChannelDto } from './dto/publish-content.dto';

@Injectable()
export class SmartPublishingService {
  constructor(private readonly prisma: PrismaService) {}

  channels(tenantId: string) {
    return this.prisma.publishChannel.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  createChannel(tenantId: string, data: CreatePublishChannelDto) {
    return this.prisma.publishChannel.create({ data: { tenantId, name: data.name.trim(), type: data.type.trim(), endpoint: data.endpoint?.trim() || null, settings: (data.settings ?? {}) as Prisma.InputJsonObject } });
  }

  articles(tenantId: string, status?: string) {
    return this.prisma.publishArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, include: { channel: true }, orderBy: { createdAt: 'desc' } });
  }

  async createArticle(tenantId: string, userId: string, data: CreatePublishArticleDto) {
    const channelId = data.channelId || null;
    if (channelId) {
      const channel = await this.prisma.publishChannel.findFirst({
        where: { id: channelId, tenantId },
        select: { id: true },
      });
      if (!channel) throw new NotFoundException('کانال انتشار یافت نشد');
    }
    return this.prisma.publishArticle.create({ data: { tenantId, createdById: userId, channelId, title: data.title.trim(), body: data.body, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined } });
  }

  async publish(tenantId: string, id: string) {
    const row = await this.prisma.publishArticle.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('محتوا یافت نشد');
    return this.prisma.publishArticle.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } });
  }

  socialFeeds(tenantId: string) { return this.prisma.socialFeed.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }); }
  addSocialFeed(tenantId: string, data: Record<string, unknown>) { return this.prisma.socialFeed.create({ data: { tenantId, name: String(data.name ?? '').trim(), url: String(data.url ?? '').trim(), category: data.category ? String(data.category) : null } }); }
  socialArticles(tenantId: string, status?: string) { return this.prisma.socialArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  rewriteSocialArticle(tenantId: string, id: string, rewrittenText: string) { return this.prisma.socialArticle.updateMany({ where: { id, tenantId }, data: { rewrittenText, status: 'ready' } }); }
}
