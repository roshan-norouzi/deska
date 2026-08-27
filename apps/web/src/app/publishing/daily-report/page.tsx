'use client';

import Link from 'next/link';
import { FileBarChart2, Plus, Rss, Sparkles } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';

export default function DailyReportPage() {
  const feeds = useApi<any[]>('/publishing/feeds');
  const sources = Array.isArray(feeds.data) ? feeds.data.filter((feed) => feed.purpose === 'daily-report') : [];
  const cards = [['ورودی خبرها', 'انتخاب خبرهای آماده از منابع گزارش روزانه.'], ['نکات کلیدی', 'تولید نکات دقیق و قابل ارائه از خبرها.'], ['گزارش و آرشیو', 'ساخت خروجی روزانه و نگهداری سوابق.']];
  return <ProtectedLayout title="دیلی ریپورت"><main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
    <header className="flex flex-col gap-5 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FileBarChart2 className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">دیلی ریپورت</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">گزارش روزانه را از منابع منتخب جمع‌آوری و برای ارائه آماده کنید.</p></div></div><Link href="/publishing/feeds" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"><Plus className="h-4 w-4" /> مدیریت فیدها</Link></header>
    <section className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><div className="text-2xl font-bold text-amber-700">{sources.length}</div><div className="mt-1 text-sm text-slate-500">منبع گزارش روزانه</div></Card><Card className="p-4"><div className="text-2xl font-bold text-slate-900">۰</div><div className="mt-1 text-sm text-slate-500">گزارش آماده</div></Card><Card className="p-4"><div className="text-2xl font-bold text-emerald-700">آماده</div><div className="mt-1 text-sm text-slate-500">وضعیت سامانه</div></Card></section>
    <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">منابع دیلی ریپورت</h2><p className="mt-1 text-sm text-slate-500">منابعی که هنگام ثبت برای این بخش انتخاب شده‌اند.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{sources.length} فید</span></div>{sources.length === 0 ? <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500"><Rss className="h-5 w-5" /> هنوز منبعی برای گزارش روزانه مشخص نشده است.</div> : <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.map((feed) => <div className="rounded-2xl border border-slate-200 p-4 hover:border-amber-300" key={feed.id}><div className="font-semibold text-slate-900">{feed.name}</div><div className="mt-2 truncate text-xs text-slate-500" dir="ltr">{feed.url}</div></div>)}</div>}</Card>
    <section className="grid gap-4 md:grid-cols-3">{cards.map(([title, text], index) => <Card className="p-5 transition hover:-translate-y-0.5 hover:shadow-md" key={title}><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">{index === 0 ? <Rss className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</span><h2 className="mt-4 font-bold text-slate-900">{title}</h2><p className="mt-2 text-sm leading-7 text-slate-500">{text}</p></Card>)}</section>
  </main></ProtectedLayout>;
}
