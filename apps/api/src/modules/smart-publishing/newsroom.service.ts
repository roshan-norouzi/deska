import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FEED_PURPOSES, type CreateFeedDto, type FeedPurpose, type UpdateFeedDto } from './dto/feed.dto';
import type { UpdateNewsArticleDto } from './dto/news-article.dto';
import { GapGptClient } from './gapgpt.client';
import { PublishingSettingsService } from './publishing-settings.service';
import { SourceReaderService } from './source-reader.service';
import { WordPressClient } from './wordpress.client';

const REJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

function normalizePurpose(value: unknown, fallback: FeedPurpose = 'news-room'): FeedPurpose {
  return FEED_PURPOSES.includes(value as FeedPurpose) ? value as FeedPurpose : fallback;
}

function normalizeFeedUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException('آدرس RSS معتبر نیست');
  }
}

function splitText(value: string, maxChars = 10_000): string[] {
  const paragraphs = value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) { chunks.push(current); current = ''; }
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toWordPressHtml(value: string, sourceName: string, sourceUrl: string): string {
  const body = value.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `${body}\n<hr>\n<p><strong>منبع:</strong> <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName || sourceUrl)}</a></p>`;
}

@Injectable()
export class NewsroomService {
  private readonly logger = new Logger(NewsroomService.name);
  private maintenanceRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly gapGpt: GapGptClient,
    private readonly sourceReader: SourceReaderService,
    private readonly wordpress: WordPressClient,
  ) {}

  feeds(tenantId: string, purpose?: FeedPurpose) {
    return this.prisma.newsFeed.findMany({
      where: { tenantId, ...(purpose ? { purpose } : {}) },
      orderBy: [{ purpose: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async addFeed(tenantId: string, data: CreateFeedDto) {
    const name = data.name.trim();
    const url = normalizeFeedUrl(data.url);
    const purpose = normalizePurpose(data.purpose);
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url } });
    if (duplicate) throw new ConflictException('این فید قبلاً ثبت شده است');
    return this.prisma.newsFeed.create({ data: { tenantId, name, url, purpose, enabled: data.enabled ?? true } });
  }

  async updateFeed(tenantId: string, id: string, data: UpdateFeedDto) {
    const feed = await this.findFeed(tenantId, id);
    const name = String(data.name ?? feed.name).trim();
    const url = normalizeFeedUrl(String(data.url ?? feed.url));
    const purpose = normalizePurpose(data.purpose, normalizePurpose(feed.purpose));
    const duplicate = await this.prisma.newsFeed.findFirst({ where: { tenantId, url, NOT: { id } } });
    if (duplicate) throw new ConflictException('این آدرس قبلاً ثبت شده است');
    return this.prisma.newsFeed.update({ where: { id }, data: { name, url, purpose } });
  }

  async toggleFeed(tenantId: string, id: string) {
    const feed = await this.findFeed(tenantId, id);
    return this.prisma.newsFeed.update({ where: { id }, data: { enabled: !feed.enabled } });
  }

  async deleteFeed(tenantId: string, id: string) {
    await this.findFeed(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.newsArticle.deleteMany({ where: { tenantId, feedId: id, status: { not: 'published' } } }),
      this.prisma.newsFeed.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  async articles(tenantId: string, status?: string) {
    await this.purgeRejected();
    if (status && !['new', 'processing', 'ready', 'rejected', 'publishing', 'published', 'failed', 'publish_failed'].includes(status)) {
      throw new BadRequestException('وضعیت خبر معتبر نیست');
    }
    return this.prisma.newsArticle.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { feed: { select: { id: true, name: true, purpose: true } } },
      orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async updateArticle(tenantId: string, id: string, data: UpdateNewsArticleDto) {
    const article = await this.findArticle(tenantId, id);
    if (['rejected', 'publishing', 'published'].includes(article.status)) {
      throw new BadRequestException('ویرایش خبر در وضعیت فعلی مجاز نیست');
    }
    const titleFa = data.titleFa !== undefined ? data.titleFa.trim() : article.titleFa;
    const summaryFa = data.summaryFa !== undefined ? data.summaryFa.trim() : article.summaryFa;
    if (data.status === 'ready' && (!titleFa || !summaryFa)) {
      throw new BadRequestException('برای آماده‌کردن خبر، تیتر و خلاصهٔ فارسی الزامی است');
    }
    return this.prisma.newsArticle.update({
      where: { id },
      data: {
        ...(data.titleFa !== undefined ? { titleFa } : {}),
        ...(data.summaryFa !== undefined ? { summaryFa } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });
  }

  async fetchFeed(tenantId: string, feedId: string) {
    const feed = await this.findFeed(tenantId, feedId);
    if (feed.purpose !== 'news-room') throw new BadRequestException('پایش این فید پس از تکمیل بخش مربوط به آن فعال می‌شود');
    if (!feed.enabled) throw new BadRequestException('ابتدا فید را فعال کنید');
    try {
      const settings = await this.settings.getRaw(tenantId);
      const maxAgeDays = Number(settings.news_max_age_days || 10);
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
      const entries = (await this.sourceReader.readFeed(feed.url)).filter((entry) => !entry.publishedAt || entry.publishedAt >= cutoff);
      const result = entries.length ? await this.prisma.newsArticle.createMany({
        skipDuplicates: true,
        data: entries.map((entry) => ({
          tenantId,
          feedId,
          canonicalUrl: entry.canonicalUrl,
          originalUrl: entry.canonicalUrl,
          guid: entry.guid,
          originalTitle: entry.title,
          originalSummary: entry.summary,
          originalContent: entry.content,
          featuredImageUrl: entry.featuredImageUrl,
          sourceName: feed.name,
          publishedAtSource: entry.publishedAt,
          status: 'new',
        })),
      }) : { count: 0 };
      await this.prisma.newsFeed.update({ where: { id: feedId }, data: { lastFetchedAt: new Date(), lastError: '' } });
      return { ok: true, discovered: entries.length, created: result.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته دریافت فید';
      await this.prisma.newsFeed.update({ where: { id: feedId }, data: { lastFetchedAt: new Date(), lastError: message.slice(0, 1000) } });
      throw error;
    }
  }

  async sync(tenantId: string) {
    const feeds = await this.prisma.newsFeed.findMany({ where: { tenantId, purpose: 'news-room', enabled: true } });
    if (!feeds.length) throw new BadRequestException('هیچ فید فعال برای اتاق خبر ثبت نشده است');
    const results: Array<{ feedId: string; ok: boolean; created?: number; error?: string }> = [];
    for (const feed of feeds) {
      try {
        const result = await this.fetchFeed(tenantId, feed.id);
        results.push({ feedId: feed.id, ok: true, created: result.created });
      } catch (error) {
        results.push({ feedId: feed.id, ok: false, error: error instanceof Error ? error.message : 'خطای دریافت فید' });
      }
    }
    const queued = await this.prisma.newsArticle.count({ where: { tenantId, status: 'new' } });
    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      feeds: results,
      queued,
      message: failed.length ? `${failed.length} فید دریافت نشد؛ خطای هر فید در صفحه فیدها ثبت شده است` : 'همه فیدهای اتاق خبر با موفقیت پایش شدند',
    };
  }

  async summarize(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (['rejected', 'publishing', 'published'].includes(article.status)) throw new BadRequestException('آماده‌سازی خبر در وضعیت فعلی مجاز نیست');
    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['new', 'ready', 'failed', 'publish_failed'] } },
      data: { status: 'processing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('این خبر هم‌اکنون در حال پردازش است');
    try {
      const settings = await this.settings.getRaw(tenantId);
      const prepared = await this.gapGpt.summarize(settings, {
        sourceName: article.sourceName,
        title: article.originalTitle,
        summary: article.originalSummary || article.originalContent || article.originalTitle,
      });
      return await this.prisma.newsArticle.update({
        where: { id },
        data: { titleFa: prepared.title, summaryFa: prepared.summary, status: 'ready', processingStartedAt: null, lastError: '' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته GapGPT';
      await this.prisma.newsArticle.update({ where: { id }, data: { status: 'failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      throw new BadRequestException(`ترجمه و خلاصه‌سازی انجام نشد: ${message}`);
    }
  }

  async reject(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (['published', 'rejected'].includes(article.status)) throw new BadRequestException('این خبر قبلاً تعیین تکلیف شده است');
    const rejectedAt = new Date();
    const purgeAfter = new Date(rejectedAt.getTime() + REJECT_RETENTION_MS);
    return this.prisma.newsArticle.update({
      where: { id },
      data: { status: 'rejected', rejectedAt, purgeAfter, processingStartedAt: null, lastError: '' },
    });
  }

  async publish(tenantId: string, id: string) {
    const article = await this.findArticle(tenantId, id);
    if (article.status === 'published' && article.wordpressPostUrl) return article;
    if (!['ready', 'publish_failed'].includes(article.status)) throw new BadRequestException('ابتدا ترجمه و خلاصهٔ خبر را آماده کنید');
    const claimed = await this.prisma.newsArticle.updateMany({
      where: { id, tenantId, status: { in: ['ready', 'publish_failed'] } },
      data: { status: 'publishing', processingStartedAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw new ConflictException('انتشار این خبر هم‌اکنون در حال انجام است');

    try {
      const settings = await this.settings.getRaw(tenantId);
      this.wordpress.validateSettings(settings);
      const source = await this.sourceReader.readArticle(article.originalUrl || article.canonicalUrl);
      const originalContent = source.text;
      const featuredImageUrl = source.featuredImageUrl || article.featuredImageUrl;
      if (!originalContent.trim()) throw new Error('متن کامل خبر از منبع دریافت نشد');

      let contentFa = article.originalContent === originalContent ? article.contentFa : '';
      if (!contentFa) {
        const chunks = splitText(originalContent);
        const translated: string[] = [];
        for (let index = 0; index < chunks.length; index++) {
          translated.push(await this.gapGpt.translateFullText(settings, {
            sourceName: article.sourceName,
            title: article.originalTitle,
            text: chunks[index],
            part: index + 1,
            totalParts: chunks.length,
          }));
        }
        contentFa = translated.join('\n\n');
      }

      await this.prisma.newsArticle.update({ where: { id }, data: { originalContent, contentFa, featuredImageUrl } });
      const published = await this.wordpress.publish(settings, {
        articleId: article.id,
        title: article.titleFa,
        excerpt: article.summaryFa,
        content: toWordPressHtml(contentFa, article.sourceName, article.originalUrl || article.canonicalUrl),
      });
      return await this.prisma.newsArticle.update({
        where: { id },
        data: {
          status: 'published',
          publishedAt: new Date(),
          processingStartedAt: null,
          wordpressPostId: published.postId,
          wordpressPostUrl: published.url,
          lastError: '',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته انتشار';
      await this.prisma.newsArticle.update({ where: { id }, data: { status: 'publish_failed', processingStartedAt: null, lastError: message.slice(0, 1000) } });
      throw new BadRequestException(`انتشار خبر انجام نشد: ${message}`);
    }
  }

  async purgeRejected(tenantId?: string) {
    return this.prisma.newsArticle.deleteMany({ where: { ...(tenantId ? { tenantId } : {}), status: 'rejected', purgeAfter: { lte: new Date() } } });
  }

  @Interval('smart-publishing-newsroom-maintenance', 60_000)
  async maintenance() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
      await this.prisma.newsArticle.updateMany({ where: { status: 'processing', processingStartedAt: { lte: staleBefore } }, data: { status: 'new', processingStartedAt: null } });
      await this.prisma.newsArticle.updateMany({ where: { status: 'publishing', processingStartedAt: { lte: staleBefore } }, data: { status: 'publish_failed', processingStartedAt: null, lastError: 'عملیات انتشار قبلی ناتمام مانده بود؛ دوباره تلاش کنید' } });
      await this.purgeRejected();

      const feeds = await this.prisma.newsFeed.findMany({ where: { purpose: 'news-room', enabled: true }, orderBy: { lastFetchedAt: 'asc' } });
      const tenantIds = new Set<string>();
      for (const feed of feeds) {
        const settings = await this.settings.getRaw(feed.tenantId);
        const intervalMs = Number(settings.news_poll_interval_minutes || 240) * 60_000;
        if (!feed.lastFetchedAt || Date.now() - feed.lastFetchedAt.getTime() >= intervalMs) {
          try { await this.fetchFeed(feed.tenantId, feed.id); }
          catch (error) { this.logger.warn(`Feed ${feed.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
        }
        tenantIds.add(feed.tenantId);
      }
      const pendingTenants = await this.prisma.newsArticle.findMany({
        where: { status: 'new' },
        distinct: ['tenantId'],
        select: { tenantId: true },
      });
      for (const row of pendingTenants) tenantIds.add(row.tenantId);
      for (const tenantId of tenantIds) await this.processPending(tenantId, 3);
    } catch (error) {
      this.logger.error(`Newsroom maintenance failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  private async processPending(tenantId: string, limit: number) {
    const rows = await this.prisma.newsArticle.findMany({ where: { tenantId, status: 'new' }, orderBy: [{ publishedAtSource: 'desc' }, { createdAt: 'desc' }], take: limit, select: { id: true } });
    let processed = 0;
    for (const row of rows) {
      try { await this.summarize(tenantId, row.id); processed++; }
      catch (error) { this.logger.warn(`Article ${row.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    return processed;
  }

  private async findFeed(tenantId: string, id: string) {
    const feed = await this.prisma.newsFeed.findFirst({ where: { id, tenantId } });
    if (!feed) throw new NotFoundException('فید یافت نشد');
    return feed;
  }

  private async findArticle(tenantId: string, id: string) {
    const article = await this.prisma.newsArticle.findFirst({ where: { id, tenantId } });
    if (!article) throw new NotFoundException('خبر یافت نشد');
    return article;
  }
}
