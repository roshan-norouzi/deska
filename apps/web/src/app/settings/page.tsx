'use client'

import { useState } from 'react'
import { ProtectedLayout } from '@/components/layout/protected-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/lib/tenant-context'
import { useApi } from '@/hooks/use-api'
import { apiFetch } from '@/lib/utils'

interface TenantDetail {
  id: string
  name: string
  slug: string
  plan: string
  locale: string
  _count?: {
    members: number
    modules: number
  }
}

function SettingsContent() {
  const { activeTenant, refreshCurrentTenant } = useTenant()
  const { data, isLoading, refetch } = useApi<TenantDetail>('/tenants/current')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const tenant = data ?? activeTenant

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant) return

    setSaving(true)
    setMessage(null)
    try {
      await apiFetch(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: { name },
      })
      setMessage('تنظیمات ذخیره شد')
      await refetch()
      await refreshCurrentTenant()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'خطا در ذخیره')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading && !tenant) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">تنظیمات سازمان</h2>
        <p className="mt-1 text-sm text-slate-500">مدیریت اطلاعات سازمان فعال</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات عمومی</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="نام سازمان"
              value={name || tenant?.name || ''}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="نامک" value={tenant?.slug ?? ''} disabled />
              <Input label="پلن" value={tenant?.plan ?? ''} disabled />
              <Input
                label="تعداد کارمندان"
                value={data?._count?.members != null ? String(data._count.members) : '—'}
                disabled
              />
            </div>
            {message && (
              <p className={`text-sm ${message.includes('خطا') ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </p>
            )}
            <Button type="submit" isLoading={saving}>
              ذخیره تغییرات
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ProtectedLayout title="تنظیمات">
      <SettingsContent />
    </ProtectedLayout>
  )
}
