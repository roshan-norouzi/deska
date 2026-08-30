'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, KeyRound, ShieldCheck, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, withBasePath } from '@/lib/utils';
import { EmployeeProfileSettings, type EmployeeProfileData } from '@/components/settings/employee-profile-settings';

interface ProfileUpdateResult {
  user: { id: string; name: string; email: string; phone?: string | null; avatarUrl?: string | null };
  requiresReauthentication: boolean;
}

interface EmployeeProfileResponse {
  tenant: { id: string; name: string };
  employee: EmployeeProfileData;
}

export default function SettingsAccountPage() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileResponse[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
    setAvatarUrl(user.avatarUrl ?? '');
    setProfilesLoading(true);
    void apiFetch<EmployeeProfileResponse[]>('/auth/employee-profiles', { skipTenant: true })
      .then((profiles) => setEmployeeProfiles(Array.isArray(profiles) ? profiles : []))
      .catch(() => setEmployeeProfiles([]))
      .finally(() => setProfilesLoading(false));
  }, [user]);

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null); setMessage(null); setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<{ avatarUrl: string }>('/auth/profile/avatar', { method: 'POST', skipTenant: true, body: formData });
      setAvatarUrl(result.avatarUrl);
      await refresh();
      setMessage('تصویر پروفایل با موفقیت بارگذاری شد');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در بارگذاری تصویر پروفایل');
    } finally { setAvatarUploading(false); }
  }

  const avatarPreview = avatarUrl
    ? avatarUrl.startsWith('/') ? withBasePath(`/api${avatarUrl}`) : avatarUrl
    : null;

  async function handleProfileSave(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (name.trim().length < 2) {
      setError('نام باید حداقل ۲ کاراکتر باشد');
      return;
    }
    const emailChanged = email.trim().toLowerCase() !== user?.email.toLowerCase();
    if (emailChanged && !profilePassword) {
      setError('برای تغییر ایمیل، رمز عبور فعلی را وارد کنید');
      return;
    }

    setSavingProfile(true);
    try {
      const result = await apiFetch<ProfileUpdateResult>('/auth/profile', {
        method: 'PATCH',
        skipTenant: true,
        body: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          ...(emailChanged ? { currentPassword: profilePassword } : {}),
        },
      });
      setProfilePassword('');
      if (result.requiresReauthentication) {
        await logout();
        router.replace('/login?reason=email-changed');
        return;
      }
      await refresh();
      setMessage('اطلاعات حساب با موفقیت ذخیره شد');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در ذخیره اطلاعات حساب');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword.length < 12) {
      setError('رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست');
      return;
    }

    setSavingPassword(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        skipTenant: true,
        body: { currentPassword, newPassword },
      });
      await logout();
      router.replace('/login?reason=password-changed');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'خطا در تغییر رمز عبور');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <ProtectedLayout title="حساب کاربری" tenantRequired={false}>
      <div className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
        <header className="flex items-start gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl shadow-slate-900/10">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><ShieldCheck className="h-6 w-6" /></span>
          <div><h2 className="text-2xl font-bold">حساب کاربری</h2><p className="mt-2 text-sm text-slate-300">اطلاعات شخصی، راه‌های ارتباطی و امنیت حساب خود را مدیریت کنید.</p></div>
        </header>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />اطلاعات کاربر</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="نام و نام خانوادگی" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
                <Input label="ایمیل" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
                <Input label="شماره موبایل" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912... یا +98912..." autoComplete="tel" />
              </div>
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {avatarPreview ? <img src={avatarPreview} alt="تصویر پروفایل" className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-200 text-slate-500"><User className="h-7 w-7" /></div>}
                <div className="flex-1"><p className="text-sm font-medium text-slate-800">تصویر پروفایل</p><p className="mt-1 text-xs text-slate-500">JPG، PNG یا WebP؛ حداکثر ۵ مگابایت</p></div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                <Button type="button" variant="outline" isLoading={avatarUploading} onClick={() => avatarInputRef.current?.click()}>بارگذاری تصویر</Button>
              </div>
              {email.trim().toLowerCase() !== user?.email.toLowerCase() && (
                <Input label="رمز فعلی برای تأیید تغییر ایمیل" type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} required autoComplete="current-password" />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {message && <p className="text-sm text-green-600">{message}</p>}
              <Button type="submit" isLoading={savingProfile}>ذخیره اطلاعات حساب</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/70"><div><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />سازمان‌های من</CardTitle><p className="mt-1 text-xs text-slate-500">اطلاعات پرسنلی هر سازمان را جداگانه تکمیل کنید.</p></div><Link href="/organizations"><Button type="button" variant="outline" size="sm">افزودن سازمان جدید</Button></Link></CardHeader>
          <CardContent className="space-y-5">
            {profilesLoading ? <div className="py-6 text-center text-sm text-slate-500">در حال دریافت پروفایل‌های پرسنلی...</div> : employeeProfiles.length === 0 ? <p className="text-sm text-slate-500">هنوز در سازمانی عضو نیستید.</p> : employeeProfiles.map((profile) => <EmployeeProfileSettings key={profile.employee.id} tenant={profile.tenant} employee={profile.employee} />)}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />تغییر رمز عبور</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input label="رمز عبور فعلی" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
              <Input label="رمز عبور جدید" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
              <Input label="تکرار رمز عبور جدید" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} autoComplete="new-password" />
              <p className="text-xs text-slate-500">پس از تغییر رمز، همه نشست‌ها بسته می‌شوند و باید دوباره وارد شوید.</p>
              <Button type="submit" isLoading={savingPassword}>تغییر رمز و خروج از همه نشست‌ها</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
