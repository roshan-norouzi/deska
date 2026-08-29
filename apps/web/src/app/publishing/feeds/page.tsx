'use client';

import { useMemo, useState } from 'react';
import {
  FileBarChart2,
  Newspaper,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Rss,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiFetch, cn } from '@/lib/utils';

type FeedPurpose = 'news-room' | 'social-studio' | 'daily-report';

interface Feed {
  id: string;
  name: string;
  url: string;
  purpose: FeedPurpose;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string;
}

interface FeedForm {
  name: string;
  url: string;
  purpose: FeedPurpose;
}

const EMPTY_FORM: FeedForm = { name: '', url: '', purpose: 'news-room' };

const PURPOSES: Record<FeedPurpose, { label: string; description: string; icon: typeof Rss; color: string }> = {
  'news-room': {
    label: 'اتاق خبر',
    description: 'دریافت و آماده‌سازی خبرها',
    icon: Newspaper,
    color: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  'social-studio': {
    label: 'استودیوی اجتماعی',
    description: 'تولید محتوای شبکه‌های اجتماعی',
    icon: Share2,
    color: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  'daily-report': {
    label: 'دیلی ریپورت',
    description: 'ورودی گزارش روزانه',
    icon: FileBarChart2,
    color: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
};

function validateForm(form: FeedForm) {
  if (form.name.trim().length < 2) return 'نام فید باید حداقل ۲ نویسه باشد.';
  try {
    const url = new URL(form.url.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return 'آدرس فید باید کامل و معتبر باشد؛ مانند https://example.com/feed.xml';
  }
  return '';
}

export default function FeedsPage() {
  const { data, error: loadError, isLoading, refetch } = useApi<Feed[]>('/publishing/feeds');
  const feeds = useMemo(() => Array.isArray(data) ? data : [], [data]);
  const [query, setQuery] = useState('');
  const [purpose, setPurpose] = useState<FeedPurpose | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Feed | null>(null);
  const [form, setForm] = useState<FeedForm>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const visibleFeeds = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    return feeds.filter((feed) => {
      const purposeMatches = purpose === 'all' || feed.purpose === purpose;
      const queryMatches = !normalized || `${feed.name} ${feed.url}`.toLocaleLowerCase('fa').includes(normalized);
      return purposeMatches && queryMatches;
    });
  }, [feeds, purpose, query]);

  const counts = useMemo(() => Object.fromEntries(
    (Object.keys(PURPOSES) as FeedPurpose[]).map((key) => [key, feeds.filter((feed) => feed.purpose === key).length]),
  ) as Record<FeedPurpose, number>, [feeds]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNotice(null);
    setModalOpen(true);
  }

  function openEdit(feed: Feed) {
    setEditing(feed);
    setForm({ name: feed.name, url: feed.url, purpose: feed.purpose });
    setNotice(null);
    setModalOpen(true);
  }

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'عملیات انجام نشد؛ دوباره تلاش کنید.' });
    } finally {
      setBusy(null);
    }
  }

  async function saveFeed(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setNotice({ type: 'error', text: validationError });
      return;
    }
    await run('save', async () => {
      await apiFetch(editing ? `/publishing/feeds/${editing.id}` : '/publishing/feeds', {
        method: editing ? 'PATCH' : 'POST',
        body: { ...form, name: form.name.trim(), url: form.url.trim() },
      });
      setModalOpen(false);
      setNotice({ type: 'success', text: editing ? 'فید با موفقیت ویرایش شد.' : 'فید جدید با موفقیت اضافه شد.' });
      await refetch();
    });
  }

  return (
    <ProtectedLayout title="فیدها">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Rss className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-bold">مدیریت فیدها</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">منابع RSS را یک‌بار ثبت کنید و مشخص کنید محتوای هر منبع در کدام بخش استفاده شود.</p>
            </div>
          </div>
          <Button className="shrink-0 bg-white text-slate-900 hover:bg-slate-100 focus:ring-white" onClick={openCreate}>
            <Plus className="h-4 w-4" /> افزودن فید
          </Button>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {(Object.entries(PURPOSES) as [FeedPurpose, (typeof PURPOSES)[FeedPurpose]][]).map(([key, item]) => {
            const Icon = item.icon;
            return (
              <button key={key} type="button" onClick={() => setPurpose(purpose === key ? 'all' : key)} className={cn('flex items-center gap-4 rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md', purpose === key ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200')}>
                <span className={cn('grid h-11 w-11 place-items-center rounded-xl ring-1', item.color)}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">{item.label}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span></span>
                <span className="text-2xl font-bold text-slate-900">{counts[key]}</span>
              </button>
            );
          })}
        </section>

        {notice && <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{notice.text}</div>}
        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">دریافت فیدها انجام نشد: {loadError}</div>}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا آدرس فید..." className="w-full rounded-xl border border-slate-300 py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><Rss className="h-4 w-4" /> {visibleFeeds.length} فید</div>
          </div>

          {isLoading ? (
            <div className="grid min-h-56 place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>
          ) : visibleFeeds.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Rss className="h-8 w-8" /></span><h2 className="mt-4 font-semibold text-slate-900">فیدی پیدا نشد</h2><p className="mt-2 text-sm text-slate-500">اولین منبع را اضافه کنید یا فیلتر جست‌وجو را تغییر دهید.</p><Button className="mt-5" onClick={openCreate}><Plus className="h-4 w-4" /> افزودن فید</Button></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">فید</th><th className="px-5 py-3 font-medium">کاربرد</th><th className="px-5 py-3 font-medium">آخرین پایش</th><th className="px-5 py-3 font-medium">وضعیت</th><th className="px-5 py-3 font-medium">عملیات</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleFeeds.map((feed) => {
                    const meta = PURPOSES[feed.purpose] ?? PURPOSES['news-room'];
                    const PurposeIcon = meta.icon;
                    return (
                      <tr key={feed.id} className="transition hover:bg-slate-50/80">
                        <td className="px-5 py-4"><div className="font-semibold text-slate-900">{feed.name}</div><div className="mt-1 max-w-md truncate text-xs text-slate-500" dir="ltr" title={feed.url}>{feed.url}</div>{feed.lastError && <div className="mt-1 text-xs text-red-600">{feed.lastError}</div>}</td>
                        <td className="px-5 py-4"><span className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ring-1', meta.color)}><PurposeIcon className="h-4 w-4" />{meta.label}</span></td>
                        <td className="px-5 py-4 text-slate-600">{feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString('fa-IR') : 'هنوز پایش نشده'}</td>
                        <td className="px-5 py-4"><Badge variant={feed.enabled ? 'success' : 'default'}>{feed.enabled ? 'فعال' : 'متوقف'}</Badge></td>
                        <td className="px-5 py-4"><div className="flex items-center gap-1">{['news-room', 'social-studio'].includes(feed.purpose) && <Button size="sm" variant="ghost" title={feed.purpose === 'news-room' ? 'پایش فید اتاق خبر' : 'پایش فید استودیوی اجتماعی'} isLoading={busy === `fetch-${feed.id}`} onClick={() => run(`fetch-${feed.id}`, async () => { const endpoint = feed.purpose === 'social-studio' ? `/publishing/social/feeds/${feed.id}/fetch` : `/publishing/feeds/${feed.id}/fetch`; await apiFetch(endpoint, { method: 'POST' }); setNotice({ type: 'success', text: `پایش «${feed.name}» انجام شد و مطالب جدید در صف آماده‌سازی قرار گرفتند.` }); await refetch(); })}><RefreshCw className="h-4 w-4" /></Button>}<Button size="sm" variant="ghost" title="ویرایش" onClick={() => openEdit(feed)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" title={feed.enabled ? 'توقف' : 'فعال‌سازی'} onClick={() => run(`toggle-${feed.id}`, async () => { await apiFetch(`/publishing/feeds/${feed.id}/toggle`, { method: 'POST' }); await refetch(); })}><Power className={cn('h-4 w-4', feed.enabled ? 'text-emerald-600' : 'text-slate-400')} /></Button><Button size="sm" variant="ghost" title="حذف" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (window.confirm(`فید «${feed.name}» حذف شود؟ مطالب منتشرشده حفظ می‌شوند.`)) run(`delete-${feed.id}`, async () => { await apiFetch(`/publishing/feeds/${feed.id}`, { method: 'DELETE' }); setNotice({ type: 'success', text: 'فید حذف شد.' }); await refetch(); }); }}><Trash2 className="h-4 w-4" /></Button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {modalOpen && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
            <form onSubmit={saveFeed} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-xl font-bold text-slate-900">{editing ? 'ویرایش فید' : 'افزودن فید جدید'}</h2><p className="mt-1 text-sm text-slate-500">منبع و محل استفاده از محتوای آن را مشخص کنید.</p></div><button type="button" aria-label="بستن" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setModalOpen(false)}><X className="h-5 w-5" /></button></div>
              <div className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-2"><Input label="نام فید" required placeholder="مثلاً خبرگزاری رسمی" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><Input label="آدرس RSS" required dir="ltr" placeholder="https://example.com/feed.xml" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} /></div>
                <fieldset><legend className="mb-3 text-sm font-medium text-slate-700">این فید برای کدام بخش استفاده می‌شود؟</legend><div className="grid gap-3 sm:grid-cols-3">{(Object.entries(PURPOSES) as [FeedPurpose, (typeof PURPOSES)[FeedPurpose]][]).map(([key, item]) => { const Icon = item.icon; return <label key={key} className={cn('cursor-pointer rounded-2xl border p-4 transition', form.purpose === key ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-slate-200 hover:border-slate-300')}><input type="radio" name="purpose" value={key} checked={form.purpose === key} onChange={() => setForm((current) => ({ ...current, purpose: key }))} className="sr-only" /><Icon className={cn('h-5 w-5', form.purpose === key ? 'text-primary-700' : 'text-slate-500')} /><span className="mt-3 block text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></label>; })}</div></fieldset>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>انصراف</Button><Button type="submit" isLoading={busy === 'save'}>{editing ? 'ذخیره تغییرات' : 'افزودن فید'}</Button></div>
            </form>
          </div>
        )}
      </main>
    </ProtectedLayout>
  );
}
