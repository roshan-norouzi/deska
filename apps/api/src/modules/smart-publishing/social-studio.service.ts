import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { SourceReaderService } from './source-reader.service';

const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => values[key] ?? match).trim();
}

function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 300));
}

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function likelyImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) return value;
  } catch { /* invalid values are discarded */ }
  return null;
}

@Injectable()
export class SocialStudioService {
  private readonly logger = new Logger(SocialStudioService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
  ) {}

  feeds(tenantId: string) {
    return this.prisma.newsFeed.findMany({
      where: { tenantId, purpose: 'social-studio' },
      orderBy: { createdAt: 'desc' },
    });
  }

  articles(tenantId: string, status?: string) {
    if (status && !['pending', 'processing', 'ready', 'failed'].includes(status)) {
      throw new BadRequestException('وضعیت محتوای اجتماعی معتبر نیست');
    }
    return this.prisma.socialArticle.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { feed: { select: { id: true, name: true, enabled: true } } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async deleteAllArticles(tenantId: string) {
    const result = await this.prisma.socialArticle.deleteMany({ where: { tenantId } });
    return { ok: true, deleted: result.count };
  }

  async fetchFeed(tenantId: string, feedId: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id: feedId, tenantId, purpose: 'social-studio' } });
    if (!feed) throw new NotFoundException('فید استودیوی اجتماعی یافت نشد');
    if (!feed.enabled) throw new BadRequestException('ابتدا فید را فعال کنید');
    try {
      const settings = await this.settings.getRaw(tenantId);
      const maxAgeDays = Number(settings.social_max_age_days || 10);
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      const entries = (await this.sourceReader.readFeed(feed.url))
        .filter((entry) => !entry.publishedAt || entry.publishedAt >= cutoff);
      const result = entries.length ? await this.prisma.socialArticle.createMany({
        skipDuplicates: true,
        data: entries.map((entry) => ({
          tenantId,
          feedId: feed.id,
          title: entry.title,
          link: entry.canonicalUrl,
          author: entry.author || null,
          category: entry.category || null,
          publishedAt: entry.publishedAt,
          featuredImageUrl: entry.featuredImageUrl || null,
          authorImageUrl: entry.authorImageUrl || null,
          originalText: entry.content || entry.summary,
          status: 'pending',
        })),
      }) : { count: 0 };
      await this.prisma.newsFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date(), lastError: '' } });
      return { ok: true, discovered: entries.length, created: result.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای دریافت فید اجتماعی';
      await this.prisma.newsFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date(), lastError: message.slice(0, 1000) } });
      throw error;
    }
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'social-studio', enabled: true } });
    if (!feeds.length) throw new BadRequestException('هیچ فید فعالی برای استودیوی اجتماعی ثبت نشده است');
    const results: Array<{ feedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: result.created });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }
    const queued = await this.prisma.socialArticle.count({ where: { tenantId, status: 'pending' } });
    const failed = results.filter((item) => !item.ok);
    return { ok: failed.length === 0, feeds: results, queued };
  }

  async prepare(tenantId: string, id: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const claimed = await this.prisma.socialArticle.updateMany({
      where: { id, tenantId, status: { in: ['pending', 'ready', 'failed'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new BadRequestException('این مطلب هم‌اکنون در حال پردازش است');
    try {
      const [settings, source] = await Promise.all([
        this.settings.getRaw(tenantId),
        this.sourceReader.readArticle(article.link),
      ]);
      const text = source.text || article.originalText || '';
      const author = source.author || article.author || 'نامشخص';
      const category = source.category || article.category || 'نامشخص';
      const readingTime = readingMinutes(text);
      const prepared = await this.gapGpt.prepareSocial(settings, { title: article.title, author, category, text });
      const shortUrl = source.shortUrl || source.canonicalUrl || article.link;
      const feed = article.feedId ? await this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null;
      const values = {
        title: article.title,
        lead: prepared.lead,
        author,
        category,
        reading_time: persianDigits(readingTime),
        summary: prepared.summary,
        link: shortUrl,
        source: feed?.name || '',
      };
      const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
      return await this.prisma.socialArticle.updateMany({
        where: { id, tenantId, status: 'processing' },
        data: {
          // The source title is deliberately preserved verbatim.
          author,
          category,
          featuredImageUrl: source.featuredImageUrl || article.featuredImageUrl,
          authorImageUrl: likelyImageUrl(source.authorImageUrl) || likelyImageUrl(article.authorImageUrl),
          originalText: text,
          leadText: prepared.lead,
          summaryText: prepared.summary,
          shortUrl,
          captionText: renderTemplate(captionTemplate, values),
          readingTime,
          status: 'ready',
          processingStartedAt: null,
          lastError: '',
        },
      }).then(async (result) => {
        if (!result.count) throw new NotFoundException('مطلب اجتماعی در زمان آماده‌سازی حذف شده است');
        return this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای آماده‌سازی مطلب اجتماعی';
      await this.prisma.socialArticle.updateMany({ where: { id, tenantId, status: 'processing' }, data: { status: 'failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      throw new BadRequestException(`آماده‌سازی مطلب اجتماعی انجام نشد: ${message}`);
    }
  }

  async updateCaption(tenantId: string, id: string, captionText: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    return this.prisma.socialArticle.update({ where: { id }, data: { captionText: captionText.trim(), rewrittenText: captionText.trim(), status: 'ready' } });
  }

  async updateLead(tenantId: string, id: string, leadText: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const normalized = leadText.trim();
    if (!normalized) throw new BadRequestException('لید نمی‌تواند خالی باشد');
    const [settings, feed] = await Promise.all([
      this.settings.getRaw(tenantId),
      article.feedId ? this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null,
    ]);
    const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
    const values = {
      title: article.title,
      lead: normalized,
      author: article.author || 'نامشخص',
      category: article.category || 'نامشخص',
      reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
      summary: article.summaryText || '',
      link: article.shortUrl || article.link,
      source: feed?.name || '',
    };
    const caption = renderTemplate(captionTemplate, values);
    return this.prisma.socialArticle.update({ where: { id }, data: { leadText: normalized, captionText: caption, rewrittenText: caption, status: 'ready' } });
  }

  async updateTitle(tenantId: string, id: string, title: string) {
    const article = await this.prisma.socialArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const normalized = title.trim();
    if (!normalized) throw new BadRequestException('تیتر نمی‌تواند خالی باشد');
    const [settings, feed] = await Promise.all([
      this.settings.getRaw(tenantId),
      article.feedId ? this.prisma.newsFeed.findUnique({ where: { id: article.feedId }, select: { name: true } }) : null,
    ]);
    const captionTemplate = String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}');
    const values = {
      title: normalized,
      lead: article.leadText || '',
      author: article.author || 'نامشخص',
      category: article.category || 'نامشخص',
      reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
      summary: article.summaryText || '',
      link: article.shortUrl || article.link,
      source: feed?.name || '',
    };
    const caption = renderTemplate(captionTemplate, values);
    return this.prisma.socialArticle.update({ where: { id }, data: { title: normalized, captionText: caption, rewrittenText: caption, status: 'ready' } });
  }

  @Interval('smart-publishing-social-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const enabledModules = await this.prisma.tenantModule.findMany({
        where: { moduleId: 'smart-publishing', enabled: true, tenant: { isActive: true } },
        select: { tenantId: true },
      });
      const enabledTenantIds = enabledModules.map((row) => row.tenantId);
      if (!enabledTenantIds.length) return;

      const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      await this.prisma.socialArticle.updateMany({
        where: { tenantId: { in: enabledTenantIds }, status: 'processing', processingStartedAt: { lte: staleBefore } },
        data: { status: 'pending', processingStartedAt: null },
      });
      const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId: { in: enabledTenantIds }, purpose: 'social-studio', enabled: true }, orderBy: { lastFetchedAt: 'asc' } });
      const tenantIds = new Set<string>();
      for (const feed of feeds) {
        const settings = await this.settings.getRaw(feed.tenantId);
        const intervalMs = Number(settings.social_poll_interval_minutes || 240) * 60_000;
        if (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs) {
          try { await this.fetchFeed(feed.tenantId, feed.id); }
          catch (error) { this.logger.warn(`Social feed ${feed.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
        }
        tenantIds.add(feed.tenantId);
      }
      // Feed polling only discovers articles. AI preparation is explicitly
      // started by the user from the article's Prepare button.
    } catch (error) {
      this.logger.error(`Social studio maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

}
