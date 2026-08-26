import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

export interface FeedEntry {
  canonicalUrl: string;
  guid: string;
  title: string;
  summary: string;
  content: string;
  featuredImageUrl: string;
  publishedAt: Date | null;
}

export interface SourceArticle {
  canonicalUrl: string;
  title: string;
  text: string;
  featuredImageUrl: string;
}

const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_ARTICLE_BYTES = 6 * 1024 * 1024;

function array<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return text(record['#text'] ?? record.__cdata ?? record._ ?? '');
}

function normalizeUrl(value: string, base: string): string {
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff')) return true;
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const parts = normalized.split('.').map(Number);
  return parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19));
}

@Injectable()
export class SourceReaderService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    processEntities: true,
  });

  async readFeed(feedUrl: string): Promise<FeedEntry[]> {
    const xml = await this.safeFetchText(feedUrl, MAX_FEED_BYTES, [
      'application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain',
    ]);
    let parsed: Record<string, unknown>;
    try { parsed = this.parser.parse(xml) as Record<string, unknown>; }
    catch { throw new BadRequestException('ساختار RSS/Atom معتبر نیست'); }

    const rss = parsed.rss as Record<string, unknown> | undefined;
    const channel = rss?.channel as Record<string, unknown> | undefined;
    const feed = parsed.feed as Record<string, unknown> | undefined;
    const entries = array<Record<string, unknown>>((channel?.item ?? feed?.entry) as Record<string, unknown> | Record<string, unknown>[] | undefined);

    return entries.slice(0, 50).map((entry) => {
      const linkValue = array(entry.link as unknown[]).map((candidate) => {
        if (typeof candidate === 'string') return candidate;
        const record = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
        const rel = text(record['@_rel']);
        return !rel || rel === 'alternate' ? text(record['@_href'] ?? record['#text']) : '';
      }).find(Boolean) ?? '';
      const canonicalUrl = normalizeUrl(linkValue || text(entry.guid ?? entry.id), feedUrl);
      const title = this.htmlToText(text(entry.title));
      const rawSummary = text(entry.description ?? entry.summary ?? entry['content:encoded'] ?? entry.content);
      const rawContent = text(entry['content:encoded'] ?? entry.content ?? entry.description ?? entry.summary);
      const enclosure = entry.enclosure as Record<string, unknown> | undefined;
      const media = (entry['media:content'] ?? entry['media:thumbnail']) as Record<string, unknown> | undefined;
      const featuredImageUrl = normalizeUrl(text(enclosure?.['@_url'] ?? media?.['@_url']), feedUrl);
      const dateValue = text(entry.pubDate ?? entry.published ?? entry.updated ?? entry.date);
      const date = dateValue ? new Date(dateValue) : null;
      return {
        canonicalUrl,
        guid: text(entry.guid ?? entry.id),
        title,
        summary: this.htmlToText(rawSummary).slice(0, 12_000),
        content: this.htmlToText(rawContent).slice(0, 80_000),
        featuredImageUrl,
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    }).filter((entry) => entry.canonicalUrl && entry.title);
  }

  async readArticle(articleUrl: string): Promise<SourceArticle> {
    const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
    const $ = load(html);
    $('script,style,noscript,svg,iframe,form,nav,header,footer,aside,.advertisement,.ads,.social-share,.related-posts').remove();

    const selectors = [
      '[itemprop="articleBody"]',
      'article .entry-content',
      'article .post-content',
      'article .article-content',
      '.entry-content',
      '.post-content',
      '.article-content',
      'article',
      'main',
    ];
    let articleText = '';
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const candidate = $(element).find('p,h2,h3,blockquote,li').map((__, node) => $(node).text().replace(/\s+/g, ' ').trim()).get().filter((part) => part.length > 20).join('\n\n');
        if (candidate.length > articleText.length) articleText = candidate;
      });
      if (articleText.length >= 800) break;
    }
    if (articleText.length < 200) throw new BadRequestException('متن کامل خبر از صفحه منبع قابل استخراج نبود');

    const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text()).replace(/\s+/g, ' ').trim();
    const canonicalUrl = normalizeUrl($('link[rel="canonical"]').attr('href') || articleUrl, articleUrl) || articleUrl;
    const featuredImageUrl = normalizeUrl($('meta[property="og:image"]').attr('content') || '', articleUrl);
    return { canonicalUrl, title, text: articleText.slice(0, 120_000), featuredImageUrl };
  }

  private htmlToText(value: string): string {
    if (!value) return '';
    const $ = load(`<body>${value}</body>`);
    $('script,style,noscript').remove();
    return $('body').text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  }

  private async assertPublicUrl(value: string): Promise<URL> {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('آدرس منبع معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('آدرس منبع معتبر نیست');
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    }
    if (isIP(hostname) && isPrivateAddress(hostname)) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    try {
      const addresses = await lookup(hostname, { all: true, verbatim: true });
      if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
        throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('نام میزبان منبع قابل شناسایی نیست');
    }
    return url;
  }

  private async safeFetchText(initialUrl: string, maxBytes: number, acceptedTypes: string[]): Promise<string> {
    let url = await this.assertPublicUrl(initialUrl);
    for (let redirect = 0; redirect <= 5; redirect++) {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; DESKA-Newsroom/1.0; +https://pixad.ir)',
          Accept: `${acceptedTypes.join(', ')}, */*;q=0.1`,
          'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirect === 5) throw new BadRequestException('تعداد تغییر مسیرهای منبع بیش از حد مجاز است');
        url = await this.assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new BadRequestException(`منبع با خطای HTTP ${response.status} پاسخ داد`);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !acceptedTypes.some((type) => contentType.includes(type))) {
        throw new BadRequestException('نوع محتوای دریافتی از منبع قابل قبول نیست');
      }
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > maxBytes) throw new BadRequestException('حجم محتوای منبع بیش از حد مجاز است');
      if (!response.body) return '';
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new BadRequestException('حجم محتوای منبع بیش از حد مجاز است');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8').decode(bytes);
    }
    throw new BadRequestException('دریافت منبع انجام نشد');
  }
}
