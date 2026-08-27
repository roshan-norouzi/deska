import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PUBLISHING_SETTING_KEYS,
  type PublishingSettingKey,
  type PublishingSettings,
  type UpdatePublishingSettingsDto,
} from './dto/publishing-settings.dto';
import { SecretProtectionService } from './secret-protection.service';

const SECRET_KEYS = new Set<PublishingSettingKey>([
  'gapgpt_api_key',
  'wp_app_password',
  'telegram_bot_token',
]);

const DEFAULTS: PublishingSettings = {
  gapgpt_model: 'gpt-4o-mini',
  news_poll_interval_minutes: '240',
  news_max_age_days: '10',
  wp_post_status: 'publish',
  wp_login_path: 'wp-admin',
};

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
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

@Injectable()
export class PublishingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretProtectionService,
  ) {}

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
      const value = moduleSettings[key] ?? legacy[key];
      if (typeof value === 'string') result[key] = SECRET_KEYS.has(key) ? this.secrets.decrypt(value) : value;
    }
    const legacyPrompt = moduleSettings.news_translation_prompt ?? legacy.news_translation_prompt;
    if (typeof legacyPrompt === 'string') {
      result.news_summary_prompt ||= legacyPrompt;
      result.news_full_translation_prompt ||= legacyPrompt;
    }
    if (moduleRow && [...PUBLISHING_SETTING_KEYS, 'news_translation_prompt'].some((key) => key in legacy)) {
      const stored = this.toStoredSettings(result, moduleSettings);
      const remainingTenantSettings = { ...legacy };
      for (const key of [...PUBLISHING_SETTING_KEYS, 'news_translation_prompt']) delete remainingTenantSettings[key];
      await this.prisma.$transaction([
        this.prisma.tenantModule.update({
          where: { tenantId_moduleId: { tenantId, moduleId: 'smart-publishing' } },
          data: { settings: inputJson(stored) },
        }),
        this.prisma.tenant.update({ where: { id: tenantId }, data: { settings: inputJson(remainingTenantSettings) } }),
      ]);
    }
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
    const current = await this.getRaw(tenantId);
    const next: PublishingSettings = { ...current };

    for (const key of PUBLISHING_SETTING_KEYS) {
      if (!(key in input)) continue;
      const value = String(input[key as keyof UpdatePublishingSettingsDto] ?? '').trim();
      if (SECRET_KEYS.has(key) && !value) continue;
      next[key] = value;
    }

    next.gapgpt_base_url = normalizeHttpUrl(next.gapgpt_base_url ?? '', 'آدرس GapGPT');
    next.wp_site_url = normalizeHttpUrl(next.wp_site_url ?? '', 'آدرس WordPress');
    next.wp_login_path = normalizeLoginPath(next.wp_login_path ?? 'wp-admin');
    next.news_poll_interval_minutes = boundedInteger(next.news_poll_interval_minutes ?? '240', 'فاصله پایش', 5, 1440);
    next.news_max_age_days = boundedInteger(next.news_max_age_days ?? '10', 'حداکثر قدمت خبر', 1, 90);
    if (next.wp_category_id && !/^\d+$/.test(next.wp_category_id)) {
      throw new BadRequestException('شناسه دسته‌بندی WordPress باید عدد صحیح باشد');
    }

    const stored = this.toStoredSettings(next);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const remainingTenantSettings = cleanObject(tenant?.settings);
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
    return merged;
  }

  private toStoredSettings(settings: PublishingSettings, existing: Record<string, unknown> = {}): Record<string, string | unknown> {
    const stored: Record<string, string | unknown> = { ...existing };
    for (const key of PUBLISHING_SETTING_KEYS) {
      const value = settings[key] ?? '';
      stored[key] = SECRET_KEYS.has(key) ? this.secrets.encrypt(value) : value;
    }
    delete stored.news_translation_prompt;
    return stored;
  }
}
