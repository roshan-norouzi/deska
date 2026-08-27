'use client';

import { useMemo, useState } from 'react';
import { Boxes } from 'lucide-react';
import { FINALIZED_MODULE_IDS, getCoreModuleSpec } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import type { TenantModuleRecord } from '@/lib/tenant-modules';

const FINALIZED_SET = new Set<string>(FINALIZED_MODULE_IDS);

interface InstalledModule {
  id: string;
  name: string;
  version: string;
  source: string;
  isCore: boolean;
  checksum?: string | null;
}

function ModulesContent() {
  const { data, isLoading, refetch } = useApi<TenantModuleRecord[]>('/modules/tenant');
  const { data: installed, refetch: refetchInstalled } = useApi<InstalledModule[]>('/modules/installed');
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [operation, setOperation] = useState<'install' | 'update'>('install');
  const [targetId, setTargetId] = useState('');
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [manifestText, setManifestText] = useState('');
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageMessage, setPackageMessage] = useState<string | null>(null);

  const modules = useMemo(() => {
    if (!data) return [];
    return data;
  }, [data]);

  const handleToggle = async (moduleId: string, current: boolean) => {
    setToggling(moduleId);
    setToggleError(null);
    try {
      await apiFetch(`/modules/${moduleId}/toggle`, {
        method: 'PATCH',
        body: { enabled: !current },
      });
      // فعال/غیرفعال شدن ماژول روی منوی اصلی و دسترسی‌های tenant اثر می‌گذارد؛
      // بنابراین بعد از ثبت موفق، کل صفحه را برای بارگذاری context جدید refresh می‌کنیم.
      window.location.reload();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'خطا در تغییر وضعیت ماژول');
    } finally {
      setToggling(null);
    }
  };

  const handlePackage = async () => {
    if (!packageFile || !manifestText.trim()) {
      setPackageMessage('فایل ZIP و manifest را انتخاب و وارد کنید.');
      return;
    }
    if (operation === 'update' && !targetId) {
      setPackageMessage('ماژول مقصد برای به‌روزرسانی را انتخاب کنید.');
      return;
    }
    setPackageBusy(true);
    setPackageMessage(null);
    try {
      const form = new FormData();
      form.append('package', packageFile);
      form.append('manifest', manifestText);
      await apiFetch(operation === 'install' ? '/modules/install' : `/modules/${targetId}/update`, {
        method: 'POST',
        body: form,
      });
      setPackageFile(null);
      setManifestText('');
      setPackageMessage(operation === 'install' ? 'ماژول با موفقیت نصب شد.' : 'ماژول با موفقیت به‌روزرسانی شد.');
      await Promise.all([refetchInstalled(), refetch()]);
    } catch (err) {
      setPackageMessage(err instanceof Error ? err.message : 'عملیات بسته ماژول ناموفق بود.');
    } finally {
      setPackageBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl shadow-slate-900/10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Boxes className="h-6 w-6" /></span><div><h2 className="text-2xl font-bold">ماژول‌ها</h2><p className="mt-2 text-sm text-slate-300">
          ماژول‌های موردنیاز سازمان را فعال کنید؛ ماژول‌های هسته همیشه فعال هستند
        </p></div></header>
        {toggleError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {toggleError}
          </p>
        )}
      <Card className="overflow-hidden border-primary-200 bg-primary-50/30 shadow-sm">
        <CardHeader className="border-b border-primary-100 bg-white/60">
          <CardTitle>مدیریت افزونه‌ها</CardTitle>
          <p className="text-sm leading-6 text-slate-500">
            بسته ZIP افزونه را به‌همراه manifest نسخه‌دار نصب یا به‌روزرسانی کنید. پس از نصب، برای بارگذاری routeهای جدید راه‌اندازی مجدد سرویس لازم است.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={operation === 'install' ? 'primary' : 'outline'} onClick={() => setOperation('install')}>
              نصب افزونه
            </Button>
            <Button size="sm" variant={operation === 'update' ? 'primary' : 'outline'} onClick={() => setOperation('update')}>
              به‌روزرسانی افزونه
            </Button>
          </div>
          {operation === 'update' && (
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm sm:max-w-sm"
            >
              <option value="">انتخاب افزونه نصب‌شده</option>
              {(installed ?? []).filter((module) => !module.isCore && module.source === 'plugin').map((module) => (
                <option key={module.id} value={module.id}>{module.name} — نسخه {module.version}</option>
              ))}
            </select>
          )}
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <label className="text-sm font-medium text-slate-700">
              فایل بسته ZIP
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => setPackageFile(event.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              manifest (JSON)
              <textarea
                value={manifestText}
                onChange={(event) => setManifestText(event.target.value)}
                rows={3}
                placeholder={'{"id":"my-module","name":"ماژول من","version":"1.0.0","domain":"productivity","dependencies":[],"permissions":[]}'}
                className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-left font-mono text-xs"
                dir="ltr"
              />
            </label>
            <Button isLoading={packageBusy} onClick={handlePackage}>
              {operation === 'install' ? 'نصب' : 'به‌روزرسانی'}
            </Button>
          </div>
          {packageMessage && <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{packageMessage}</p>}
        </CardContent>
      </Card>

      {(installed ?? []).some((module) => module.source === 'plugin') && (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle>افزونه‌های نصب‌شده</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(installed ?? []).filter((module) => module.source === 'plugin').map((module) => (
              <div key={module.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-slate-900">{module.name}</p><p className="mt-1 text-xs text-slate-500" dir="ltr">{module.id}</p></div>
                  <Badge variant="info">v{module.version}</Badge>
                </div>
                <p className="mt-3 text-xs text-slate-500">بسته ثبت‌شده و آماده فعال‌سازی سازمانی</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const spec = getCoreModuleSpec(mod.id);
          const dependencyText =
            mod.dependencyLabels && mod.dependencyLabels.length > 0
              ? mod.dependencyLabels.join('، ')
              : null;
          const isToggleDisabled = mod.enabled
            ? mod.canDisable === false
            : mod.canEnable === false;
          const disableReason = mod.enabled
            ? mod.blockingDependentLabels && mod.blockingDependentLabels.length > 0
              ? `ابتدا غیرفعال کنید: ${mod.blockingDependentLabels.join('، ')}`
              : null
            : mod.missingDependencyLabels && mod.missingDependencyLabels.length > 0
              ? `ابتدا فعال کنید: ${mod.missingDependencyLabels.join('، ')}`
              : null;

          return (
            <Card
              key={mod.id}
              className={
                mod.enabled
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-slate-200 bg-slate-50/80'
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{mod.name}</CardTitle>
                  <Badge variant={mod.enabled ? 'success' : 'default'}>
                    {mod.enabled ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {mod.domainLabel && (
                  <p className="mb-1 text-xs text-slate-400">{mod.domainLabel}</p>
                )}
                {spec?.description && (
                  <p className="mb-2 text-sm text-slate-600">{spec.description}</p>
                )}
                {dependencyText && (
                  <p className="mb-3 text-xs text-slate-500">وابستگی: {dependencyText}</p>
                )}
                {mod.isCore ? (
                  <p className="text-xs text-primary-600">ماژول هسته — همیشه فعال</p>
                ) : (
                  <>
                    {disableReason && (
                      <p className="mb-2 text-xs text-amber-700">{disableReason}</p>
                    )}
                    <Button
                      size="sm"
                      variant={mod.enabled ? 'outline' : 'primary'}
                      isLoading={toggling === mod.id}
                      disabled={isToggleDisabled}
                      title={disableReason ?? undefined}
                      onClick={() => handleToggle(mod.id, mod.enabled)}
                    >
                      {mod.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsModulesPage() {
  return (
    <ProtectedLayout title="ماژول‌ها">
      <ModulesContent />
    </ProtectedLayout>
  );
}
