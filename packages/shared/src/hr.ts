import { formatEmployeeFullName } from './employee-profile';

export const JOB_OPENING_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  ON_HOLD: 'on_hold',
} as const;

export const APPLICANT_STATUS = {
  NEW: 'new',
  SCREENING: 'screening',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  HIRED: 'hired',
  REJECTED: 'rejected',
} as const;

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  terminated: 'قطع همکاری',
};

export const JOB_OPENING_STATUS_LABELS: Record<string, string> = {
  open: 'باز',
  closed: 'بسته',
  on_hold: 'معلق',
};

export const APPLICANT_STATUS_LABELS: Record<string, string> = {
  new: 'جدید',
  screening: 'غربالگری',
  interview: 'مصاحبه',
  offer: 'پیشنهاد',
  hired: 'استخدام شده',
  rejected: 'رد شده',
};

export interface EmployeeDisplaySource {
  employeeCode?: string | null;
  jobTitle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  contact?: { name?: string | null; email?: string | null } | null;
}

export function formatEmployeeLabel(employee: EmployeeDisplaySource | null | undefined): string {
  if (!employee) return '—';
  const profileName = formatEmployeeFullName({
    firstName: employee.firstName,
    lastName: employee.lastName,
  });
  if (profileName) return profileName;
  const name =
    employee.user?.name?.trim() ||
    employee.contact?.name?.trim() ||
    employee.user?.email?.trim() ||
    employee.contact?.email?.trim();
  if (name && employee.employeeCode) {
    return `${name} (${employee.employeeCode})`;
  }
  if (name) return name;
  if (employee.employeeCode) return employee.employeeCode;
  if (employee.jobTitle) return employee.jobTitle;
  return '—';
}

