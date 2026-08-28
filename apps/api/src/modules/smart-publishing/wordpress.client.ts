import { BadRequestException, Injectable } from '@nestjs/common';
import type { PublishingSettings } from './dto/publishing-settings.dto';

interface WordPressPost {
  id?: number;
  link?: string;
  message?: string;
  code?: string;
}

@Injectable()
export class WordPressClient {
  private credentials(settings: PublishingSettings) {
    const siteUrl = String(settings.wp_site_url ?? '').trim().replace(/\/$/, '');
    const username = String(settings.wp_username ?? '').trim();
    const appPassword = String(settings.wp_app_password ?? '').replace(/\s+/g, '');
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
      let response = await fetch(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      let body = await response.json().catch(() => ({})) as WordPressPost;
      if (!response.ok && response.status === 401) {
        response = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
          headers,
          signal: AbortSignal.timeout(20_000),
        });
        body = await response.json().catch(() => ({})) as WordPressPost;
      }
      if (!response.ok) {
        if (response.status === 401) {
          if (body.code === 'rest_not_logged_in') {
            throw new Error('WordPress هدر احراز هویت را دریافت نکرده است؛ تنظیمات Rewrite یا وب‌سرور قبل از رسیدن درخواست به WordPress، هدر Authorization را حذف می‌کند');
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
  }): Promise<{ postId: string; url: string }> {
    const { siteUrl, authorization } = this.credentials(settings);
    const endpoint = `${siteUrl}/wp-json/wp/v2/posts`;
    const slug = `deska-${input.articleId.toLowerCase()}`;

    const existingResponse = await fetch(`${endpoint}?slug=${encodeURIComponent(slug)}&status=any&_fields=id,link`, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (existingResponse.ok) {
      const existing = await existingResponse.json().catch(() => []) as WordPressPost[];
      if (existing[0]?.id && existing[0]?.link) {
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json().catch(() => ({})) as WordPressPost;
    if (!response.ok || !body.id || !body.link) {
      throw new Error(body.message || `WordPress HTTP ${response.status}`);
    }
    return { postId: String(body.id), url: body.link };
  }
}
