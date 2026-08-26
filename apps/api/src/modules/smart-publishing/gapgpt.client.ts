import { BadRequestException, Injectable } from '@nestjs/common';
import type { PublishingSettings } from './dto/publishing-settings.dto';

interface GapGptResponse {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  error?: { message?: string };
}

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

@Injectable()
export class GapGptClient {
  private credentials(settings: PublishingSettings) {
    const baseUrl = String(settings.gapgpt_base_url ?? '').trim();
    const apiKey = String(settings.gapgpt_api_key ?? '').trim();
    const model = String(settings.gapgpt_model ?? '').trim() || 'gpt-4o-mini';
    if (!baseUrl || !apiKey) {
      throw new BadRequestException('ابتدا آدرس و کلید API GapGPT را در تنظیمات نشر هوشمند وارد کنید');
    }
    return { baseUrl, apiKey, model };
  }

  async test(settings: PublishingSettings): Promise<{ ok: true; message: string }> {
    const { baseUrl, apiKey } = this.credentials(settings);
    try {
      const response = await fetch(endpoint(baseUrl, 'models'), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { ok: true, message: 'اتصال GapGPT با موفقیت برقرار شد' };
    } catch (error) {
      throw new BadRequestException(`اتصال GapGPT برقرار نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
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
    ].join('\n\n'), 1400);
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
    ].join('\n\n'), 5000);
    const result = raw.replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!result) throw new Error('GapGPT ترجمهٔ متن کامل را خالی برگرداند');
    return result;
  }

  private async complete(settings: PublishingSettings, system: string, user: string, maxTokens: number): Promise<string> {
    const { baseUrl, apiKey, model } = this.credentials(settings);
    const response = await fetch(endpoint(baseUrl, 'chat/completions'), {
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
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.json().catch(() => ({})) as GapGptResponse;
    if (!response.ok) throw new Error(body.error?.message || `GapGPT HTTP ${response.status}`);
    const content = String(body.choices?.[0]?.message?.content ?? body.output_text ?? '').trim();
    if (!content) throw new Error('پاسخ GapGPT خالی بود');
    return content;
  }
}

