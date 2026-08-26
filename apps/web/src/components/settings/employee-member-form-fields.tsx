'use client'

import {
  EMPLOYEE_STATUS,
  IRAN_BANKS,
  MARITAL_STATUS,
  MARITAL_STATUS_LABELS,
  ORGANIZATIONAL_ROLES,
  STATUS_LABELS,
  TENANT_ROLE_LABELS,
  TENANT_ROLES,
  pickProvidedProfileFields,
  type EmployeeProfileField,
} from '@deska/shared'
import { Input } from '@/components/ui/input'
import { JalaliDateInput } from '@/components/ui/jalali-date-input'
import {
  blockNonPersianNameKey,
  CardDigitsInput,
  DigitsInput,
  IbanInput,
} from '@/components/ui/masked-input'

export interface EmployeeMemberFormState {
  firstName: string
  lastName: string
  nationalId: string
  fatherName: string
  motherName: string
  birthCertificateNumber: string
  birthCertificateDate: string
  birthDate: string
  maritalStatus: string
  address: string
  postalCode: string
  mobilePhone: string
  landlinePhone: string
  bankAccountNumber: string
  bankCardNumber: string
  iban: string
  bankName: string
  insuranceNumber: string
  email: string
  role: string
  employeeCode: string
  jobTitle: string
  departmentId: string
  status: string
  hireDate: string
  password: string
}

interface DepartmentOption {
  id: string
  name: string
}

interface EmployeeMemberFormFieldsProps {
  formState: EmployeeMemberFormState
  setFormState: React.Dispatch<React.SetStateAction<EmployeeMemberFormState | null>>
  mode: 'add' | 'edit'
  isOwner: boolean
  departments: DepartmentOption[]
  fieldErrors: Partial<
    Record<EmployeeProfileField | 'email' | 'password' | 'employeeCode', string>
  >
}

const EMPLOYEE_STATUS_OPTIONS = Object.values(EMPLOYEE_STATUS)

const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: STATUS_LABELS.active ?? 'فعال',
  inactive: STATUS_LABELS.inactive ?? 'غیرفعال',
  terminated: 'پایان همکاری',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">{children}</h4>
  )
}

function SelectField({
  label,
  value,
  onChange,
  error,
  required,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
          error ? 'border-red-500' : 'border-slate-300'
        }`}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function EmployeeMemberFormFields({
  formState,
  setFormState,
  mode,
  isOwner,
  departments,
  fieldErrors,
}: EmployeeMemberFormFieldsProps) {
  const set = <K extends keyof EmployeeMemberFormState>(key: K, value: EmployeeMemberFormState[K]) => {
    setFormState((s) => s && { ...s, [key]: value })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <SectionTitle>مشخصات هویتی</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="نام"
            value={formState.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            onKeyDown={blockNonPersianNameKey}
            error={fieldErrors.firstName}
          />
          <Input
            label="نام خانوادگی"
            value={formState.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            onKeyDown={blockNonPersianNameKey}
            error={fieldErrors.lastName}
          />
          <DigitsInput
            label="کد ملی"
            value={formState.nationalId}
            onValueChange={(v) => set('nationalId', v)}
            error={fieldErrors.nationalId}
            maxDigits={10}
            dir="ltr"
            className="text-left tracking-widest"
            placeholder="0012345678"
          />
          <DigitsInput
            label="شماره شناسنامه"
            value={formState.birthCertificateNumber}
            onValueChange={(v) => set('birthCertificateNumber', v)}
            error={fieldErrors.birthCertificateNumber}
            maxDigits={20}
            dir="ltr"
            className="text-left"
          />
          <Input
            label="نام پدر"
            value={formState.fatherName}
            onChange={(e) => set('fatherName', e.target.value)}
            onKeyDown={blockNonPersianNameKey}
            error={fieldErrors.fatherName}
          />
          <Input
            label="نام مادر"
            value={formState.motherName}
            onChange={(e) => set('motherName', e.target.value)}
            onKeyDown={blockNonPersianNameKey}
            error={fieldErrors.motherName}
          />
          <JalaliDateInput
            label="تاریخ تولد شناسنامه"
            value={formState.birthCertificateDate}
            onChange={(e) => set('birthCertificateDate', e.target.value)}
            error={fieldErrors.birthCertificateDate}
          />
          <JalaliDateInput
            label="تاریخ تولد واقعی"
            value={formState.birthDate}
            onChange={(e) => set('birthDate', e.target.value)}
            error={fieldErrors.birthDate}
          />
          <SelectField
            label="وضعیت تأهل"
            value={formState.maritalStatus}
            onChange={(v) => set('maritalStatus', v)}
            error={fieldErrors.maritalStatus}
          >
            <option value="">انتخاب کنید</option>
            <option value={MARITAL_STATUS.MARRIED}>{MARITAL_STATUS_LABELS.married}</option>
            <option value={MARITAL_STATUS.SINGLE}>{MARITAL_STATUS_LABELS.single}</option>
          </SelectField>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>تماس و آدرس</SectionTitle>
        <Input
          label="آدرس"
          value={formState.address}
          onChange={(e) => set('address', e.target.value)}
          error={fieldErrors.address}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DigitsInput
            label="کد پستی"
            value={formState.postalCode}
            onValueChange={(v) => set('postalCode', v)}
            error={fieldErrors.postalCode}
            maxDigits={10}
            dir="ltr"
            className="text-left tracking-widest"
            placeholder="1234567890"
          />
          <DigitsInput
            label="تلفن همراه"
            value={formState.mobilePhone}
            onValueChange={(v) => set('mobilePhone', v)}
            error={fieldErrors.mobilePhone}
            maxDigits={11}
            dir="ltr"
            className="text-left"
            placeholder="09121234567"
          />
          <DigitsInput
            label="تلفن ثابت"
            value={formState.landlinePhone}
            onValueChange={(v) => set('landlinePhone', v)}
            error={fieldErrors.landlinePhone}
            maxDigits={11}
            dir="ltr"
            className="text-left"
            placeholder="02112345678"
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>اطلاعات بانکی</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="بانک"
            value={formState.bankName}
            onChange={(v) => set('bankName', v)}
            error={fieldErrors.bankName}
          >
            <option value="">انتخاب بانک</option>
            {IRAN_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
            {formState.bankName && !IRAN_BANKS.includes(formState.bankName as (typeof IRAN_BANKS)[number]) && (
              <option value={formState.bankName}>{formState.bankName}</option>
            )}
          </SelectField>
          <DigitsInput
            label="شماره سپرده"
            value={formState.bankAccountNumber}
            onValueChange={(v) => set('bankAccountNumber', v)}
            error={fieldErrors.bankAccountNumber}
            maxDigits={20}
            dir="ltr"
            className="text-left"
          />
          <CardDigitsInput
            label="شماره کارت"
            value={formState.bankCardNumber}
            onValueChange={(v) => set('bankCardNumber', v)}
            error={fieldErrors.bankCardNumber}
            maxDigits={16}
            className="text-left tracking-widest"
            placeholder="6037991234567890"
          />
          <IbanInput
            label="شماره شبا"
            value={formState.iban}
            onValueChange={(v) => set('iban', v)}
            error={fieldErrors.iban}
            placeholder="IR120170000000123456789012"
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>بیمه و استخدام</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <DigitsInput
            label="شماره بیمه"
            value={formState.insuranceNumber}
            onValueChange={(v) => set('insuranceNumber', v)}
            error={fieldErrors.insuranceNumber}
            maxDigits={16}
            dir="ltr"
            className="text-left"
          />
          <Input
            label="کد پرسنلی"
            value={formState.employeeCode}
            onChange={(e) => set('employeeCode', e.target.value)}
            error={fieldErrors.employeeCode}
            placeholder="در صورت خالی بودن، خودکار تولید می‌شود"
          />
          <Input
            label="سمت"
            value={formState.jobTitle}
            onChange={(e) => set('jobTitle', e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>حساب کاربری و سازمان</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="ایمیل"
            type="email"
            value={formState.email}
            onChange={(e) => set('email', e.target.value)}
            error={fieldErrors.email}
            dir="ltr"
            className="text-left"
            required={mode === 'add'}
          />
          <Input
            label={mode === 'add' ? 'رمز عبور' : 'رمز عبور جدید (اختیاری)'}
            type="password"
            value={formState.password}
            onChange={(e) => set('password', e.target.value)}
            error={fieldErrors.password}
            placeholder="حداقل ۸ کاراکتر"
            minLength={8}
            required={mode === 'add'}
            autoComplete={mode === 'add' ? 'new-password' : 'off'}
          />
        </div>

        {!isOwner && (
          <SelectField
            label="نقش سازمانی"
            value={formState.role}
            onChange={(v) => set('role', v)}
          >
            {ORGANIZATIONAL_ROLES.map((role) => (
              <option key={role} value={role}>
                {TENANT_ROLE_LABELS[role]}
              </option>
            ))}
          </SelectField>
        )}

        {departments.length > 0 && (
          <SelectField
            label="واحد"
            value={formState.departmentId}
            onChange={(v) => set('departmentId', v)}
          >
            <option value="">بدون واحد</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="وضعیت همکاری"
            value={formState.status}
            onChange={(v) => set('status', v)}
          >
            {EMPLOYEE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {EMPLOYEE_STATUS_LABELS[status] ?? status}
              </option>
            ))}
          </SelectField>
          <JalaliDateInput
            label="تاریخ استخدام"
            value={formState.hireDate}
            onChange={(e) => set('hireDate', e.target.value)}
          />
        </div>
      </section>
    </div>
  )
}

export function buildProfilePayload(form: EmployeeMemberFormState) {
  return pickProvidedProfileFields({
    firstName: form.firstName,
    lastName: form.lastName,
    nationalId: form.nationalId,
    fatherName: form.fatherName,
    motherName: form.motherName,
    birthCertificateNumber: form.birthCertificateNumber,
    birthCertificateDate: form.birthCertificateDate,
    birthDate: form.birthDate,
    maritalStatus: form.maritalStatus,
    address: form.address,
    postalCode: form.postalCode,
    mobilePhone: form.mobilePhone,
    landlinePhone: form.landlinePhone,
    bankAccountNumber: form.bankAccountNumber,
    bankCardNumber: form.bankCardNumber,
    iban: form.iban,
    bankName: form.bankName,
    insuranceNumber: form.insuranceNumber,
  })
}
