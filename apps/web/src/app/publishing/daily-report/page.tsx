'use client';

import Link from 'next/link';
import { FileBarChart2, Plus, Rss } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { useApi } from '@/hooks/use-api';

export default function DailyReportPage() {
  const feeds = useApi<any[]>('/publishing/feeds');
  const reportFeeds = Array.isArray(feeds.data) ? feeds.data.filter((feed) => feed.purpose === 'daily-report') : [];

  return (
    <ProtectedLayout title="دیلی ریپورت">
      <main className="mx-auto max-w-6xl space-y-6 p-6" dir="rtl">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">دیلی ریپورت</h1><p className="mt-1 text-sm text-slate-500">ساخت گزارش روزانه از منابع منتخب و آماده‌سازی نسخهٔ انگلیسی.</p></div><Link href="/publishing/feeds" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"><Plus className="h-4 w-4" /> مدیریت فیدها</Link></header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">منابع دیلی ریپورت</h2><p className="mt-1 text-sm text-slate-500">منابعی که هنگام ثبت برای «دیلی ریپورت» انتخاب شده‌اند.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{reportFeeds.length} فید</span></div>{reportFeeds.length === 0 ? <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Rss className="h-5 w-5" /> هنوز منبعی برای گزارش روزانه مشخص نشده است.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{reportFeeds.map((feed) => <div className="rounded-xl border border-slate-200 p-3" key={feed.id}><div className="font-medium text-slate-900">{feed.name}</div><div className="mt-1 truncate text-xs text-slate-500" dir="ltr" title={feed.url}>{feed.url}</div></div>)}</div>}</section>

        <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><FileBarChart2 className="h-5 w-5 text-primary-600" /><h2 className="mt-3 font-semibold">ورودی خبرها</h2><p className="mt-2 text-sm leading-6 text-slate-500">انتخاب خبرهای آماده از منابع گزارش روزانه.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">ترجمه و نکات کلیدی</h2><p className="mt-2 text-sm leading-6 text-slate-500">تولید عنوان انگلیسی و نکات کلیدی دقیق.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">گزارش و آرشیو</h2><p className="mt-2 text-sm leading-6 text-slate-500">ساخت خروجی HTML و نگهداری گزارش‌های روزانه.</p></div></div>
      </main>
    </ProtectedLayout>
  );
}
