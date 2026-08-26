'use client';

import { useState } from 'react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/utils';
import { KeyRound, User } from 'lucide-react';

export default function SettingsAccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword.length < 8) {
      setError('رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تکرار رمز عبور با رمز جدید یکسان نیست');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        body: {
          currentPassword,
          newPassword,
        },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('رمز عبور با موفقیت تغییر کرد');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر رمز عبور');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedLayout title="حساب کاربری">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">حساب کاربری</h2>
          <p className="mt-1 text-sm text-slate-500">اطلاعات ورود و تغییر رمز عبور</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              اطلاعات کاربر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-slate-500">نام: </span>
              <span className="font-medium text-slate-900">{user?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">ایمیل: </span>
              <span dir="ltr" className="font-medium text-slate-900">
                {user?.email ?? '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              تغییر رمز عبور
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input
                label="رمز عبور فعلی"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Input
                label="رمز عبور جدید"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <Input
                label="تکرار رمز عبور جدید"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {message && <p className="text-sm text-green-600">{message}</p>}
              <Button type="submit" isLoading={saving}>
                ذخیره رمز جدید
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
