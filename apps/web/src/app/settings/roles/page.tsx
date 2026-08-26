'use client';

import { ProtectedLayout } from '@/components/layout/protected-layout';
import { ResourceListPage } from '@/components/pages/resource-list-page';

interface RolePermission {
  permission: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  permissions?: RolePermission[];
}

export default function SettingsRolesPage() {
  return (
    <ProtectedLayout title="نقش‌ها">
      <ResourceListPage<Role>
        title="مدیریت نقش‌ها"
        description="تعریف نقش‌های سازمانی و دسترسی‌ها — مانند دپارتمان‌ها قابل ایجاد و ویرایش"
        apiPath="/roles"
        createLabel="نقش جدید"
        columns={[
          { key: 'name', header: 'نام' },
          { key: 'description', header: 'توضیحات', render: (row) => row.description ?? '—' },
          {
            key: 'isSystem',
            header: 'سیستمی',
            render: (row) => (row.isSystem ? 'بله' : 'خیر'),
          },
          {
            key: 'permissions',
            header: 'دسترسی‌ها',
            render: (row) => row.permissions?.length ?? 0,
          },
        ]}
        createFields={[
          { name: 'name', label: 'نام نقش', required: true },
          { name: 'description', label: 'توضیحات', type: 'textarea' },
        ]}
        editFields={[
          { name: 'name', label: 'نام نقش', required: true },
          { name: 'description', label: 'توضیحات', type: 'textarea' },
        ]}
        mapRowToForm={(row) => ({
          name: row.name ?? '',
          description: row.description ?? '',
        })}
        canDeleteRow={(row) => !row.isSystem}
      />
    </ProtectedLayout>
  );
}
