import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SmartPublishingService {
  constructor(private readonly prisma: PrismaService) {}

  channels(tenantId: string) {
    return this.prisma.publishChannel.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  createChannel(tenantId: string, data: Record<string, unknown>) {
    return this.prisma.publishChannel.create({ data: { tenantId, name: String(data.name ?? '').trim(), type: String(data.type ?? '').trim(), endpoint: data.endpoint ? String(data.endpoint) : null, settings: data.settings && typeof data.settings === 'object' ? data.settings : {} } });
  }

  articles(tenantId: string, status?: string) {
    return this.prisma.publishArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, include: { channel: true }, orderBy: { createdAt: 'desc' } });
  }

  createArticle(tenantId: string, userId: string, data: Record<string, unknown>) {
    return this.prisma.publishArticle.create({ data: { tenantId, createdById: userId, channelId: data.channelId ? String(data.channelId) : null, title: String(data.title ?? '').trim(), body: String(data.body ?? ''), scheduledAt: data.scheduledAt ? new Date(String(data.scheduledAt)) : undefined } });
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
