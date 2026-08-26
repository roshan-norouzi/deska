'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { ResourceListPage } from '@/components/pages/resource-list-page';
import { Badge, statusToBadgeVariant } from '@/components/ui/badge';
import {
  JOB_OPENING_STATUS,
  JOB_OPENING_STATUS_LABELS,
} from '@deska/shared';
import { formatJalaliDate } from '@/lib/date';

interface JobOpening {
  id: string;
  title: string;
  status?: string;
  department?: string | null;
  departmentRef?: { name: string } | null;
  createdAt: string;
  _count?: { applicants: number };
}

const jobStatusOptions = Object.values(JOB_OPENING_STATUS).map((value) => ({
  value,
  label: JOB_OPENING_STATUS_LABELS[value] ?? value,
}));

export default function HrRecruitmentPage() {
  return (
    <ProtectedLayout title="استخدام">
      <ResourceListPage<JobOpening>
        title="فرصت‌های شغلی"
        apiPath="/hr/job-openings"
        createLabel="آگهی جدید"
        detailHref={(row) => `/hr/recruitment/${row.id}`}
        columns={[
          { key: 'title', header: 'عنوان' },
          {
            key: 'department',
            header: 'دپارتمان',
            render: (row) => row.departmentRef?.name ?? row.department ?? '—',
          },
          {
            key: 'status',
            header: 'وضعیت',
            render: (row) => (
              <Badge variant={statusToBadgeVariant(row.status ?? 'open')}>
                {JOB_OPENING_STATUS_LABELS[row.status ?? 'open'] ?? row.status}
              </Badge>
            ),
          },
          {
            key: 'applicants',
            header: 'متقاضی',
            render: (row) => row._count?.applicants ?? 0,
          },
          { key: 'createdAt', header: 'تاریخ', render: (row) => formatJalaliDate(row.createdAt) },
        ]}
        createFields={[
          { name: 'title', label: 'عنوان', required: true },
          { name: 'departmentId', label: 'دپارتمان', type: 'department' },
          { name: 'description', label: 'توضیحات', type: 'textarea' },
          {
            name: 'status',
            label: 'وضعیت',
            type: 'select',
            options: jobStatusOptions,
          },
        ]}
        editFields={[
          { name: 'title', label: 'عنوان' },
          { name: 'departmentId', label: 'دپارتمان', type: 'department' },
          { name: 'description', label: 'توضیحات', type: 'textarea' },
          {
            name: 'status',
            label: 'وضعیت',
            type: 'select',
            options: jobStatusOptions,
          },
        ]}
        mapRowToForm={(row) => ({
          title: row.title,
          departmentId: '',
          description: '',
          status: row.status ?? 'open',
        })}
      />
    </ProtectedLayout>
  );
}
