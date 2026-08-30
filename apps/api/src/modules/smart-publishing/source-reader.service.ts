import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
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
  authorImageUrl: string;
  author: string;
  category: string;
  publishedAt: Date | null;
}

export interface SourceArticle {
  canonicalUrl: string;
  title: string;
  text: string;
  featuredImageUrl: string;
  authorImageUrl: string;
  author: string;
  category: string;
  shortUrl: string;
}

const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_ARTICLE_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 5;

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface ValidatedTarget {
  url: URL;
  addresses: ResolvedAddress[];
}

export interface SafeHttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  maxResponseBytes?: number;
  timeoutMs?: number;
  acceptedTypes?: string[];
  allowLocalhostInDevelopment?: boolean;
}

export interface SafeHttpResponse {
  ok: boolean;
  status: number;
  headers: IncomingHttpHeaders;
  buffer: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

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

function bestSrcset(value: string): string {
  const candidates = value.split(',').map((item) => {
    const [url, descriptor] = item.trim().split(/\s+/u);
    const width = descriptor?.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
    return { url, width: Number.isFinite(width) ? width : 0 };
  }).filter((item) => item.url);
  return candidates.sort((a, b) => b.width - a.width)[0]?.url || '';
}

function parseIpv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  return octets.length === 4 ? octets : null;
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes('%') || isIP(normalized) !== 6) return null;

  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return null;
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;

  const groups = [...left, ...Array.from({ length: omitted }, () => '0'), ...right]
    .map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? groups
    : null;
}

function embeddedIpv4(groups: number[], offset: number): string {
  return `${groups[offset] >> 8}.${groups[offset] & 0xff}.${groups[offset + 1] >> 8}.${groups[offset + 1] & 0xff}`;
}

/** Reject every address that is not globally routable unicast. */
function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b, c, d] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || (a === 168 && b === 63 && c === 129 && d === 16);
  }

  const ipv6 = parseIpv6(normalized);
  if (!ipv6) return true;

  // IPv4-compatible and IPv4-mapped forms, including hexadecimal tails such
  // as ::ffff:7f00:1, must be classified using their embedded IPv4 address.
  const firstFiveZero = ipv6.slice(0, 5).every((part) => part === 0);
  if (firstFiveZero && ipv6[5] === 0xffff) return isBlockedAddress(embeddedIpv4(ipv6, 6));
  if (ipv6.slice(0, 6).every((part) => part === 0)) return true;
  const isIsatap = (ipv6[4] === 0 || ipv6[4] === 0x0200) && ipv6[5] === 0x5efe;
  if (isIsatap && isBlockedAddress(embeddedIpv4(ipv6, 6))) return true;

  // Globally routed IPv6 unicast currently lives in 2000::/3. This excludes
  // ULA, link-local, site-local, multicast, discard-only and translation-only
  // ranges before checking special allocations inside global unicast space.
  if ((ipv6[0] & 0xe000) !== 0x2000) return true;
  return (ipv6[0] === 0x2001 && ipv6[1] === 0x0000) // Teredo
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0002) // benchmarking
    || (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8) // documentation
    || (ipv6[0] === 0x2002) // 6to4
    || (ipv6[0] === 0x3fff && (ipv6[1] & 0xf000) === 0x0000); // documentation
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
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
      const enclosure = entry.enclosure as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const mediaItems = array((entry['media:content'] ?? entry['media:thumbnail']) as unknown).map((item) => item as Record<string, unknown>);
      const enclosureItems = array(enclosure as unknown).map((item) => item as Record<string, unknown>);
      const htmlImage = (rawSummary.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '');
      const imageCandidate = [...enclosureItems, ...mediaItems, entry.image as Record<string, unknown> | undefined]
        .map((item) => text(item?.['@_url'] ?? item?.url ?? item?.['#text'])).find(Boolean) || htmlImage;
      const featuredImageUrl = normalizeUrl(imageCandidate, feedUrl);
      const dateValue = text(entry.pubDate ?? entry.published ?? entry.updated ?? entry.date);
      const authorValue = entry.author && typeof entry.author === 'object'
        ? text((entry.author as Record<string, unknown>).name ?? entry.author)
        : text(entry['dc:creator'] ?? entry.creator ?? entry.author);
      const category = array(entry.category as unknown[]).map((item) => text(item)).filter(Boolean).join('، ');
      const date = dateValue ? new Date(dateValue) : null;
      return {
        canonicalUrl,
        guid: text(entry.guid ?? entry.id),
        title,
        summary: this.htmlToText(rawSummary).slice(0, 12_000),
        content: this.htmlToText(rawContent).slice(0, 80_000),
        featuredImageUrl,
        authorImageUrl: '',
        author: authorValue.slice(0, 300),
        category: category.slice(0, 500),
        publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    }).filter((entry) => entry.canonicalUrl && entry.title);
  }

  async readAuthorImage(articleUrl: string): Promise<string> {
    try {
      const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
      const $ = load(html);
      const selector = '[itemprop="author"] img, [rel="author"] img, a[href*="/author/"] img, .author img, .author-avatar img, .avatar img, [class*="author"] img, [class*="avatar"] img, img[alt*="author" i], img[alt*="نویسنده"]';
      const srcset = $(selector).map((_, node) => bestSrcset($(node).attr('srcset') || $(node).attr('data-srcset') || '')).get().find(Boolean);
      const candidate = srcset
        || $('meta[property="article:author:image"]').attr('content')
        || $('meta[name="author:image"]').attr('content')
        || $('meta[property="profile:image"], meta[name="profile:image"]').attr('content')
        || $(selector).map((_, node) => $(node).attr('src') || $(node).attr('data-src') || '').get().find(Boolean)
        || '';
      return normalizeUrl(candidate, articleUrl);
    } catch {
      return '';
    }
  }

  async readArticle(articleUrl: string): Promise<SourceArticle> {
    const html = await this.safeFetchText(articleUrl, MAX_ARTICLE_BYTES, ['text/html', 'application/xhtml+xml']);
    // Keep an untouched DOM for metadata and title-block extraction. The
    // cleaned DOM below intentionally removes <header>, but many Elementor
    // themes render ACF `uptitle` and the post title inside that element.
    const metadata$ = load(html);
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

    const title = (metadata$('meta[property="og:title"]').attr('content') || metadata$('h1').first().text() || metadata$('title').text()).replace(/\s+/g, ' ').trim();
    const canonicalUrl = normalizeUrl(metadata$('link[rel="canonical"]').attr('href') || articleUrl, articleUrl) || articleUrl;
    const articleSrcsetImage = $('article img, main img').map((_, node) => bestSrcset($(node).attr('srcset') || $(node).attr('data-srcset') || '')).get().find(Boolean);
    const featuredImageCandidate = articleSrcsetImage
      || $('meta[property="og:image:secure_url"]').attr('content')
      || $('meta[property="og:image"]').attr('content')
      || $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr('content')
      || $('link[rel="image_src"]').attr('href')
      || $('article img, main img').map((_, node) => $(node).attr('src') || $(node).attr('data-src') || '').get().find(Boolean)
      || '';
    const featuredImageUrl = normalizeUrl(featuredImageCandidate, articleUrl);
    const author = (metadata$('meta[name="author"]').attr('content')
      || metadata$('[rel="author"]').first().text()
      || metadata$('[itemprop="author"]').first().text()).replace(/\s+/g, ' ').trim();
    const category = (metadata$('meta[property="article:section"]').attr('content')
      || metadata$('[itemprop="articleSection"]').first().text()).replace(/\s+/g, ' ').trim();
    const shortUrl = normalizeUrl(metadata$('link[rel="shortlink"]').attr('href') || '', articleUrl);
    const authorMetadata$ = metadata$;
    const authorImageSelector = '[itemprop="author"] img, [rel="author"] img, a[href*="/author/"] img, .author img, .author-avatar img, .avatar img, [class*="author"] img, [class*="avatar"] img, img[alt*="author" i], img[alt*="نویسنده"]';
    const authorSrcsetImage = authorMetadata$(authorImageSelector).map((_, node) => bestSrcset(authorMetadata$(node).attr('srcset') || authorMetadata$(node).attr('data-srcset') || '')).get().find(Boolean);
    const authorImageCandidate = authorSrcsetImage
      || $('meta[property="article:author:image"]').attr('content')
      || $('meta[name="author:image"]').attr('content')
      || $('meta[property="profile:image"], meta[name="profile:image"]').attr('content')
      || authorMetadata$(authorImageSelector).map((_, node) => authorMetadata$(node).attr('src') || authorMetadata$(node).attr('data-src') || '').get().find(Boolean)
      || (() => {
        let found = '';
        $('script[type="application/ld+json"]').each((_, node) => {
          if (found) return;
          try {
            const root = JSON.parse($(node).text()) as unknown;
            const scan = (value: unknown): void => {
              if (found || !value || typeof value !== 'object') return;
              if (Array.isArray(value)) { value.forEach(scan); return; }
              const record = value as Record<string, unknown>;
              const type = String(record['@type'] || '').toLowerCase();
              if (type.includes('person')) {
                if (typeof record.image === 'string') { found = record.image; return; }
                if (record.image && typeof record.image === 'object' && typeof (record.image as Record<string, unknown>).url === 'string') { found = String((record.image as Record<string, unknown>).url); return; }
              }
              if (record.author) scan(record.author);
              if (record.image && typeof record.image === 'object') scan(record.image);
            };
            scan(root);
          } catch { /* malformed JSON-LD is ignored */ }
        });
        return found;
      })()
      || '';
    const authorImageUrl = normalizeUrl(authorImageCandidate, articleUrl);
    return { canonicalUrl, title, text: articleText.slice(0, 120_000), featuredImageUrl, authorImageUrl, author: author.slice(0, 300), category: category.slice(0, 500), shortUrl };
  }

  async proxyImage(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    let target = await this.assertPublicUrl(imageUrl);
    const maxBytes = 15 * 1024 * 1024;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        Accept: 'image/*',
        'User-Agent': 'DESKA-ERP/1.0',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای تصویر بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`تصویر با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').split(';')[0].toLowerCase();
      const allowedImageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
      if (!allowedImageTypes.has(contentType)) {
        response.resume();
        throw new BadRequestException('نوع تصویر قابل قبول نیست');
      }
      const buffer = await this.readResponse(response, maxBytes, 'حجم تصویر بیش از حد مجاز است');
      if (!buffer.length) throw new BadRequestException('پاسخ تصویر خالی است');
      return { buffer, contentType };
    }
    throw new BadRequestException('دریافت تصویر انجام نشد');
  }

  private htmlToText(value: string): string {
    if (!value) return '';
    const $ = load(`<body>${value}</body>`);
    $('script,style,noscript').remove();
    return $('body').text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  }

  private async resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
    if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses
      .filter((item): item is ResolvedAddress => item.family === 4 || item.family === 6)
      .map((item) => ({ address: item.address, family: item.family }));
  }

  private async assertPublicUrl(value: string, allowLocalhostInDevelopment = false): Promise<ValidatedTarget> {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('آدرس منبع معتبر نیست'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('آدرس منبع معتبر نیست');
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/u, '');
    if (!hostname) throw new BadRequestException('آدرس منبع معتبر نیست');
    const allowLocalhost = allowLocalhostInDevelopment
      && process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      if (!allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    }
    if (isIP(hostname) && isBlockedAddress(hostname) && !allowLocalhost) throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
    try {
      const addresses = await this.resolveAddresses(hostname);
      if (!addresses.length || (!allowLocalhost && addresses.some((item) => isBlockedAddress(item.address)))) {
        throw new BadRequestException('دسترسی به آدرس داخلی مجاز نیست');
      }
      // Canonicalize a trailing DNS dot so Host and TLS SNI use the same name
      // that was validated above. IP literals are already normalized by URL.
      if (!isIP(hostname)) url.hostname = hostname;
      return { url, addresses };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('نام میزبان منبع قابل شناسایی نیست');
    }
  }

  private async assertRedirect(location: string, currentUrl: URL): Promise<ValidatedTarget> {
    try {
      return await this.assertPublicUrl(new URL(location, currentUrl).toString());
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('آدرس تغییر مسیر معتبر نیست');
    }
  }

  private createPinnedRequestOptions(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal = AbortSignal.timeout(30_000),
    method = 'GET',
  ): RequestOptions {
    const originalHostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return {
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      method,
      path: `${url.pathname}${url.search}`,
      headers: { ...headers, Host: url.host, 'Accept-Encoding': 'identity' },
      signal,
      ...(url.protocol === 'https:' && isIP(originalHostname) === 0 ? { servername: originalHostname } : {}),
    };
  }

  private requestAddress(
    url: URL,
    address: ResolvedAddress,
    headers: Record<string, string>,
    signal: AbortSignal,
    method = 'GET',
    body?: Buffer,
  ): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const options = this.createPinnedRequestOptions(url, address, headers, signal, method);
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, resolve);
      request.once('error', reject);
      if (body?.length) request.write(body);
      request.end();
    });
  }

  private async requestPinned(
    target: ValidatedTarget,
    headers: Record<string, string>,
    method = 'GET',
    body?: Buffer,
    timeoutMs = 30_000,
  ): Promise<IncomingMessage> {
    let lastError: unknown;
    const signal = AbortSignal.timeout(timeoutMs);
    for (const address of target.addresses) {
      try {
        // The socket connects to this exact validated IP. For HTTPS, SNI and
        // certificate validation still use the original hostname.
        return await this.requestAddress(target.url, address, headers, signal, method, body);
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : 'connection failed';
    throw new BadRequestException(`اتصال امن به منبع برقرار نشد: ${reason}`);
  }

  private async readResponse(response: IncomingMessage, maxBytes: number, sizeError: string): Promise<Buffer> {
    const declaredLength = Number(headerValue(response.headers, 'content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy();
      throw new BadRequestException(sizeError);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const rawChunk of response) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        throw new BadRequestException(sizeError);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }

  /**
   * Send credentials or request bodies only after DNS validation, then pin the
   * socket to that exact public address. Redirects are intentionally not
   * followed because forwarding secrets to a second origin is unsafe.
   */
  async safeRequest(value: string, options: SafeHttpRequestOptions = {}): Promise<SafeHttpResponse> {
    const method = String(options.method || 'GET').trim().toUpperCase();
    if (!/^[A-Z]{3,10}$/u.test(method)) throw new BadRequestException('روش درخواست خروجی معتبر نیست');
    const body = options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body);
    if (body && body.length > 25 * 1024 * 1024) throw new BadRequestException('حجم درخواست خروجی بیش از حد مجاز است');

    const target = await this.assertPublicUrl(value, options.allowLocalhostInDevelopment);
    const headers = { ...(options.headers ?? {}) };
    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
      headers['Content-Length'] = String(body.length);
    }
    const response = await this.requestPinned(
      target,
      headers,
      method,
      body,
      Math.min(120_000, Math.max(1_000, options.timeoutMs ?? 30_000)),
    );
    const status = response.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.resume();
      throw new BadRequestException('مقصد خروجی تغییر مسیر داد؛ آدرس نهایی سرویس را وارد کنید');
    }
    const contentType = headerValue(response.headers, 'content-type').toLowerCase();
    if (contentType && options.acceptedTypes?.length && !options.acceptedTypes.some((type) => contentType.includes(type))) {
      response.resume();
      throw new BadRequestException('نوع محتوای پاسخ سرویس قابل قبول نیست');
    }
    const buffer = await this.readResponse(
      response,
      options.maxResponseBytes ?? 2 * 1024 * 1024,
      'حجم پاسخ سرویس بیش از حد مجاز است',
    );
    const text = () => new TextDecoder('utf-8').decode(buffer);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: response.headers,
      buffer,
      text,
      json: <T = unknown>() => JSON.parse(text()) as T,
    };
  }

  private async safeFetchText(initialUrl: string, maxBytes: number, acceptedTypes: string[]): Promise<string> {
    let target = await this.assertPublicUrl(initialUrl);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await this.requestPinned(target, {
        'user-agent': 'Mozilla/5.0 (compatible; DESKA-Newsroom/1.0; +https://pixad.ir)',
        Accept: `${acceptedTypes.join(', ')}, */*;q=0.1`,
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(response.headers, 'location');
        response.resume();
        if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('تعداد تغییر مسیرهای منبع بیش از حد مجاز است');
        target = await this.assertRedirect(location, target.url);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new BadRequestException(`منبع با خطای HTTP ${status} پاسخ داد`);
      }
      const contentType = headerValue(response.headers, 'content-type').toLowerCase();
      if (contentType && !acceptedTypes.some((type) => contentType.includes(type))) {
        response.resume();
        throw new BadRequestException('نوع محتوای دریافتی از منبع قابل قبول نیست');
      }
      const bytes = await this.readResponse(response, maxBytes, 'حجم محتوای منبع بیش از حد مجاز است');
      return new TextDecoder('utf-8').decode(bytes);
    }
    throw new BadRequestException('دریافت منبع انجام نشد');
  }
}
