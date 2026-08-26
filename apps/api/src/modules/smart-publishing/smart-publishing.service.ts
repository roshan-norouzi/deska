import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class SmartPublishingService {
  constructor(private prisma: PrismaService) {}
  channels(tenantId: string) { return this.prisma.publishChannel.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }); }
  createChannel(tenantId: string, data: any) { return this.prisma.publishChannel.create({ data: { tenantId, name: data.name, type: data.type, endpoint: data.endpoint, settings: data.settings ?? {} } }); }
  articles(tenantId: string, status?: string) { return this.prisma.publishArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, include: { channel: true }, orderBy: { createdAt: 'desc' } }); }
  createArticle(tenantId: string, userId: string, data: any) { return this.prisma.publishArticle.create({ data: { tenantId, createdById: userId, channelId: data.channelId, title: data.title, body: data.body, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined } }); }
  async publish(tenantId: string, id: string) { const row = await this.prisma.publishArticle.findFirst({ where: { id, tenantId } }); if (!row) throw new NotFoundException('محتوا یافت نشد'); return this.prisma.publishArticle.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } }); }
  newsFeeds(tenantId: string) { return this.prisma.newsFeed.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }); }
  addNewsFeed(tenantId: string, data: any) { return this.prisma.newsFeed.create({ data: { tenantId, name: data.name, url: data.url, enabled: data.enabled ?? true } }); }
  newsArticles(tenantId: string, status?: string) { return this.prisma.newsArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, orderBy: { publishedAtSource: 'desc' }, take: 100 }); }
  updateNewsArticle(tenantId: string, id: string, data: any) { return this.prisma.newsArticle.updateMany({ where: { id, tenantId }, data: { titleFa: data.titleFa, summaryFa: data.summaryFa, status: data.status } }); }
  socialFeeds(tenantId: string) { return this.prisma.socialFeed.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }); }
  addSocialFeed(tenantId: string, data: any) { return this.prisma.socialFeed.create({ data: { tenantId, name: data.name, url: data.url, category: data.category } }); }
  socialArticles(tenantId: string, status?: string) { return this.prisma.socialArticle.findMany({ where: { tenantId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  rewriteSocialArticle(tenantId: string, id: string, rewrittenText: string) { return this.prisma.socialArticle.updateMany({ where: { id, tenantId }, data: { rewrittenText, status: 'ready' } }); }
  async fetchNewsFeed(tenantId: string, feedId: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id: feedId, tenantId } });
    if (!feed) throw new NotFoundException('فید یافت نشد');
    const response = await fetch(feed.url, { headers: { 'user-agent': 'DESKA-Smart-Publishing/1.0' } });
    if (!response.ok) throw new Error(`RSS ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, 50);
    let created = 0;
    for (const match of items) {
      const block = match[0]; const read = (tag: string) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const title = read('title'); const link = read('link') || block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || ''; const summary = read('description') || read('summary') || read('content');
      if (!link || !title) continue;
      const result = await this.prisma.newsArticle.upsert({ where: { tenantId_canonicalUrl: { tenantId, canonicalUrl: link } }, create: { tenantId, feedId, canonicalUrl: link, originalUrl: link, originalTitle: title, originalSummary: summary, titleFa: title, summaryFa: summary, sourceName: feed.name, status: 'new' }, update: { feedId, originalSummary: summary } });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    }
    await this.prisma.newsFeed.update({ where: { id: feedId }, data: { lastFetchedAt: new Date(), lastError: '' } });
    return { ok: true, created };
  }
  async summarizeNews(tenantId: string, id: string) { const a = await this.prisma.newsArticle.findFirst({ where: { id, tenantId } }); if (!a) throw new NotFoundException('خبر یافت نشد'); const summary = a.summaryFa || a.originalSummary; return this.prisma.newsArticle.update({ where: { id }, data: { titleFa: a.titleFa || a.originalTitle, summaryFa: summary.slice(0, 1000), status: 'ready' } }); }
  async rejectNews(tenantId: string, id: string) { const r = await this.prisma.newsArticle.updateMany({ where: { id, tenantId }, data: { status: 'rejected' } }); return { ok: r.count > 0 }; }
  async getSettings(tenantId: string) { const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }); return (tenant?.settings as Record<string,string>) ?? {}; }
  async setSettings(tenantId: string, patch: Record<string,string>) { const current = await this.getSettings(tenantId); return this.prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...current, ...patch } } }).then(t => t.settings); }
}
