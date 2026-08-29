import { BadRequestException, Injectable } from '@nestjs/common';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService, type SafeHttpRequestOptions, type SafeHttpResponse } from './source-reader.service';

interface WordPressPost {
  id?: number;
  link?: string;
  message?: string;
  code?: string;
  featured_media?: number;
}

@Injectable()
export class WordPressClient {
  constructor(private readonly sourceReader: SourceReaderService) {}

  private credentials(settings: PublishingSettings) {
    const siteUrl = String(settings.wp_site_url ?? '').trim().replace(/\/$/, '');
    const username = String(settings.wp_username ?? '').normalize('NFKC').trim();
    // WordPress core removes every non-alphanumeric character before checking
    // an Application Password. Mirroring that behavior also handles pasted
    // spaces, non-breaking spaces, dashes and invisible separators safely.
    const appPassword = String(settings.wp_app_password ?? '')
      .normalize('NFKC')
      .replace(/[^a-z\d]/gi, '');
    if (!siteUrl || !username || !appPassword) {
      throw new BadRequestException('آدرس سایت، نام کاربری و رمز برنامه WordPress را در تنظیمات وارد کنید');
    }
    let url: URL;
    try { url = new URL(siteUrl); } catch { throw new BadRequestException('آدرس WordPress معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('آدرس WordPress معتبر نیست');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new BadRequestException('برای حفاظت از رمز برنامه، آدرس WordPress باید HTTPS باشد');
    }
    const authorization = `Basic ${Buffer.from(`${username}:${appPassword}`, 'utf8').toString('base64')}`;
    return { siteUrl, authorization };
  }

  validateSettings(settings: PublishingSettings): void {
    this.credentials(settings);
  }

  async test(settings: PublishingSettings): Promise<{ ok: true; message: string }> {
    const { siteUrl, authorization } = this.credentials(settings);
    try {
      const headers = {
        Authorization: authorization,
        Accept: 'application/json',
        'User-Agent': 'DESKA-ERP/1.0 WordPress publisher',
      };
      // Some security plugins reject the `context=edit` query even though
      // Application Password authentication itself is valid. Try the normal
      // endpoint first, then the least restrictive endpoint as a fallback.
      let response = await this.request(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
        headers,
        timeoutMs: 20_000,
      });
      let body = this.json<WordPressPost>(response);
      if (!response.ok && response.status === 401) {
        response = await this.request(`${siteUrl}/wp-json/wp/v2/users/me`, {
          headers,
          timeoutMs: 20_000,
        });
        body = this.json<WordPressPost>(response);
      }
      if (!response.ok) {
        if (response.status === 401) {
          if (body.code === 'rest_not_logged_in') {
            throw new Error('WordPress کاربر API را واردشده تشخیص نداد؛ ممکن است هدر Authorization به PHP نرسیده باشد یا Application Password حذف، لغو یا نامعتبر شده باشد');
          }
          throw new Error('WordPress احراز هویت را نپذیرفت؛ نام کاربری و Application Password را بررسی کنید و مطمئن شوید REST API یا Application Passwords توسط افزونه امنیتی مسدود نشده است');
        }
        throw new Error(body.message || `HTTP ${response.status}`);
      }
      return { ok: true, message: 'اتصال WordPress و دسترسی انتشار تأیید شد' };
    } catch (error) {
      throw new BadRequestException(`اتصال WordPress برقرار نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    }
  }

  async publish(settings: PublishingSettings, input: {
    articleId: string;
    title: string;
    excerpt: string;
    content: string;
    featuredImageUrl?: string;
  }): Promise<{ postId: string; url: string }> {
    const { siteUrl, authorization } = this.credentials(settings);
    const endpoint = `${siteUrl}/wp-json/wp/v2/posts`;
    const slug = `deska-${input.articleId.toLowerCase()}`;

    const existingResponse = await this.request(`${endpoint}?slug=${encodeURIComponent(slug)}&status=any&_fields=id,link`, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      timeoutMs: 20_000,
    });
    let featuredMediaId: number | undefined;
    if (input.featuredImageUrl) {
      featuredMediaId = await this.uploadMedia(siteUrl, authorization, input.featuredImageUrl, input.title);
    }
    if (existingResponse.ok) {
      const existing = this.json<WordPressPost[]>(existingResponse, []);
      if (existing[0]?.id && existing[0]?.link) {
        if (featuredMediaId) {
          await this.request(`${endpoint}/${existing[0].id}`, { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ featured_media: featuredMediaId }), timeoutMs: 30_000 });
        }
        return { postId: String(existing[0].id), url: existing[0].link };
      }
    }

    const categoryId = Number(settings.wp_category_id || 0);
    const payload: Record<string, unknown> = {
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      status: settings.wp_post_status || 'publish',
      slug,
    };
    if (Number.isSafeInteger(categoryId) && categoryId > 0) payload.categories = [categoryId];
    if (featuredMediaId) payload.featured_media = featuredMediaId;

    const response = await this.request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
    });
    const body = this.json<WordPressPost>(response);
    if (!response.ok || !body.id || !body.link) {
      throw new Error(body.message || `WordPress HTTP ${response.status}`);
    }
    return { postId: String(body.id), url: body.link };
  }

  private async uploadMedia(siteUrl: string, authorization: string, imageUrl: string, title: string): Promise<number> {
    try {
      const image = await this.sourceReader.proxyImage(imageUrl);
      const buffer = image.buffer;
      const contentType = image.contentType;
      const extension = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
      const filename = `deska-featured-${Date.now()}.${extension}`;
      const response = await this.request(`${siteUrl}/wp-json/wp/v2/media`, { method: 'POST', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` }, body: buffer, timeoutMs: 60_000, maxResponseBytes: 4 * 1024 * 1024 });
      const body = this.json<WordPressPost & { message?: string }>(response);
      if (!response.ok || !body.id) throw new Error(body.message || `آپلود تصویر شاخص در WordPress با خطای HTTP ${response.status} انجام شد`);
      return body.id;
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'آپلود تصویر شاخص انجام نشد'); }
  }

  private request(url: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    return this.sourceReader.safeRequest(url, {
      ...options,
      maxResponseBytes: options.maxResponseBytes ?? 2 * 1024 * 1024,
      allowLocalhostInDevelopment: true,
    });
  }

  private json<T>(response: SafeHttpResponse, fallback: T = {} as T): T {
    try { return response.json<T>(); } catch { return fallback; }
  }
}
