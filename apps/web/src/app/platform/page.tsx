'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { ResourceListPage } from '@/components/pages/resource-list-page';
import { formatJalaliDate } from '@/lib/date';

interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  memberCount?: number;
}

export default function PlatformPage() {
  return (
    <ProtectedLayout title="مدیریت پلتفرم" superAdminOnly>
      <ResourceListPage<PlatformTenant>
        title="سازمان‌ها"
        description="مدیریت تمام سازمان‌های پلتفرم (فقط مدیر ارشد)"
        apiPath="/tenants"
        columns={[
          { key: 'name', header: 'نام' },
          { key: 'slug', header: 'نامک' },
          { key: 'plan', header: 'پلن' },
          { key: 'memberCount', header: 'اعضا' },
          { key: 'createdAt', header: 'تاریخ ایجاد', render: (row) => formatJalaliDate(row.createdAt) },
        ]}
        createFields={[
          { name: 'name', label: 'نام سازمان', required: true },
          { name: 'slug', label: 'نامک', required: true },
        ]}
      />
    </ProtectedLayout>
  );
}
