'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, User } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/utils';

interface ProfileUpdateResult {
  user: { id: string; name: string; email: string; phone?: string | null; avatarUrl?: string | null };
  requiresReauthentication: boolean;
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

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    setPhone(user.phone ?? '');
    setAvatarUrl(user.avatarUrl ?? '');
  }, [user]);

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
                <Input label="آدرس HTTPS تصویر پروفایل" dir="ltr" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
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
