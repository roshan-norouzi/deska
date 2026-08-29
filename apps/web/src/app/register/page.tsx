'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { PLATFORM_NAME } from '@deska/shared';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const MOBILE_PATTERN = /^09\d{9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/organizations');
  }, [isAuthenticated, isLoading, router]);

  const passwordChecks = useMemo(() => [
    { label: 'حداقل ۱۲ نویسه', valid: password.length >= 12 },
    { label: 'شامل حرف و عدد', valid: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { label: 'تکرار رمز یکسان است', valid: Boolean(password) && password === confirmation },
  ], [password, confirmation]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mobile && !MOBILE_PATTERN.test(mobile)) {
      setError('شماره موبایل باید با ۰۹ آغاز شود و ۱۱ رقم داشته باشد.');
      return;
    }
    if (!passwordChecks.every((item) => item.valid)) {
      setError('رمز عبور شرایط لازم را ندارد یا تکرار آن یکسان نیست.');
      return;
    }
    if (!accepted) {
      setError('برای ثبت‌نام باید قوانین و حریم خصوصی را بپذیرید.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: name.trim(), email: email.trim(), phone: mobile || undefined,
        password, confirmPassword: confirmation, acceptTerms: accepted,
      });
      router.replace('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت‌نام انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /></div>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-bl from-primary-50 via-white to-slate-100 p-4 py-10" dir="rtl">
      <Card className="mx-auto w-full max-w-xl overflow-hidden">
        <CardHeader className="bg-slate-950 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold">د</div>
          <CardTitle className="text-2xl text-white">ساخت حساب در {PLATFORM_NAME}</CardTitle>
          <CardDescription className="text-slate-300">حساب شما مستقل از سازمان است؛ پس از ثبت‌نام می‌توانید سازمان بسازید یا به یک سازمان بپیوندید.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="نام و نام خانوادگی" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="ایمیل" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="user@example.com" />
              <Input label="موبایل (اختیاری)" type="tel" dir="ltr" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 11))} autoComplete="tel" placeholder="09123456789" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="رمز عبور" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" />
              <Input label="تکرار رمز عبور" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" />
            </div>
            <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
              {passwordChecks.map((item) => (
                <span key={item.label} className={`flex items-center gap-1.5 text-xs ${item.valid ? 'text-emerald-700' : 'text-slate-500'}`}>
                  <CheckCircle2 className="h-4 w-4" />{item.label}
                </span>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-6 text-slate-600">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-primary-600" />
              <span>قوانین استفاده و سیاست حریم خصوصی دسکا را مطالعه کرده‌ام و می‌پذیرم.</span>
            </label>
            {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
              <ShieldCheck className="h-5 w-5" /> ثبت‌نام و ادامه
            </Button>
            <p className="text-center text-sm text-slate-500">قبلاً ثبت‌نام کرده‌اید؟ <Link href="/login" className="font-semibold text-primary-700">ورود به حساب</Link></p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
