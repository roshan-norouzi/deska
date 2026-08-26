'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTenant } from '@/lib/tenant-context';
import { AppShell } from './app-shell';

interface ProtectedLayoutProps {
  children: ReactNode;
  title?: string;
  superAdminOnly?: boolean;
}

export function ProtectedLayout({ children, title, superAdminOnly }: ProtectedLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, isSuperAdmin } = useAuth();
  const { activeTenantId, isLoading: tenantLoading } = useTenant();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading || tenantLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (superAdminOnly && !isSuperAdmin) {
      router.replace('/dashboard');
      return;
    }

    if (!superAdminOnly && !activeTenantId) {
      router.replace('/settings');
      return;
    }

    setReady(true);
  }, [authLoading, tenantLoading, isAuthenticated, isSuperAdmin, activeTenantId, superAdminOnly, router]);

  if (authLoading || tenantLoading || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          <p className="text-sm text-slate-500">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return <AppShell title={title}>{children}</AppShell>;
}
