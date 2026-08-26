'use client';
import { Users, UserCheck, Calendar } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDateTime } from '@/lib/date';
import { formatPersianDigits } from '@deska/shared';
interface DashboardStats { contacts: number; hr: { employees: number }; core: { upcomingEvents: number }; generatedAt: string; }
function DashboardContent() { const { data, isLoading, error } = useApi<DashboardStats>('/dashboard/stats'); if (isLoading) return <div className="flex justify-center py-24"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>; if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>; if (!data) return null; const stats = [{ t: 'مخاطبین', v: data.contacts, i: Users }, { t: 'کارمندان فعال', v: data.hr.employees, i: UserCheck }, { t: 'رویدادهای پیش رو', v: data.core.upcomingEvents, i: Calendar }]; return <div className="space-y-6"><div><h2 className="text-2xl font-bold">داشبورد</h2><p className="mt-1 text-sm text-slate-500">آخرین بروزرسانی: {formatJalaliDateTime(data.generatedAt)}</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stats.map(({ t, v, i: Icon }) => <Card key={t}><CardContent className="flex items-start gap-4 p-6"><Icon className="h-6 w-6 text-primary-600" /><div><p className="text-sm text-slate-500">{t}</p><p className="text-2xl font-bold">{formatPersianDigits(v)}</p></div></CardContent></Card>)}</div></div>; }
export default function DashboardPage() { return <ProtectedLayout title="داشبورد"><DashboardContent /></ProtectedLayout>; }
