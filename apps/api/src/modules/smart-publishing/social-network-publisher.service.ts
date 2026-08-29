import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingSettingsService } from './publishing-settings.service';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';

type Network = 'telegram' | 'instagram' | 'linkedin' | 'facebook';
type ImagePayload = { buffer: Buffer; contentType: string; extension: string };

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function graphVersion(value: string | undefined, fallback: string): string {
  const version = String(value || fallback).trim();
  if (!/^v?\d+\.\d+$/u.test(version)) throw new BadRequestException('نسخه Graph API معتبر نیست');
  return version.startsWith('v') ? version : `v${version}`;
}

function readImageDataUrl(value: string): ImagePayload {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/u.exec(value.trim());
  if (!match) throw new BadRequestException('تصویر باید PNG، JPEG یا WebP و به‌صورت data URL باشد');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('حجم تصویر بیش از ۱۵ مگابایت است');
  return { buffer, contentType, extension: contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg' };
}

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

const TELEGRAM_HTML_TAG = /<\/?(?:b|strong|i|em|u|ins|s|del|strike|code|pre|tg-spoiler|blockquote)\s*\/?>|<a\s+href=["']https?:\/\/[^"']+["']\s*>|<\/a>/giu;

function telegramHtml(value: string): string {
  // Preserve only Telegram's harmless formatting tags. Values such as a
  // title or summary are escaped unless they are part of the template itself.
  const tags: string[] = [];
  const tokenized = value.replace(TELEGRAM_HTML_TAG, (tag) => {
    tags.push(tag);
    return `__DESKA_TELEGRAM_TAG_${tags.length - 1}__`;
  });
  const escaped = tokenized.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  return escaped.replace(/__DESKA_TELEGRAM_TAG_(\d+)__/gu, (_, index: string) => tags[Number(index)] || '');
}

function renderCaptionTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/giu, (match, key: string) => values[key] ?? match).trim();
}

function persianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

@Injectable()
export class SocialNetworkPublisherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PublishingSettingsService,
    private readonly outbound: SourceReaderService,
  ) {}

  private storagePath() { return path.join(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'), 'social-publishing'); }

  async storePublicMedia(image: ImagePayload): Promise<{ filename: string }> {
    const filename = `${randomUUID()}.${image.extension}`;
    await fs.mkdir(this.storagePath(), { recursive: true });
    await fs.writeFile(path.join(this.storagePath(), filename), image.buffer, { mode: 0o600 });
    const cleanup = () => void fs.rm(path.join(this.storagePath(), filename), { force: true });
    setTimeout(cleanup, 30 * 60 * 1000).unref();
    return { filename };
  }

  async publicMedia(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(?:png|jpg|webp)$/iu.test(filename)) throw new NotFoundException();
    const extension = path.extname(filename).toLowerCase();
    const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), path.basename(filename))), contentType }; }
    catch { throw new NotFoundException(); }
  }

  async publish(tenantId: string, articleId: string, network: string, caption: string, imageDataUrl: string): Promise<{ ok: true; network: Network; message: string }> {
    if (!['telegram', 'instagram', 'linkedin', 'facebook'].includes(network)) throw new BadRequestException('شبکه اجتماعی معتبر نیست');
    const article = await this.prisma.socialArticle.findFirst({
      where: { id: articleId, tenantId },
      select: {
        id: true, title: true, link: true, captionText: true, author: true, category: true,
        readingTime: true, leadText: true, summaryText: true, shortUrl: true, feed: { select: { name: true } },
      },
    });
    if (!article) throw new NotFoundException('مطلب اجتماعی یافت نشد');
    const image = readImageDataUrl(imageDataUrl);
    const submittedCaption = caption.trim();
    const settings = await this.settings.getRaw(tenantId);
    // A prepared article keeps the caption generated with the old template.
    // If the user submits that unchanged caption, rebuild it from the current
    // template. A changed caption is treated as an intentional manual edit.
    const normalizedCaption = submittedCaption === article.captionText?.trim()
      ? renderCaptionTemplate(String(settings.social_caption_template || '{title}\n\n{lead}\n\n{summary}\n\n{link}'), {
        title: article.title,
        lead: article.leadText || '',
        author: article.author || 'نامشخص',
        category: article.category || 'نامشخص',
        reading_time: article.readingTime ? persianDigits(article.readingTime) : 'نامشخص',
        summary: article.summaryText || '',
        link: article.shortUrl || article.link,
        source: article.feed?.name || '',
      })
      : submittedCaption;
    if (!normalizedCaption) throw new BadRequestException('کپشن نمی‌تواند خالی باشد');
    await this.prisma.socialArticle.update({ where: { id: article.id }, data: { captionText: normalizedCaption, rewrittenText: normalizedCaption, status: 'ready' } });
    if (network === 'telegram') await this.publishTelegram(settings, normalizedCaption, image);
    if (network === 'facebook') await this.publishFacebook(settings, normalizedCaption, image);
    if (network === 'linkedin') await this.publishLinkedIn(settings, article.title, normalizedCaption, image);
    if (network === 'instagram') await this.publishInstagram(settings, normalizedCaption, image);
    return { ok: true, network: network as Network, message: 'انتشار با موفقیت انجام شد.' };
  }

  async testConnection(tenantId: string, network: string, settings: PublishingSettings): Promise<{ ok: true; network: Network; message: string }> {
    if (!['telegram', 'instagram', 'linkedin', 'facebook'].includes(network)) throw new BadRequestException('شبکه اجتماعی معتبر نیست');
    if (network === 'telegram') await this.testTelegram(settings);
    if (network === 'instagram') await this.testInstagram(settings);
    if (network === 'linkedin') await this.testLinkedIn(settings);
    if (network === 'facebook') await this.testFacebook(settings);
    void tenantId;
    return { ok: true, network: network as Network, message: 'اتصال و دسترسی شبکه با موفقیت تأیید شد.' };
  }

  private async publishTelegram(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) throw new BadRequestException('تنظیمات تلگرام کامل نیست');
    if (settings.telegram_bridge_url) {
      const response = await this.telegramBridgeRequest(settings.telegram_bridge_url, {
        token: settings.telegram_bot_token,
        chat_id: settings.telegram_chat_id,
        caption: telegramHtml(caption.slice(0, 1024)),
        parse_mode: 'HTML',
        photo_base64: image.buffer.toString('base64'),
      });
      if (!response.ok) throw new BadRequestException('Worker تلگرام انتشار مطلب را تأیید نکرد');
      return;
    }
    const form = new FormData();
    form.set('chat_id', settings.telegram_chat_id);
    form.set('caption', telegramHtml(caption.slice(0, 1024)));
    form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([asArrayBuffer(image.buffer)], { type: image.contentType }), `social.${image.extension}`);
    const response = await this.telegramRequest(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new BadRequestException(`تلگرام درخواست انتشار را با خطای ${response.status} رد کرد`);
    const result = await response.json() as { ok?: boolean };
    if (!result.ok) throw new BadRequestException('تلگرام انتشار مطلب را تأیید نکرد');
  }

  private async testTelegram(settings: PublishingSettings) {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) throw new BadRequestException('تنظیمات تلگرام کامل نیست');
    if (settings.telegram_bridge_url) {
      await this.telegramBridgeProbe(settings.telegram_bridge_url);
      return;
    }
    const base = `https://api.telegram.org/bot${settings.telegram_bot_token}`;
    const me = await this.telegramRequest(`${base}/getMe`, { signal: AbortSignal.timeout(15_000) });
    if (!me.ok) throw new BadRequestException(`توکن تلگرام با خطای ${me.status} رد شد`);
    const meResult = await me.json() as { ok?: boolean };
    if (!meResult.ok) throw new BadRequestException('توکن تلگرام معتبر نیست');
    const chat = await this.telegramRequest(`${base}/getChat?chat_id=${encodeURIComponent(settings.telegram_chat_id)}`, { signal: AbortSignal.timeout(15_000) });
    if (!chat.ok) throw new BadRequestException(`دسترسی ربات تلگرام به مقصد با خطای ${chat.status} رد شد`);
    const chatResult = await chat.json() as { ok?: boolean };
    if (!chatResult.ok) throw new BadRequestException('ربات تلگرام به مقصد انتخاب‌شده دسترسی ندارد یا شناسه مقصد صحیح نیست');
  }

  private async telegramRequest(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BadRequestException(timedOut
        ? 'تلگرام در مهلت مقرر پاسخ نداد؛ اتصال خروجی HTTPS و DNS سرور را بررسی کنید.'
        : 'ارتباط با تلگرام برقرار نشد؛ دسترسی خروجی HTTPS و DNS سرور را بررسی کنید.');
    }
  }

  private async telegramBridgeRequest(url: string, payload: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
    try {
      const response = await this.outbound.safeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 30_000,
        acceptedTypes: ['application/json'],
        allowLocalhostInDevelopment: true,
      });
      let body: { ok?: boolean; error?: string; detail?: string; description?: string } = {};
      try { body = response.json<typeof body>(); } catch { /* Preserve the HTTP status below. */ }
      if (!response.ok) return { ok: false, error: body.error || body.description || body.detail || `Worker تلگرام با خطای ${response.status} پاسخ داد` };
      return body;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BadRequestException(timedOut
        ? 'Worker تلگرام در مهلت مقرر پاسخ نداد؛ وضعیت Worker و دسترسی HTTPS را بررسی کنید.'
        : 'ارتباط با Worker تلگرام برقرار نشد؛ آدرس Worker و دسترسی HTTPS را بررسی کنید.');
    }
  }

  private async telegramBridgeProbe(url: string): Promise<void> {
    try {
      const response = await this.outbound.safeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
        timeoutMs: 15_000,
        acceptedTypes: ['application/json'],
        allowLocalhostInDevelopment: true,
      });
      // The current Worker requires token/chat_id/text or photo_base64. Its
      // expected 400 response to an empty probe proves the relay is reachable
      // without sending an unsolicited Telegram message.
      if (![400, 405].includes(response.status) && !response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BadRequestException(timedOut
        ? 'Worker تلگرام در مهلت مقرر پاسخ نداد؛ وضعیت Worker و دسترسی HTTPS را بررسی کنید.'
        : 'ارتباط با Worker تلگرام برقرار نشد؛ آدرس Worker و دسترسی HTTPS را بررسی کنید.');
    }
  }

  private async publishFacebook(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.social_facebook_page_access_token || !settings.social_facebook_page_id) throw new BadRequestException('تنظیمات فیسبوک کامل نیست');
    const version = graphVersion(settings.social_facebook_api_version, 'v23.0');
    const form = new FormData();
    form.set('access_token', settings.social_facebook_page_access_token);
    form.set('message', caption);
    form.set('published', 'true');
    form.set('source', new Blob([asArrayBuffer(image.buffer)], { type: image.contentType }), `social.${image.extension}`);
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_facebook_page_id)}/photos`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new BadRequestException(`فیسبوک درخواست انتشار را با خطای ${response.status} رد کرد`);
  }

  private async testFacebook(settings: PublishingSettings) {
    if (!settings.social_facebook_page_access_token || !settings.social_facebook_page_id) throw new BadRequestException('تنظیمات فیسبوک کامل نیست');
    const version = graphVersion(settings.social_facebook_api_version, 'v23.0');
    const query = new URLSearchParams({ fields: 'id,name', access_token: settings.social_facebook_page_access_token });
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_facebook_page_id)}?${query}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال صفحه فیسبوک با خطای ${response.status} رد شد`);
  }

  private async publishInstagram(settings: PublishingSettings, caption: string, image: ImagePayload) {
    if (!settings.social_instagram_access_token || !settings.social_instagram_account_id) throw new BadRequestException('تنظیمات اینستاگرام کامل نیست');
    if (!settings.social_public_media_base_url) throw new BadRequestException('برای اینستاگرام ابتدا آدرس عمومی API رسانه را تنظیم کنید');
    const stored = await this.storePublicMedia(image);
    const version = graphVersion(settings.social_instagram_api_version, 'v23.0');
    const mediaUrl = `${settings.social_public_media_base_url.replace(/\/$/u, '')}/api/publishing/social/media/${stored.filename}`;
    const create = new URLSearchParams({ image_url: mediaUrl, caption, access_token: settings.social_instagram_access_token });
    const containerResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}/media`, { method: 'POST', body: create, signal: AbortSignal.timeout(30_000) });
    if (!containerResponse.ok) throw new BadRequestException(`اینستاگرام ساخت محفظه انتشار را با خطای ${containerResponse.status} رد کرد`);
    const container = await containerResponse.json() as { id?: string };
    if (!container.id) throw new BadRequestException('اینستاگرام شناسه محفظه انتشار را برنگرداند');
    const publish = new URLSearchParams({ creation_id: container.id, access_token: settings.social_instagram_access_token });
    const publishResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}/media_publish`, { method: 'POST', body: publish, signal: AbortSignal.timeout(30_000) });
    if (!publishResponse.ok) throw new BadRequestException(`اینستاگرام انتشار مطلب را با خطای ${publishResponse.status} رد کرد`);
  }

  private async testInstagram(settings: PublishingSettings) {
    if (!settings.social_instagram_access_token || !settings.social_instagram_account_id) throw new BadRequestException('تنظیمات اینستاگرام کامل نیست');
    const version = graphVersion(settings.social_instagram_api_version, 'v23.0');
    const query = new URLSearchParams({ fields: 'id,username', access_token: settings.social_instagram_access_token });
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(settings.social_instagram_account_id)}?${query}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال حساب اینستاگرام با خطای ${response.status} رد شد`);
  }

  private async publishLinkedIn(settings: PublishingSettings, title: string, caption: string, image: ImagePayload) {
    if (!settings.social_linkedin_access_token || !settings.social_linkedin_author_urn) throw new BadRequestException('تنظیمات لینکدین کامل نیست');
    const version = String(settings.social_linkedin_api_version || '202501').trim();
    if (!/^\d{6}$/u.test(version)) throw new BadRequestException('نسخه API لینکدین معتبر نیست');
    const headers = { Authorization: `Bearer ${settings.social_linkedin_access_token}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0' };
    const initResponse = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ initializeUploadRequest: { owner: settings.social_linkedin_author_urn } }), signal: AbortSignal.timeout(30_000) });
    if (!initResponse.ok) throw new BadRequestException(`لینکدین آماده‌سازی تصویر را با خطای ${initResponse.status} رد کرد`);
    const init = await initResponse.json() as { value?: { uploadUrl?: string; image?: string } };
    if (!init.value?.uploadUrl || !init.value.image) throw new BadRequestException('لینکدین اطلاعات بارگذاری تصویر را برنگرداند');
    const uploadResponse = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { 'Content-Type': image.contentType }, body: asArrayBuffer(image.buffer), signal: AbortSignal.timeout(30_000) });
    if (!uploadResponse.ok) throw new BadRequestException(`لینکدین بارگذاری تصویر را با خطای ${uploadResponse.status} رد کرد`);
    const postResponse = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ author: settings.social_linkedin_author_urn, commentary: caption, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { id: init.value.image, title: { text: title } } } }), signal: AbortSignal.timeout(30_000) });
    if (!postResponse.ok) throw new BadRequestException(`لینکدین انتشار مطلب را با خطای ${postResponse.status} رد کرد`);
  }

  private async testLinkedIn(settings: PublishingSettings) {
    if (!settings.social_linkedin_access_token || !settings.social_linkedin_author_urn) throw new BadRequestException('تنظیمات لینکدین کامل نیست');
    const version = String(settings.social_linkedin_api_version || '202501').trim();
    if (!/^\d{6}$/u.test(version)) throw new BadRequestException('نسخه API لینکدین معتبر نیست');
    const response = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${settings.social_linkedin_access_token}`, 'LinkedIn-Version': version }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadRequestException(`اتصال لینکدین با خطای ${response.status} رد شد`);
  }
}
