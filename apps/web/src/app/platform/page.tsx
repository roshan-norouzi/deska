'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Crown, Search, Users } from 'lucide-react';
import { PLATFORM_ROLES, TENANT_ROLE_LABELS, type TenantRole } from '@deska/shared';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/utils';

type Membership = { role: string; status: string; tenant: { id: string; name: string; primaryOwnerUserId?: string | null } };
type PlatformUser = { id: string; name: string; email: string; role: string; status: string; tenantMembers: Membership[] };
type Organization = { id: string; name: string; slug: string; status: string; primaryOwner?: { id: string; name: string } | null; _count: { members: number } };
type ListResult<T> = { items: T[]; total: number };
type Overview = { users: number; activeUsers: number; organizations: number; activeOrganizations: number; memberships: number };
type OrganizationDetail = Organization & { members: Array<{ userId: string; role: string; status: string; user: { name: string; email: string } }> };

export default function PlatformPage() {
  const [tab, setTab] = useState<'users' | 'organizations'>('users');
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<Overview>();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [detail, setDetail] = useState<OrganizationDetail>();
  const [targetOwner, setTargetOwner] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const [summary, result] = await Promise.all([
        apiFetch<Overview>('/platform/overview', { skipTenant: true }),
        tab === 'users'
          ? apiFetch<ListResult<PlatformUser>>(`/platform/users${suffix}`, { skipTenant: true })
          : apiFetch<ListResult<Organization>>(`/platform/organizations${suffix}`, { skipTenant: true }),
      ]);
      setOverview(summary);
      if (tab === 'users') setUsers((result as ListResult<PlatformUser>).items);
      else setOrganizations((result as ListResult<Organization>).items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'دریافت اطلاعات انجام نشد'); }
    finally { setLoading(false); }
  }, [query, tab]);

  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);

  const patchUser = async (id: string, field: 'role' | 'status', value: string) => {
    await apiFetch(`/platform/users/${id}/${field}`, { method: 'PATCH', body: { [field]: value }, skipTenant: true });
    await load();
  };
  const patchOrganization = async (id: string, status: string) => {
    await apiFetch(`/platform/organizations/${id}/status`, { method: 'PATCH', body: { status }, skipTenant: true });
    await load();
  };
  const openOrganization = async (id: string) => {
    const result = await apiFetch<OrganizationDetail>(`/platform/organizations/${id}`, { skipTenant: true });
    setDetail(result); setTargetOwner(result.primaryOwner?.id ?? '');
  };
  const transferOwnership = async () => {
    if (!detail || !targetOwner) return;
    await apiFetch(`/platform/organizations/${detail.id}/transfer-ownership`, { method: 'POST', body: { targetUserId: targetOwner }, skipTenant: true });
    await openOrganization(detail.id); await load();
  };

  return <ProtectedLayout title="مدیریت پلتفرم" platformAdminOnly tenantRequired={false}>
    <main className="mx-auto max-w-7xl space-y-5" dir="rtl">
      <section className="rounded-3xl bg-slate-950 p-6 text-white"><h1 className="text-2xl font-bold">مدیریت پلتفرم</h1><p className="mt-2 text-sm text-slate-300">کاربران مستقل، عضویت‌های سازمانی، سازمان‌ها و مالکیت‌ها</p></section>
      {overview && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['کل کاربران', overview.users], ['کاربران فعال', overview.activeUsers], ['کل سازمان‌ها', overview.organizations], ['سازمان‌های فعال', overview.activeOrganizations], ['عضویت‌ها', overview.memberships]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>)}</div>}
      <Card><CardHeader><div className="flex flex-wrap justify-between gap-3"><div className="flex gap-2"><Button variant={tab === 'users' ? 'primary' : 'outline'} onClick={() => setTab('users')}><Users className="h-4 w-4" />کاربران</Button><Button variant={tab === 'organizations' ? 'primary' : 'outline'} onClick={() => setTab('organizations')}><Building2 className="h-4 w-4" />سازمان‌ها</Button></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input className="pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو..." /></div></div></CardHeader><CardContent>
        {error && <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="py-12 text-center text-slate-500">در حال دریافت...</div> : tab === 'users' ? <div className="space-y-3">{users.map((user) => <article key={user.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{user.name}</h2><p className="text-sm text-slate-500" dir="ltr">{user.email}</p><div className="mt-2 flex flex-wrap gap-1">{user.tenantMembers.map((membership) => <Badge key={membership.tenant.id} variant={membership.tenant.primaryOwnerUserId === user.id ? 'warning' : 'default'}>{membership.tenant.primaryOwnerUserId === user.id && <Crown className="ml-1 h-3 w-3" />}{membership.tenant.name} · {TENANT_ROLE_LABELS[membership.role as TenantRole] ?? membership.role}</Badge>)}</div></div><select value={user.role} aria-label="نقش پلتفرم" onChange={(e) => void patchUser(user.id, 'role', e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value={PLATFORM_ROLES.USER}>کاربر</option><option value={PLATFORM_ROLES.ADMIN}>مدیر پلتفرم</option><option value={PLATFORM_ROLES.SUPER_ADMIN}>مدیر کل</option></select><StatusSelect value={user.status} onChange={(value) => void patchUser(user.id, 'status', value)} kind="user" /></div></article>)}</div>
        : <div className="space-y-3">{organizations.map((organization) => <article key={organization.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{organization.name}</h2><p className="text-sm text-slate-500"><span dir="ltr">{organization.slug}</span> · {organization._count.members} عضو · مالک: {organization.primaryOwner?.name ?? 'تعیین نشده'}</p></div><StatusSelect value={organization.status} onChange={(value) => void patchOrganization(organization.id, value)} kind="organization" /><Button variant="outline" onClick={() => void openOrganization(organization.id)}>اعضا و مالکیت</Button></div></article>)}</div>}
      </CardContent></Card>
      {detail && <Card><CardHeader><CardTitle>مالکیت {detail.name}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><label className="min-w-72 flex-1 text-sm">مالک اصلی<select value={targetOwner} onChange={(e) => setTargetOwner(e.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5">{detail.members.filter((member) => member.status === 'active').map((member) => <option key={member.userId} value={member.userId}>{member.user.name} — {member.user.email}</option>)}</select></label><Button disabled={!targetOwner || targetOwner === detail.primaryOwner?.id} onClick={() => void transferOwnership()}><Crown className="h-4 w-4" />انتقال مالکیت</Button><Button variant="ghost" onClick={() => setDetail(undefined)}>بستن</Button></CardContent></Card>}
    </main>
  </ProtectedLayout>;
}

function StatusSelect({ value, onChange, kind }: { value: string; onChange: (value: string) => void; kind: 'user' | 'organization' }) {
  return <select value={value} aria-label="وضعیت" onChange={(e) => onChange(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option value="active">فعال</option><option value="inactive">غیرفعال</option>{kind === 'user' ? <option value="blocked">مسدود</option> : <option value="suspended">تعلیق</option>}<option value="pending">در انتظار</option></select>;
}
