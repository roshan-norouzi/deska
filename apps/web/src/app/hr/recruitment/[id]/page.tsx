'use client';

import { use } from 'react';
import Link from 'next/link';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { ResourceListPage } from '@/components/pages/resource-list-page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusToBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import {
  APPLICANT_STATUS,
  APPLICANT_STATUS_LABELS,
  JOB_OPENING_STATUS_LABELS,
} from '@deska/shared';
import { formatJalaliDate } from '@/lib/date';
import { apiFetch } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface JobOpeningDetail {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  department?: string | null;
  departmentRef?: { name: string } | null;
  createdAt: string;
  applicants: Array<{
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    status: string;
    createdAt: string;
  }>;
}

const applicantStatusOptions = Object.values(APPLICANT_STATUS).map((value) => ({
  value,
  label: APPLICANT_STATUS_LABELS[value] ?? value,
}));

interface ApplicantRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
  notes?: string | null;
}

export default function HrRecruitmentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: opening, isLoading, refetch } = useApi<JobOpeningDetail>(`/hr/job-openings/${id}`);

  if (isLoading) {
    return (
      <ProtectedLayout title="جزئیات آگهی">
        <p className="text-slate-500">در حال بارگذاری...</p>
      </ProtectedLayout>
    );
  }

  if (!opening) {
    return (
      <ProtectedLayout title="جزئیات آگهی">
        <p className="text-red-600">آگهی یافت نشد</p>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout title="جزئیات آگهی">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/hr/recruitment" className="text-slate-500 hover:text-slate-700">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{opening.title}</h2>
            <p className="text-sm text-slate-500">
              {opening.departmentRef?.name ?? opening.department ?? '—'} ·{' '}
              {JOB_OPENING_STATUS_LABELS[opening.status] ?? opening.status} ·{' '}
              {formatJalaliDate(opening.createdAt)}
            </p>
          </div>
        </div>

        {opening.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">توضیحات</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{opening.description}</p>
            </CardContent>
          </Card>
        )}

        <ResourceListPage<ApplicantRow>
          title="متقاضیان"
          apiPath={`/hr/job-openings/${id}/applicants`}
          createLabel="متقاضی جدید"
          canEdit
          canDelete
          columns={[
            { key: 'name', header: 'نام' },
            { key: 'email', header: 'ایمیل', render: (row) => row.email ?? '—' },
            { key: 'phone', header: 'تلفن', render: (row) => row.phone ?? '—' },
            {
              key: 'status',
              header: 'وضعیت',
              render: (row) => (
                <Badge variant={statusToBadgeVariant(row.status)}>
                  {APPLICANT_STATUS_LABELS[row.status] ?? row.status}
                </Badge>
              ),
            },
            {
              key: 'createdAt',
              header: 'تاریخ',
              render: (row) => formatJalaliDate(row.createdAt),
            },
          ]}
          createFields={[
            { name: 'name', label: 'نام', required: true },
            { name: 'email', label: 'ایمیل', type: 'email' },
            { name: 'phone', label: 'تلفن' },
            { name: 'notes', label: 'یادداشت', type: 'textarea' },
            {
              name: 'status',
              label: 'وضعیت',
              type: 'select',
              options: applicantStatusOptions,
            },
          ]}
          editFields={[
            { name: 'name', label: 'نام' },
            { name: 'email', label: 'ایمیل', type: 'email' },
            { name: 'phone', label: 'تلفن' },
            { name: 'notes', label: 'یادداشت', type: 'textarea' },
            {
              name: 'status',
              label: 'وضعیت',
              type: 'select',
              options: applicantStatusOptions,
            },
          ]}
          rowActions={(row) =>
            row.status !== 'hired' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await apiFetch(`/hr/applicants/${row.id}/hire`, { method: 'PATCH' });
                  refetch();
                }}
              >
                استخدام
              </Button>
            ) : null
          }
        />
      </div>
    </ProtectedLayout>
  );
}
