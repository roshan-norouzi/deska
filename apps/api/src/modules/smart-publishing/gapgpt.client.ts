import { BadRequestException, Injectable } from '@nestjs/common';
import type { PublishingSettings } from './dto/publishing-settings.dto';
import { SourceReaderService } from './source-reader.service';

interface GapGptResponse {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  error?: { message?: string };
}

type GapGptActivity = 'newsSummary' | 'newsTranslation' | 'social' | 'dailyReport';

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      const parsed: unknown = JSON.parse(cleaned.slice(first, last + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeSocialLead(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  const sentences = compact.match(/[^.!؟…]+(?:[.!؟…]+|$)/gu)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  return sentences.slice(0, 2).join(' ').trim();
}

@Injectable()
export class GapGptClient {
  constructor(private readonly outbound: SourceReaderService) {}

  private credentials(settings: PublishingSettings, activity?: GapGptActivity) {
    const baseUrl = String(settings.gapgpt_base_url ?? '').trim();
    const apiKey = String(settings.gapgpt_api_key ?? '').trim();
    const activityKeys: Record<GapGptActivity, keyof PublishingSettings> = {
      newsSummary: 'gapgpt_model_news_summary',
      newsTranslation: 'gapgpt_model_news_translation',
      social: 'gapgpt_model_social',
      dailyReport: 'gapgpt_model_daily_report',
    };
    const model = String((activity ? settings[activityKeys[activity]] : '') ?? '').trim()
      || String(settings.gapgpt_model ?? '').trim()
      || 'gpt-4o-mini';
    if (!baseUrl || !apiKey) {
      throw new BadRequestException('ابتدا آدرس و کلید API GapGPT را در تنظیمات نشر هوشمند وارد کنید');
    }
    return { baseUrl, apiKey, model };
  }

  async test(settings: PublishingSettings): Promise<{ ok: true; message: string }> {
    const { baseUrl, apiKey } = this.credentials(settings);
    try {
      const response = await this.outbound.safeRequest(endpoint(baseUrl, 'models'), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        timeoutMs: 20_000,
        acceptedTypes: ['application/json'],
        allowLocalhostInDevelopment: true,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { ok: true, message: 'اتصال GapGPT با موفقیت برقرار شد' };
    } catch (error) {
      throw new BadRequestException(`اتصال GapGPT برقرار نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    }
  }

  async models(settings: PublishingSettings): Promise<{ ok: true; models: string[] }> {
    const { baseUrl, apiKey } = this.credentials(settings);
    try {
      const response = await this.outbound.safeRequest(endpoint(baseUrl, 'models'), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        timeoutMs: 20_000,
        acceptedTypes: ['application/json'],
        allowLocalhostInDevelopment: true,
      });
      let body: { data?: Array<{ id?: unknown }>; error?: { message?: string } } = {};
      try { body = response.json<typeof body>(); } catch { /* Status handling below provides a safe error. */ }
      if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`);
      const models = (body.data ?? [])
        .map((item) => String(item?.id ?? '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
      return { ok: true, models };
    } catch (error) {
      throw new BadRequestException(`دریافت فهرست مدل‌های GapGPT انجام نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    }
  }

  async summarize(
    settings: PublishingSettings,
    input: { sourceName: string; title: string; summary: string },
  ): Promise<{ title: string; summary: string }> {
    const systemPrompt = String(settings.news_summary_prompt ?? '').trim()
      || 'خبر را دقیق، بی‌طرف و با نثر حرفه‌ای روزنامه‌نگارانه به فارسی ترجمه و خلاصه کن. هیچ واقعیت، عدد، نام یا نقل‌قولی را حدس نزن.';
    const raw = await this.complete(settings, systemPrompt, [
      `منبع: ${input.sourceName}`,
      `عنوان اصلی: ${input.title}`,
      `خلاصه یا متن ورودی:\n${input.summary}`,
      'فقط یک JSON معتبر با ساختار {"title":"عنوان فارسی","summary":"خلاصه فارسی در ۲ تا ۴ جمله"} برگردان.',
    ].join('\n\n'), 1400, 'newsSummary');
    const parsed = extractJson(raw);
    const title = String(parsed?.title ?? '').trim();
    const summary = String(parsed?.summary ?? '').trim();
    if (!title || !summary) throw new Error('پاسخ GapGPT قالب معتبر عنوان و خلاصه را نداشت');
    return { title: title.slice(0, 500), summary: summary.slice(0, 4000) };
  }

  async translateFullText(
    settings: PublishingSettings,
    input: { sourceName: string; title: string; text: string; part: number; totalParts: number },
  ): Promise<string> {
    const systemPrompt = String(settings.news_full_translation_prompt ?? '').trim()
      || 'متن خبر را کامل، دقیق و روان به فارسی ترجمه کن. هیچ بخش، عدد، نام، نقل‌قول یا جزئیات مهمی را حذف یا اضافه نکن. خروجی فقط متن فارسی باشد.';
    const raw = await this.complete(settings, systemPrompt, [
      `منبع: ${input.sourceName}`,
      `عنوان: ${input.title}`,
      `بخش ${input.part} از ${input.totalParts}`,
      'متن اصلی:',
      input.text,
      'ترجمهٔ کامل همین بخش را بدون توضیح اضافه برگردان.',
    ].join('\n\n'), 5000, 'newsTranslation');
    const result = raw.replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!result) throw new Error('GapGPT ترجمهٔ متن کامل را خالی برگرداند');
    return result;
  }

  async prepareSocial(
    settings: PublishingSettings,
    input: { title: string; author: string; category: string; text: string },
  ): Promise<{ lead: string; summary: string }> {
    const raw = await this.complete(settings,
      'از متن ورودی فقط اطلاعات موجود را استخراج و به فارسی روان خلاصه کن. عنوان را بازنویسی نکن و هیچ نام، عدد یا واقعیتی را حدس نزن.',
      [
        `عنوان ثابت و غیرقابل‌تغییر: ${input.title}`,
        `نویسنده موجود: ${input.author || 'نامشخص'}`,
        `دسته‌بندی موجود: ${input.category || 'نامشخص'}`,
        `متن مطلب:\n${input.text.slice(0, 60_000)}`,
        'فقط JSON معتبر با ساختار {"lead":"لید دقیق حداکثر در دو جمله و در یک پاراگراف بدون خط جدید","summary":"خلاصه دقیق در دو پاراگراف با یک خط خالی بین آن‌ها"} برگردان.',
      ].join('\n\n'),
      1800,
      'social',
    );
    const parsed = extractJson(raw);
    const lead = normalizeSocialLead(String(parsed?.lead ?? ''));
    let summary = String(parsed?.summary ?? '').trim();
    if (!lead || !summary) throw new Error('پاسخ GapGPT قالب معتبر لید و خلاصه اجتماعی را نداشت');
    const paragraphs = summary.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length < 2) {
      const sentences = summary.split(/(?<=[.!؟])\s+/).filter(Boolean);
      const middle = Math.max(1, Math.ceil(sentences.length / 2));
      summary = [sentences.slice(0, middle).join(' '), sentences.slice(middle).join(' ')].filter(Boolean).join('\n\n');
    } else {
      summary = paragraphs.slice(0, 2).join('\n\n');
    }
    return { lead: lead.slice(0, 1200), summary: summary.slice(0, 5000) };
  }

  async prepareDailyReport(
    settings: PublishingSettings,
    input: { sourceName: string; title: string; text: string },
  ): Promise<{ title: string; bullets: string[] }> {
    const raw = await this.complete(settings,
      'Act as a precise English-language news editor. Preserve facts, names, dates and numbers. Use a neutral tone. Do not add analysis or unsupported claims.',
      [
        `Source: ${input.sourceName || 'Unknown source'}`,
        `Original headline: ${input.title}`,
        `Article text:\n${input.text.slice(0, 60_000)}`,
        'Return only valid JSON with this structure: {"title":"concise English headline","bullets":["factual summary sentence","another factual summary sentence"]}. Produce as many concise English bullets as needed to cover the material facts; typically 3 to 8 and no more than 12.',
      ].join('\n\n'),
      1800,
      'dailyReport',
    );
    const parsed = extractJson(raw);
    const title = String(parsed?.title ?? '').trim();
    const bullets = Array.isArray(parsed?.bullets)
      ? parsed.bullets.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!title || bullets.length < 1) throw new Error('GapGPT پاسخ معتبر عنوان انگلیسی و بولت‌ها را برنگرداند');
    return { title: title.slice(0, 500), bullets: bullets.map((item) => item.slice(0, 1200)) };
  }

  private async complete(settings: PublishingSettings, system: string, user: string, maxTokens: number, activity: GapGptActivity): Promise<string> {
    const { baseUrl, apiKey, model } = this.credentials(settings, activity);
    const response = await this.outbound.safeRequest(endpoint(baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      timeoutMs: 120_000,
      maxResponseBytes: 4 * 1024 * 1024,
      acceptedTypes: ['application/json'],
      allowLocalhostInDevelopment: true,
    });
    let body: GapGptResponse = {};
    try { body = response.json<GapGptResponse>(); } catch { /* Status handling below provides a safe error. */ }
    if (!response.ok) throw new Error(body.error?.message || `GapGPT HTTP ${response.status}`);
    const content = String(body.choices?.[0]?.message?.content ?? body.output_text ?? '').trim();
    if (!content) throw new Error('پاسخ GapGPT خالی بود');
    return content;
  }
}
