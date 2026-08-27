'use client';

import { useState } from 'react';
import { CheckCircle2, Globe2, Plus, Send, Share2, Trash2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';

export default function ChannelsPage() {
  const { data, refetch } = useApi<any[]>('/publishing/channels');
  const [name, setName] = useState('');
  const [type, setType] = useState('wordpress');
  const rows = Array.isArray(data) ? data : [];
  async function add() { if (!name.trim()) return; await apiFetch('/publishing/channels', { method: 'POST', body: { name: name.trim(), type } }); setName(''); await refetch(); }
  return <ProtectedLayout title="کانال‌های انتشار"><main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
    <header className="flex flex-col gap-5 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Send className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold">کانال‌های انتشار</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">مقصدهای انتشار محتوا را مدیریت و وضعیت اتصال هرکدام را مشاهده کنید.</p></div></div><span className="rounded-xl bg-white/10 px-4 py-2 text-sm">{rows.length} کانال ثبت‌شده</span></header>
    <Card className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Plus className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">افزودن کانال جدید</h2><p className="mt-1 text-xs text-slate-500">نام کانال و نوع مقصد را وارد کنید.</p></div></div><div className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><input className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" placeholder="مثلاً سایت اصلی" value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-xl border border-slate-300 px-3 py-2.5" value={type} onChange={(event) => setType(event.target.value)}><option value="wordpress">WordPress</option><option value="telegram">Telegram</option><option value="website">وب‌سایت</option></select><Button className="bg-cyan-600 hover:bg-cyan-700" onClick={add}><Plus className="h-4 w-4" /> ثبت کانال</Button></div></Card>
    {rows.length === 0 ? <Card className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><Share2 className="h-9 w-9 text-slate-300" /><h2 className="mt-4 font-bold text-slate-900">هنوز کانالی ثبت نشده است</h2><p className="mt-2 text-sm text-slate-500">اولین مقصد انتشار خود را از فرم بالا اضافه کنید.</p></Card> : <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{rows.map((channel) => <Card className="p-5 transition hover:-translate-y-0.5 hover:shadow-md" key={channel.id}><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Globe2 className="h-5 w-5" /></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{channel.enabled ? 'فعال' : 'غیرفعال'}</span></div><h3 className="mt-4 font-bold text-slate-900">{channel.name}</h3><p className="mt-1 text-sm text-slate-500">{channel.type}</p><div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> آماده استفاده <Trash2 className="mr-auto h-4 w-4 text-slate-400" /></div></Card>)}</section>}
  </main></ProtectedLayout>;
}
