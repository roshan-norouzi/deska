'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Rss } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { useApi } from '@/hooks/use-api';

export default function SocialPage() {
  const feeds = useApi<any[]>('/publishing/feeds');
  const articles = useApi<any[]>('/publishing/social/articles');
  const [text, setText] = useState('');
  const socialFeeds = Array.isArray(feeds.data) ? feeds.data.filter((feed) => feed.purpose === 'social-studio') : [];
  const rows = Array.isArray(articles.data) ? articles.data : [];

  return (
    <ProtectedLayout title="استودیوی اجتماعی">
      <main className="mx-auto max-w-6xl space-y-6 p-6" dir="rtl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-bold">استودیوی اجتماعی</h1><p className="mt-1 text-sm text-slate-500">بازنویسی و آماده‌سازی محتوا برای شبکه‌های اجتماعی.</p></div>
          <Link href="/publishing/feeds" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"><Plus className="h-4 w-4" /> مدیریت فیدها</Link>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">فیدهای استودیوی اجتماعی</h2><p className="mt-1 text-sm text-slate-500">فقط منابعی که با کاربرد «استودیوی اجتماعی» ثبت شده‌اند.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">{socialFeeds.length} فید</span></div>
          {socialFeeds.length === 0 ? <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Rss className="h-5 w-5" /> هنوز فیدی برای این بخش مشخص نشده است.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{socialFeeds.map((feed) => <div className="rounded-xl border border-slate-200 p-3" key={feed.id}><div className="font-medium text-slate-900">{feed.name}</div><div className="mt-1 truncate text-xs text-slate-500" dir="ltr" title={feed.url}>{feed.url}</div></div>)}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold">بازنویسی محتوای اجتماعی</h2><textarea className="min-h-28 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" placeholder="متن یا لید محتوا" value={text} onChange={(event) => setText(event.target.value)} /><button className="mt-3 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={() => setText(text.trim())}>آماده‌سازی متن</button></section>

        <section><h2 className="mb-3 font-semibold">محتواهای اجتماعی</h2>{rows.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">هنوز محتوای اجتماعی دریافت نشده است.</div> : <div className="grid gap-3 md:grid-cols-2">{rows.map((article) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={article.id}><h3 className="font-semibold">{article.title}</h3><p className="mt-2 text-sm text-slate-600">{article.rewrittenText || article.summaryText || article.originalText || 'بدون متن'}</p><span className="mt-3 inline-block text-xs text-slate-500">{article.status}</span></article>)}</div>}</section>
      </main>
    </ProtectedLayout>
  );
}
