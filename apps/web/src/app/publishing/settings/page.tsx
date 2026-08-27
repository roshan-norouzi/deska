'use client';

import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Clock3, Globe2, KeyRound, Save, Settings2, TestTube2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch } from '@/lib/utils';

type Settings = Record<string, string>;

// These flags are returned by the API only to describe whether a secret is
// already stored. They are read-only metadata and must never be submitted
// back to the strict settings DTO.
function editableSettings(values: Settings): Settings {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !key.endsWith('_configured')),
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-700">{label}{children}{hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}</label>;
}

export default function PublishingSettingsPage() {
  const { data, refetch } = useApi<Settings>('/publishing/settings');
  const [values, setValues] = useState<Settings>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'gapgpt' | 'wordpress' | null>(null);

  useEffect(() => { if (data) setValues(data); }, [data]);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function run(kind: typeof busy, operation: () => Promise<unknown>, success: string) {
    setBusy(kind); setError(''); setMessage('');
    try { await operation(); setMessage(success); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : 'عملیات انجام نشد'); }
    finally { setBusy(null); }
  }

  async function save() {
    await run('save', async () => {
      await apiFetch('/publishing/settings', { method: 'PUT', body: editableSettings(values) });
      await refetch();
    }, 'تنظیمات نشر هوشمند با موفقیت ذخیره شد.');
  }

  return (
    <ProtectedLayout title="تنظیمات نشر هوشمند">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Settings2 className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">تنظیمات نشر هوشمند</h1><p className="mt-2 text-sm leading-6 text-slate-300">اتصال امن GapGPT، پایش خبرها و انتشار مستقیم در WordPress.</p></div></div>
          <Button className="bg-white text-slate-900 hover:bg-slate-100" isLoading={busy === 'save'} onClick={save}><Save className="h-4 w-4" /> ذخیره تنظیمات</Button>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{message}</div>}

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Bot className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">هوش مصنوعی GapGPT</h2><p className="mt-1 text-sm text-slate-500">این کلید فقط در سرور نگهداری می‌شود و دوباره به مرورگر برگردانده نمی‌شود.</p></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="آدرس پایه API" hint="آدرسی را وارد کنید که به مسیرهای models و chat/completions متصل می‌شود."><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://api.example.com/v1" value={values.gapgpt_base_url || ''} onChange={(e) => set('gapgpt_base_url', e.target.value)} /></Field>
            <Field label="مدل هوش مصنوعی"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="gpt-4o-mini" value={values.gapgpt_model || ''} onChange={(e) => set('gapgpt_model', e.target.value)} /></Field>
            <Field label="کلید API" hint={values.gapgpt_api_key_configured === 'true' ? 'کلید قبلی ثبت شده است؛ برای حفظ آن، این فیلد را خالی بگذارید.' : 'کلید API حساب GapGPT را وارد کنید.'}><div className="relative"><KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" dir="ltr" autoComplete="new-password" className="w-full rounded-xl border py-2.5 pl-3 pr-10" placeholder={values.gapgpt_api_key_configured === 'true' ? 'کلید ثبت شده است' : 'API key'} value={values.gapgpt_api_key || ''} onChange={(e) => set('gapgpt_api_key', e.target.value)} /></div></Field>
          </div>
          <Button className="mt-5" variant="outline" isLoading={busy === 'gapgpt'} onClick={() => run('gapgpt', () => apiFetch('/publishing/settings/test-gapgpt', { method: 'POST', body: editableSettings(values) }), 'اتصال GapGPT با موفقیت تأیید شد.')}><TestTube2 className="h-4 w-4" /> تست اتصال GapGPT</Button>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Clock3 className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">پایش و پردازش خبر</h2><p className="mt-1 text-sm text-slate-500">فقط فیدهای فعال با کاربرد «اتاق خبر» در این چرخه قرار می‌گیرند.</p></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="فاصله پایش (دقیقه)" hint="مقدار معتبر بین ۵ تا ۱۴۴۰ دقیقه است."><input type="number" min="5" max="1440" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.news_poll_interval_minutes || '240'} onChange={(e) => set('news_poll_interval_minutes', e.target.value)} /></Field>
            <Field label="حداکثر قدمت خبر (روز)" hint="خبرهای قدیمی‌تر هنگام دریافت نادیده گرفته می‌شوند."><input type="number" min="1" max="90" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" value={values.news_max_age_days || '10'} onChange={(e) => set('news_max_age_days', e.target.value)} /></Field>
          </div>
          <div className="mt-5 grid gap-5">
            <Field label="پرامپت ترجمه و خلاصه‌سازی داشبورد" hint="برای تولید تیتر فارسی و خلاصهٔ ۲ تا ۴ جمله‌ای استفاده می‌شود."><textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="لحن، دقت، واژگان و قواعد خلاصه‌سازی خبر را مشخص کنید..." value={values.news_summary_prompt || ''} onChange={(e) => set('news_summary_prompt', e.target.value)} /></Field>
            <Field label="پرامپت ترجمهٔ متن کامل" hint="هنگام انتخاب «انتشار در سایت»، تمام متن منبع با این دستور ترجمه می‌شود."><textarea className="min-h-36 rounded-xl border px-3 py-3 leading-7" placeholder="قواعد ترجمهٔ کامل، دقیق و بدون حذف جزئیات را مشخص کنید..." value={values.news_full_translation_prompt || ''} onChange={(e) => set('news_full_translation_prompt', e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Globe2 className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-slate-900">انتشار در WordPress</h2><p className="mt-1 text-sm text-slate-500">برای امنیت، از Application Password وردپرس استفاده کنید؛ نه رمز اصلی حساب.</p></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="آدرس سایت WordPress"><input dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="https://example.com" value={values.wp_site_url || ''} onChange={(e) => set('wp_site_url', e.target.value)} /></Field>
            <Field label="نام کاربری WordPress"><input dir="ltr" autoComplete="username" className="rounded-xl border px-3 py-2.5" placeholder="publisher" value={values.wp_username || ''} onChange={(e) => set('wp_username', e.target.value)} /></Field>
            <Field label="Application Password" hint={values.wp_app_password_configured === 'true' ? 'رمز برنامه قبلاً ثبت شده است؛ برای حفظ آن خالی بگذارید.' : 'از پیشخوان وردپرس، پروفایل کاربر، بخش Application Passwords دریافت کنید.'}><input type="password" dir="ltr" autoComplete="new-password" className="rounded-xl border px-3 py-2.5" placeholder={values.wp_app_password_configured === 'true' ? 'رمز برنامه ثبت شده است' : 'xxxx xxxx xxxx xxxx'} value={values.wp_app_password || ''} onChange={(e) => set('wp_app_password', e.target.value)} /></Field>
            <Field label="وضعیت مطلب در WordPress"><select className="rounded-xl border px-3 py-2.5" value={values.wp_post_status || 'publish'} onChange={(e) => set('wp_post_status', e.target.value)}><option value="publish">انتشار فوری</option><option value="draft">ذخیره به‌صورت پیش‌نویس</option><option value="pending">در انتظار بازبینی</option></select></Field>
            <Field label="شناسه دسته‌بندی WordPress" hint="اختیاری؛ فقط شناسه عددی دسته را وارد کنید."><input type="text" inputMode="numeric" dir="ltr" className="rounded-xl border px-3 py-2.5" placeholder="12" value={values.wp_category_id || ''} onChange={(e) => set('wp_category_id', e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          <Button className="mt-5" variant="outline" isLoading={busy === 'wordpress'} onClick={() => run('wordpress', () => apiFetch('/publishing/settings/test-wordpress', { method: 'POST', body: editableSettings(values) }), 'اتصال WordPress و دسترسی انتشار تأیید شد.')}><TestTube2 className="h-4 w-4" /> تست اتصال WordPress</Button>
        </Card>

        <div className="flex justify-end"><Button size="lg" isLoading={busy === 'save'} onClick={save}><Save className="h-4 w-4" /> ذخیره همه تنظیمات</Button></div>
      </main>
    </ProtectedLayout>
  );
}
