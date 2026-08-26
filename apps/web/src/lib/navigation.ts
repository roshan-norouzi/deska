import { LayoutDashboard, Users, FileText, Calendar, UserCheck, User, Briefcase, Building2, Settings, ShieldCheck, Puzzle, type LucideIcon } from 'lucide-react';
import { MODULE_DOMAINS } from '@deska/shared';

export interface NavItem { href: string; label: string; icon: LucideIcon; moduleId?: string; superAdminOnly?: boolean; }
export interface NavGroup { id: string; label: string; domain?: string; items: NavItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'داشبورد', items: [{ href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard }] },
  { id: 'core', label: 'هسته', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/contacts', label: 'مخاطبین', icon: Users, moduleId: 'contacts' },
    { href: '/documents', label: 'اسناد', icon: FileText, moduleId: 'documents' },
    { href: '/calendar', label: 'تقویم', icon: Calendar, moduleId: 'calendar' },
  ] },
  { id: 'hr', label: 'منابع انسانی', domain: MODULE_DOMAINS.HR, items: [
    { href: '/hr', label: 'داشبورد HR', icon: LayoutDashboard, moduleId: 'hr' },
    { href: '/hr/employees', label: 'کارمندان', icon: UserCheck, moduleId: 'hr' },
    { href: '/hr/departments', label: 'دپارتمان‌ها', icon: Building2, moduleId: 'hr' },
    { href: '/hr/recruitment', label: 'استخدام', icon: Briefcase, moduleId: 'hr' },
  ] },
  { id: 'settings', label: 'تنظیمات', domain: MODULE_DOMAINS.PLATFORM, items: [
    { href: '/settings', label: 'تنظیمات سازمان', icon: Settings },
    { href: '/settings/account', label: 'حساب کاربری', icon: User },
    { href: '/settings/roles', label: 'نقش‌ها', icon: ShieldCheck },
    { href: '/settings/modules', label: 'ماژول‌ها', icon: Puzzle },
    { href: '/settings/observances', label: 'مناسبت‌های تقویم', icon: Calendar, superAdminOnly: true },
    { href: '/platform', label: 'مدیریت پلتفرم', icon: Building2, superAdminOnly: true },
  ] },
];

export function filterNavGroups(enabledModules: string[] | null, isSuperAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (!item.moduleId || !enabledModules) return true;
    return enabledModules.includes(item.moduleId);
  }) })).filter((group) => group.items.length > 0);
}
