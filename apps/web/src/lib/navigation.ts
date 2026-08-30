import { LayoutDashboard, Users, FileText, Calendar, UserCheck, User, Building2, Settings, Puzzle, FolderKanban, Send, Rss, type LucideIcon } from 'lucide-react';
import { MODULE_DOMAINS } from '@deska/shared';

export interface NavItem { href: string; label: string; icon: LucideIcon; moduleId?: string; superAdminOnly?: boolean; }
export interface NavGroup { id: string; label: string; domain?: string; items: NavItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'داشبورد', items: [{ href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard }] },
  { id: 'core', label: 'هسته', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/contacts', label: 'مخاطبین', icon: Users, moduleId: 'contacts' },
    { href: '/documents', label: 'اسناد', icon: FileText, moduleId: 'documents' },
    { href: '/calendar', label: 'تقویم', icon: Calendar, moduleId: 'calendar' },
    { href: '/employees', label: 'کارمندان', icon: UserCheck, moduleId: 'employees' },
  ] },
  { id: 'projects', label: 'مدیریت پروژه و تسک', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/projects', label: 'پروژه‌ها', icon: FolderKanban, moduleId: 'projects-tasks' },
    { href: '/projects/tasks', label: 'تسک‌ها', icon: FolderKanban, moduleId: 'projects-tasks' },
  ] },
  { id: 'publishing', label: 'نشر هوشمند', domain: MODULE_DOMAINS.PRODUCTIVITY, items: [
    { href: '/publishing/feeds', label: 'فیدها', icon: Rss },
    { href: '/publishing/news', label: 'اتاق خبر', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/social', label: 'استودیوی اجتماعی', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/daily-report', label: 'دیلی‌ریپورت', icon: Send, moduleId: 'smart-publishing' },
    { href: '/publishing/settings', label: 'تنظیمات نشر هوشمند', icon: Send, moduleId: 'smart-publishing' },
  ] },
  { id: 'settings', label: 'تنظیمات', domain: MODULE_DOMAINS.PLATFORM, items: [
    { href: '/settings', label: 'تنظیمات سازمان', icon: Settings },
    { href: '/settings/account', label: 'حساب کاربری', icon: User },
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
