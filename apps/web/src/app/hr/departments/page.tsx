'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { ResourceListPage } from '@/components/pages/resource-list-page';

interface Department {
  id: string;
  name: string;
  parentId?: string | null;
  _count?: { employees: number };
}

export default function HrDepartmentsPage() {
  return (
    <ProtectedLayout title="دپارتمان‌ها">
      <ResourceListPage<Department>
        title="دپارتمان‌ها"
        apiPath="/hr/departments"
        createLabel="دپارتمان جدید"
        columns={[
          { key: 'name', header: 'نام' },
          {
            key: 'employees',
            header: 'تعداد کارمند',
            render: (row) => row._count?.employees ?? 0,
          },
        ]}
        createFields={[
          { name: 'name', label: 'نام دپارتمان', required: true },
        ]}
        editFields={[
          { name: 'name', label: 'نام دپارتمان', required: true },
        ]}
      />
    </ProtectedLayout>
  );
}
