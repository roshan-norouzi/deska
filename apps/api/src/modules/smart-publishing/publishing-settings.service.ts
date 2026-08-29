import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PUBLISHING_SETTING_KEYS,
  type PublishingSettingKey,
  type PublishingSettings,
  type UpdatePublishingSettingsDto,
} from './dto/publishing-settings.dto';
import { SecretProtectionService } from './secret-protection.service';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const SECRET_KEYS = new Set<PublishingSettingKey>([
  'gapgpt_api_key',
  'wp_app_password',
  'telegram_bot_token',
  'social_instagram_access_token',
  'social_linkedin_access_token',
  'social_facebook_page_access_token',
]);

const DEFAULT_COVER_TEMPLATE = JSON.stringify({
  version: 1,
  width: 1080,
  height: 1080,
  backgroundColor: '#0f172a',
  layers: [
    { id: 'featured-image', name: 'تصویر شاخص', type: 'featured-image', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 100, borderRadius: 0, objectFit: 'cover' },
    { id: 'overlay', name: 'پوشش تیره', type: 'text', binding: 'custom', content: '', x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 55, color: '#ffffff', backgroundColor: '#0f172a', fontSize: 16, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'title', name: 'تیتر مطلب', type: 'text', binding: 'title', x: 8, y: 48, width: 84, height: 28, visible: true, opacity: 100, color: '#ffffff', backgroundColor: 'transparent', fontSize: 46, fontWeight: 800, align: 'right', borderRadius: 0 },
    { id: 'lead', name: 'لید مطلب', type: 'text', binding: 'lead', x: 8, y: 77, width: 84, height: 14, visible: true, opacity: 100, color: '#e2e8f0', backgroundColor: 'transparent', fontSize: 24, fontWeight: 400, align: 'right', borderRadius: 0 },
    { id: 'source', name: 'نام منبع', type: 'text', binding: 'source', x: 8, y: 6, width: 40, height: 8, visible: true, opacity: 100, color: '#ffffff', backgroundColor: '#2563eb', fontSize: 20, fontWeight: 700, align: 'center', borderRadius: 18 },
  ],
});

const DEFAULTS: PublishingSettings = {
  gapgpt_model: 'gpt-4o-mini',
  gapgpt_model_news_summary: 'gpt-4o-mini',
  gapgpt_model_news_translation: 'gpt-4o-mini',
  gapgpt_model_social: 'gpt-4o-mini',
  gapgpt_model_daily_report: 'gpt-4o-mini',
  news_poll_interval_minutes: '240',
  news_max_age_days: '10',
  social_poll_interval_minutes: '240',
  social_max_age_days: '10',
  telegram_bridge_url: 'https://telegram-bridge.roshan-norouzi.workers.dev/',
  social_caption_template: '{title}\n\n{lead}\n\nنویسنده: {author}\nدسته‌بندی: {category}\nزمان مطالعه: {reading_time} دقیقه\n\n{summary}\n\n{link}',
  social_image_template: DEFAULT_COVER_TEMPLATE,
  social_font_library: JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn' }]),
  wp_post_status: 'publish',
  wp_login_path: 'wp-admin',
};

// Older releases stored empty strings for fields whose UI showed a default
// value. Treat those stale values as missing, otherwise the form displays one
// value but sends another when saved.
const DEFAULT_WHEN_EMPTY = new Set<PublishingSettingKey>([
  'gapgpt_model',
  'gapgpt_model_news_summary',
  'gapgpt_model_news_translation',
  'gapgpt_model_social',
  'gapgpt_model_daily_report',
  'news_poll_interval_minutes',
  'news_max_age_days',
  'social_poll_interval_minutes',
  'social_max_age_days',
  'telegram_bridge_url',
  'social_caption_template',
  'social_image_template',
  'social_font_library',
  'wp_post_status',
  'wp_login_path',
  'social_instagram_api_version',
  'social_linkedin_api_version',
  'social_facebook_api_version',
]);

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

/**
 * Nest + class-transformer creates decorated optional DTO properties with an
 * own value of `undefined`. Therefore `key in input` is not a safe way to
 * decide whether a browser actually submitted a setting. An empty string is
 * intentionally considered provided: it is the user's explicit request to
 * clear a non-secret setting.
 */
function isProvidedSetting(input: UpdatePublishingSettingsDto, key: PublishingSettingKey): boolean {
  return typeof input[key as keyof UpdatePublishingSettingsDto] === 'string';
}

function normalizeHttpUrl(value: string, label: string): string {
  const normalized = value.trim().replace(/\/$/, '');
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new BadRequestException(`${label} معتبر نیست`);
  }
}

function normalizeSecureServiceUrl(value: string, label: string): string {
  const normalized = normalizeHttpUrl(value, label);
  if (!normalized) return '';
  const url = new URL(normalized);
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname.replace(/^\[|\]$/gu, ''));
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new BadRequestException(`${label} باید از HTTPS استفاده کند`);
  }
  return normalized;
}

function boundedInteger(value: string, label: string, min: number, max: number): string {
  if (!/^\d+$/.test(value.trim())) throw new BadRequestException(`${label} باید عدد صحیح باشد`);
  const number = Number(value);
  if (number < min || number > max) throw new BadRequestException(`${label} باید بین ${min} و ${max} باشد`);
  return String(number);
}

function normalizeLoginPath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'wp-admin';
  if (normalized.includes('..') || normalized.includes('?') || normalized.includes('#') || normalized.includes('\\') || !/^[a-zA-Z0-9/_-]+$/.test(normalized)) {
    throw new BadRequestException('مسیر ورود WordPress معتبر نیست');
  }
  return normalized;
}

function normalizeCoverTemplate(value: string): string {
  let template: Record<string, unknown>;
  try {
    template = JSON.parse(value) as Record<string, unknown>;
  } catch {
    // Upgrade the former free-text image prompt to the visual template format.
    return DEFAULT_COVER_TEMPLATE;
  }

  const layers = Array.isArray(template.layers) ? template.layers : [];
  if (template.version !== 1 || layers.length > 30) {
    throw new BadRequestException('ساختار قالب تصویری معتبر نیست یا تعداد لایه‌ها بیش از ۳۰ است');
  }

  const allowedTypes = new Set(['featured-image', 'author-image', 'text', 'image', 'gradient']);
  const allowedBindings = new Set(['title', 'lead', 'author', 'category', 'reading_time', 'summary', 'link', 'source', 'custom']);
  for (const item of layers) {
    const layer = cleanObject(item);
    if (typeof layer.id !== 'string' || !layer.id || typeof layer.name !== 'string' || !allowedTypes.has(String(layer.type))) {
      throw new BadRequestException('یکی از لایه‌های قالب تصویری معتبر نیست');
    }
    if (layer.type === 'text' && !allowedBindings.has(String(layer.binding))) {
      throw new BadRequestException('پارامتر متنی یکی از لایه‌ها معتبر نیست');
    }
    for (const key of ['x', 'y', 'width', 'height', 'opacity']) {
      const number = Number(layer[key]);
      if (!Number.isFinite(number) || number < 0 || number > 100) {
        throw new BadRequestException(`مقدار ${key} در قالب تصویری باید بین ۰ تا ۱۰۰ باشد`);
      }
    }
    if (typeof layer.content === 'string' && layer.content.length > 2000) {
      throw new BadRequestException('متن دلخواه هر لایه حداکثر ۲۰۰۰ کاراکتر است');
    }
    if (typeof layer.imageUrl === 'string' && layer.imageUrl) {
      const localImage = layer.imageUrl.startsWith('/publishing/settings/images/file/') && !layer.imageUrl.includes('..');
      if (!localImage) normalizeHttpUrl(layer.imageUrl, 'آدرس تصویر دلخواه');
    }
    if (layer.type === 'gradient') {
      for (const key of ['gradientFromOpacity', 'gradientToOpacity']) {
        const opacity = Number(layer[key] ?? 100);
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) throw new BadRequestException('شفافیت رنگ گرادینت باید بین ۰ تا ۱۰۰ باشد');
      }
      const angle = Number(layer.gradientAngle ?? 135);
      if (!Number.isFinite(angle) || angle < 0 || angle > 360) throw new BadRequestException('زاویهٔ گرادینت باید بین ۰ تا ۳۶۰ درجه باشد');
      for (const key of ['gradientFrom', 'gradientTo']) {
        if (typeof layer[key] !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(String(layer[key]))) throw new BadRequestException('رنگ گرادینت معتبر نیست');
      }
    }
  }

  const width = Number(template.width);
  const height = Number(template.height);
  if (![1080].includes(width) || ![1080, 1350, 1920].includes(height)) {
    throw new BadRequestException('اندازه خروجی قالب تصویری معتبر نیست');
  }
  return JSON.stringify({ ...template, width, height, layers });
}

function normalizeCoverTemplateLibrary(value: string, legacyTemplate: string): string {
  if (!value.trim()) {
    return JSON.stringify({
      version: 1,
      defaultTemplateId: 'default',
      templates: [{ id: 'default', name: 'قالب اصلی', template: JSON.parse(normalizeCoverTemplate(legacyTemplate)) }],
    });
  }
  let library: Record<string, unknown>;
  try { library = JSON.parse(value) as Record<string, unknown>; }
  catch { throw new BadRequestException('ساختار کتابخانه قالب‌های تصویری معتبر نیست'); }
  const rawTemplates = Array.isArray(library.templates) ? library.templates : [];
  if (library.version !== 1 || !rawTemplates.length || rawTemplates.length > 20) {
    throw new BadRequestException('کتابخانه قالب تصویری باید بین ۱ تا ۲۰ قالب معتبر داشته باشد');
  }
  const ids = new Set<string>();
  const templates = rawTemplates.map((raw, index) => {
    const item = cleanObject(raw);
    const id = String(item.id ?? '').trim();
    const name = String(item.name ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(id) || ids.has(id)) {
      throw new BadRequestException(`شناسه قالب تصویری شماره ${index + 1} معتبر یا یکتا نیست`);
    }
    if (!name || name.length > 80) throw new BadRequestException(`نام قالب تصویری شماره ${index + 1} معتبر نیست`);
    ids.add(id);
    const template = JSON.parse(normalizeCoverTemplate(JSON.stringify(cleanObject(item.template)))) as Record<string, unknown>;
    return { id, name, template };
  });
  const requestedDefaultId = String(library.defaultTemplateId ?? '').trim();
  const defaultTemplateId = ids.has(requestedDefaultId) ? requestedDefaultId : templates[0].id;
  return JSON.stringify({ version: 1, defaultTemplateId, templates });
}

export type FontRecord = { id: string; name: string; url?: string };

function normalizeFontLibrary(value: string): string {
  try {
    const fonts = JSON.parse(value) as unknown;
    if (!Array.isArray(fonts) || fonts.length > 40) throw new Error();
    const normalized: FontRecord[] = [];
    for (const item of fonts) {
      const raw = typeof item === 'string' ? { id: `legacy-${item}`, name: item } : item as Record<string, unknown>;
      const name = String(raw?.name ?? '').trim();
      if (!/^[\w\u0600-\u06ff -]{1,80}$/u.test(name)) continue;
      const id = String(raw?.id ?? `font-${name}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      const rawUrl = raw?.url ? String(raw.url).trim() : '';
      const url = rawUrl.startsWith('/publishing/settings/fonts/file/') && !rawUrl.includes('..') ? rawUrl : (rawUrl ? normalizeHttpUrl(rawUrl, 'آدرس فونت') : undefined);
      if (name.toLowerCase() === 'vazirmatn' || id === 'vazirmatn') continue;
      if (!normalized.some((font) => font.name.toLowerCase() === name.toLowerCase())) normalized.push({ id, name, ...(url ? { url } : {}) });
    }
    return JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn' }, ...normalized]);
  } catch {
    // A malformed legacy value must never block saving unrelated tabs. Reset it
    // to the safe built-in font; custom fonts can be added again from the UI.
    return JSON.stringify([{ id: 'vazirmatn', name: 'Vazirmatn' }]);
  }
}

@Injectable()
export class PublishingSettingsService {
  /**
   * Settings are edited from several independent tabs. Serialize writes per
   * tenant so two quick requests cannot both read the same old JSON and then
   * erase one another's changes. The lock is deliberately scoped to this
   * service instance; the database transaction remains the source of truth.
   */
  private readonly saveLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretProtectionService,
  ) {}

  private storagePath() { return process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'); }

  async addFont(tenantId: string, file: { originalname: string; buffer: Buffer }, requestedName?: string): Promise<FontRecord> {
    if (!file) throw new BadRequestException('فایل فونت انتخاب نشده است');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.woff2', '.woff', '.ttf', '.otf'].includes(ext)) throw new BadRequestException('فرمت فونت باید woff2، woff، ttf یا otf باشد');
    if (!file.buffer?.length || file.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('حجم فونت حداکثر ۱۰ مگابایت است');
    const name = (requestedName || path.basename(file.originalname, ext)).trim();
    if (!/^[\w\u0600-\u06ff -]{1,80}$/u.test(name) || name.toLowerCase() === 'vazirmatn') throw new BadRequestException('نام فونت معتبر نیست');
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const dir = path.join(this.storagePath(), 'fonts');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), file.buffer);
    const current = await this.getRaw(tenantId);
    const library = JSON.parse(normalizeFontLibrary(current.social_font_library || DEFAULTS.social_font_library!)) as FontRecord[];
    const record: FontRecord = { id, name, url: `/publishing/settings/fonts/file/${filename}` };
    const next = [...library.filter((font) => font.name.toLowerCase() !== name.toLowerCase()), record];
    await this.save(tenantId, { social_font_library: JSON.stringify(next) });
    return record;
  }

  async removeFont(tenantId: string, id: string): Promise<void> {
    if (id === 'vazirmatn') throw new BadRequestException('فونت Vazirmatn قابل حذف نیست');
    const current = await this.getRaw(tenantId);
    const library = JSON.parse(normalizeFontLibrary(current.social_font_library || DEFAULTS.social_font_library!)) as FontRecord[];
    const found = library.find((font) => font.id === id);
    if (!found) throw new NotFoundException('فونت پیدا نشد');
    await this.save(tenantId, { social_font_library: JSON.stringify(library.filter((font) => font.id !== id)) });
    if (found.url) await fs.rm(path.join(this.storagePath(), 'fonts', path.basename(found.url)), { force: true });
  }

  async fontFile(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(woff2?|ttf|otf)$/i.test(filename)) throw new NotFoundException();
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : ext === '.ttf' ? 'font/ttf' : 'font/otf';
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), 'fonts', filename)), contentType }; } catch { throw new NotFoundException(); }
  }

  async addImage(file: { originalname: string; buffer: Buffer }): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('فایل تصویر انتخاب نشده است');
    const ext = path.extname(file.originalname).toLowerCase();
    const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    if (!contentTypes[ext]) throw new BadRequestException('فرمت تصویر باید JPG، PNG، WebP یا AVIF باشد');
    if (!file.buffer?.length || file.buffer.length > 15 * 1024 * 1024) throw new BadRequestException('حجم تصویر حداکثر ۱۵ مگابایت است');
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(this.storagePath(), 'cover-images');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), file.buffer);
    return { url: `/publishing/settings/images/file/${filename}` };
  }

  async imageFile(filename: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[a-f0-9-]+\.(jpe?g|png|webp|avif)$/i.test(filename)) throw new NotFoundException();
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
    try { return { buffer: await fs.readFile(path.join(this.storagePath(), 'cover-images', filename)), contentType: contentTypes[ext] }; } catch { throw new NotFoundException(); }
  }

  async getRaw(tenantId: string): Promise<PublishingSettings> {
    const [moduleRow, tenant] = await Promise.all([
      this.prisma.tenantModule.findUnique({
        where: { tenantId_moduleId: { tenantId, moduleId: 'smart-publishing' } },
        select: { settings: true },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    ]);

    const legacy = cleanObject(tenant?.settings);
    const moduleSettings = cleanObject(moduleRow?.settings);
    const result: PublishingSettings = { ...DEFAULTS };
    for (const key of PUBLISHING_SETTING_KEYS) {
      const moduleValue = moduleSettings[key];
      // An empty value from an older release is not authoritative when a
      // valid legacy value still exists in Tenant.settings.
      const moduleValueIsEmptyDefault = typeof moduleValue === 'string'
        && !moduleValue.trim()
        && typeof legacy[key] === 'string'
        && Boolean(legacy[key]?.trim());
      const value = moduleValueIsEmptyDefault ? legacy[key] : (moduleValue ?? legacy[key]);
      if (typeof value !== 'string') continue;
      if (!SECRET_KEYS.has(key) && DEFAULT_WHEN_EMPTY.has(key) && !value.trim()) continue;
      result[key] = SECRET_KEYS.has(key) ? this.secrets.decrypt(value) : value;
    }
    const legacyPrompt = moduleSettings.news_translation_prompt ?? legacy.news_translation_prompt;
    if (typeof legacyPrompt === 'string') {
      result.news_summary_prompt ||= legacyPrompt;
      result.news_full_translation_prompt ||= legacyPrompt;
    }
    // Reading settings must be side-effect free. Earlier versions migrated
    // legacy data during GET, which could race with a simultaneous PUT and
    // overwrite a just-saved value. Legacy values are still read above and
    // are migrated atomically on the next explicit save instead.
    return result;
  }

  async getPublic(tenantId: string): Promise<Record<string, string>> {
    const raw = await this.getRaw(tenantId);
    const result: Record<string, string> = {};
    for (const key of PUBLISHING_SETTING_KEYS) {
      const value = raw[key] ?? '';
      result[key] = SECRET_KEYS.has(key) ? '' : value;
      if (SECRET_KEYS.has(key)) result[`${key}_configured`] = value ? 'true' : 'false';
    }
    return result;
  }

  async save(tenantId: string, input: UpdatePublishingSettingsDto): Promise<Record<string, string>> {
    const previous = this.saveLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.saveLocks.set(tenantId, queued);
    await previous;

    try {
      return await this.saveUnlocked(tenantId, input);
    } finally {
      release();
      if (this.saveLocks.get(tenantId) === queued) this.saveLocks.delete(tenantId);
    }
  }

  private async saveUnlocked(tenantId: string, input: UpdatePublishingSettingsDto): Promise<Record<string, string>> {
    const current = await this.getRaw(tenantId);
    const next: PublishingSettings = { ...current };

    for (const key of PUBLISHING_SETTING_KEYS) {
      if (!isProvidedSetting(input, key)) continue;
      const value = String(input[key as keyof UpdatePublishingSettingsDto] ?? '').trim();
      if (SECRET_KEYS.has(key) && !value) continue;
      next[key] = value;
    }

    const has = (key: PublishingSettingKey) => isProvidedSetting(input, key);
    if (has('gapgpt_base_url')) next.gapgpt_base_url = normalizeSecureServiceUrl(next.gapgpt_base_url ?? '', 'آدرس GapGPT');
    if (has('wp_site_url')) next.wp_site_url = normalizeSecureServiceUrl(next.wp_site_url ?? '', 'آدرس WordPress');
    if (has('telegram_bridge_url') && next.telegram_bridge_url) next.telegram_bridge_url = normalizeSecureServiceUrl(next.telegram_bridge_url, 'آدرس Worker تلگرام');
    if (has('social_public_media_base_url')) next.social_public_media_base_url = normalizeSecureServiceUrl(next.social_public_media_base_url ?? '', 'آدرس عمومی رسانه‌های اجتماعی');
    if (has('wp_login_path')) next.wp_login_path = normalizeLoginPath(next.wp_login_path ?? 'wp-admin');
    if (has('news_poll_interval_minutes')) next.news_poll_interval_minutes = boundedInteger(next.news_poll_interval_minutes?.trim() || '240', 'فاصله پایش', 5, 1440);
    if (has('news_max_age_days')) next.news_max_age_days = boundedInteger(next.news_max_age_days?.trim() || '10', 'حداکثر قدمت خبر', 1, 90);
    if (has('social_poll_interval_minutes')) next.social_poll_interval_minutes = boundedInteger(next.social_poll_interval_minutes?.trim() || '240', 'فاصله پایش استودیوی اجتماعی', 5, 1440);
    if (has('social_max_age_days')) next.social_max_age_days = boundedInteger(next.social_max_age_days?.trim() || '10', 'حداکثر قدمت مطلب اجتماعی', 1, 90);
    if (has('social_image_template')) next.social_image_template = normalizeCoverTemplate(next.social_image_template ?? DEFAULT_COVER_TEMPLATE);
    if (has('social_image_templates')) next.social_image_templates = normalizeCoverTemplateLibrary(next.social_image_templates ?? '', current.social_image_template ?? DEFAULT_COVER_TEMPLATE);
    // Canonicalize the font library only when that subtab is being saved.
    // Normalizing it during an unrelated save could silently replace a custom
    // or legacy library while the user is editing another tab.
    if (has('social_font_library')) {
      next.social_font_library = normalizeFontLibrary(next.social_font_library ?? DEFAULTS.social_font_library!);
    }
    if (has('wp_category_id') && next.wp_category_id && !/^\d+$/.test(next.wp_category_id)) {
      throw new BadRequestException('شناسه دسته‌بندی WordPress باید عدد صحیح باشد');
    }

    const secretsToClear = new Set<PublishingSettingKey>();
    const gapGptHostChanged = has('gapgpt_base_url')
      && String(next.gapgpt_base_url ?? '').trim() !== String(current.gapgpt_base_url ?? '').trim();
    const gapGptSecretProvided = has('gapgpt_api_key') && Boolean(String(input.gapgpt_api_key ?? '').trim());
    if (gapGptHostChanged && !gapGptSecretProvided) {
      next.gapgpt_api_key = '';
      secretsToClear.add('gapgpt_api_key');
    }

    const wordPressHostChanged = has('wp_site_url')
      && String(next.wp_site_url ?? '').trim() !== String(current.wp_site_url ?? '').trim();
    const wordPressSecretProvided = has('wp_app_password') && Boolean(String(input.wp_app_password ?? '').trim());
    if (wordPressHostChanged && !wordPressSecretProvided) {
      next.wp_app_password = '';
      secretsToClear.add('wp_app_password');
    }

    const instagramAccountChanged = has('social_instagram_account_id')
      && String(next.social_instagram_account_id ?? '').trim() !== String(current.social_instagram_account_id ?? '').trim();
    const instagramSecretProvided = has('social_instagram_access_token') && Boolean(String(input.social_instagram_access_token ?? '').trim());
    if (instagramAccountChanged && !instagramSecretProvided) {
      next.social_instagram_access_token = '';
      secretsToClear.add('social_instagram_access_token');
    }

    const linkedinAuthorChanged = has('social_linkedin_author_urn')
      && String(next.social_linkedin_author_urn ?? '').trim() !== String(current.social_linkedin_author_urn ?? '').trim();
    const linkedinSecretProvided = has('social_linkedin_access_token') && Boolean(String(input.social_linkedin_access_token ?? '').trim());
    if (linkedinAuthorChanged && !linkedinSecretProvided) {
      next.social_linkedin_access_token = '';
      secretsToClear.add('social_linkedin_access_token');
    }

    const facebookPageChanged = has('social_facebook_page_id')
      && String(next.social_facebook_page_id ?? '').trim() !== String(current.social_facebook_page_id ?? '').trim();
    const facebookSecretProvided = has('social_facebook_page_access_token') && Boolean(String(input.social_facebook_page_access_token ?? '').trim());
    if (facebookPageChanged && !facebookSecretProvided) {
      next.social_facebook_page_access_token = '';
      secretsToClear.add('social_facebook_page_access_token');
    }

    const [tenant, moduleRow] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
      this.prisma.tenantModule.findUnique({
        where: { tenantId_moduleId: { tenantId, moduleId: 'smart-publishing' } },
        select: { settings: true },
      }),
    ]);
    const moduleSettings = cleanObject(moduleRow?.settings);
    const legacySettings = cleanObject(tenant?.settings);
    // Patch only the keys submitted by this tab. Copy legacy values into the
    // module once, but never rebuild the whole object from defaults; this is
    // what prevents switching tabs from erasing settings saved elsewhere.
    const stored: Record<string, string | unknown> = { ...moduleSettings };
    for (const key of PUBLISHING_SETTING_KEYS) {
      if (secretsToClear.has(key)) continue;
      const storedValue = stored[key];
      const storedValueIsEmptyDefault = typeof storedValue === 'string'
        && !storedValue.trim()
        && typeof legacySettings[key] === 'string'
        && Boolean(legacySettings[key]?.trim());
      if ((!(key in stored) || storedValueIsEmptyDefault) && typeof legacySettings[key] === 'string') {
        const legacyValue = String(legacySettings[key]);
        stored[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(legacyValue) : legacyValue;
      }
    }
    for (const key of PUBLISHING_SETTING_KEYS) {
      if (secretsToClear.has(key)) {
        delete stored[key];
        continue;
      }
      if (!has(key)) continue;
      const value = next[key] ?? '';
      if (SECRET_KEYS.has(key) && !value) continue;
      stored[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(value) : value;
    }
    delete stored.news_translation_prompt;
    const remainingTenantSettings = { ...legacySettings };
    for (const key of [...PUBLISHING_SETTING_KEYS, 'news_translation_prompt']) delete remainingTenantSettings[key];
    await this.prisma.$transaction([
      this.prisma.tenantModule.update({ where: { tenantId_moduleId: { tenantId, moduleId: 'smart-publishing' } }, data: { settings: inputJson(stored) } }),
      this.prisma.tenant.update({ where: { id: tenantId }, data: { settings: inputJson(remainingTenantSettings) } }),
    ]);
    return this.getPublic(tenantId);
  }

  mergeForTest(current: PublishingSettings, input: UpdatePublishingSettingsDto): PublishingSettings {
    const merged = { ...current };
    for (const key of PUBLISHING_SETTING_KEYS) {
      const candidate = input[key as keyof UpdatePublishingSettingsDto];
      if (typeof candidate === 'string' && candidate.trim()) merged[key] = candidate.trim();
    }
    const gapGptHostChanged = Boolean(
      input.gapgpt_base_url?.trim()
      && input.gapgpt_base_url.trim() !== String(current.gapgpt_base_url ?? '').trim(),
    );
    if (gapGptHostChanged && !input.gapgpt_api_key?.trim()) merged.gapgpt_api_key = '';

    const wordPressHostChanged = Boolean(
      input.wp_site_url?.trim()
      && input.wp_site_url.trim() !== String(current.wp_site_url ?? '').trim(),
    );
    if (wordPressHostChanged && !input.wp_app_password?.trim()) merged.wp_app_password = '';
    return merged;
  }

}
