'use client';

import Link from 'next/link';
import { Building2, UserCheck, Users } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { formatNumber } from '@/lib/date';

interface DashboardStats {
  employeeCount: number;
  departmentCount: number;
}

const quickLinks = [
  {
    href: '/hr/employees',
    label: 'کارمندان',
    description: 'مشاهده و مدیریت پرونده‌های پرسنلی',
    icon: Users,
    accent: 'bg-blue-50 text-blue-700',
  },
  {
    href: '/hr/departments',
    label: 'دپارتمان‌ها',
    description: 'ساختار واحدهای سازمانی',
    icon: Building2,
    accent: 'bg-violet-50 text-violet-700',
  },
];

export default function HrDashboardPage() {
  const { data: stats, isLoading } = useApi<DashboardStats>('/hr/dashboard');

  const cards = [
    { label: 'کارمندان فعال', value: stats?.employeeCount, icon: UserCheck, accent: 'bg-blue-50 text-blue-700' },
    { label: 'دپارتمان‌ها', value: stats?.departmentCount, icon: Building2, accent: 'bg-violet-50 text-violet-700' },
  ];

  return (
    <ProtectedLayout title="منابع انسانی">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-gradient-to-l from-white to-primary-50/60 p-6 shadow-sm">
          <p className="text-sm font-semibold text-primary-700">مرکز منابع انسانی</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">کارمندان و ساختار سازمانی</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            پرونده‌های پرسنلی و دپارتمان‌ها را از یک فضای یکپارچه مدیریت کنید.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="آمار منابع انسانی">
          {cards.map((card) => (
            <Card key={card.label} className="border-slate-200 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-3 ${card.accent}`}>
                  <card.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {isLoading || card.value == null ? '…' : formatNumber(card.value)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>دسترسی سریع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
                >
                  <div className={`mb-4 inline-flex rounded-xl p-3 ${link.accent}`}>
                    <link.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="font-semibold text-slate-900 group-hover:text-primary-700">{link.label}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{link.description}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
