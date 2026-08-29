'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import {
  EMPLOYEE_STATUS,
  STATUS_LABELS,
  TENANT_ROLE_LABELS,
  TENANT_ROLES,
  formatEmployeeFullName,
  splitPersianFullName,
  validateEmployeeProfile,
} from '@deska/shared'
import {
  EmployeeMemberFormFields,
  buildProfilePayload,
  type EmployeeMemberFormState,
} from '@/components/settings/employee-member-form-fields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/lib/auth-context'
import { apiFetch } from '@/lib/utils'

interface MemberUser {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  isActive: boolean
}

interface EmployeeInfo {
  id: string
  employeeCode: string
  jobTitle?: string | null
  status: string
  hireDate?: string | null
  firstName?: string | null
  lastName?: string | null
  nationalId?: string | null
  fatherName?: string | null
  motherName?: string | null
  birthCertificateNumber?: string | null
  birthCertificateDate?: string | null
  birthDate?: string | null
  maritalStatus?: string | null
  address?: string | null
  postalCode?: string | null
  mobilePhone?: string | null
  landlinePhone?: string | null
  bankAccountNumber?: string | null
  bankCardNumber?: string | null
  iban?: string | null
  bankName?: string | null
  insuranceNumber?: string | null
  department?: { id: string; name: string } | null
}

export interface OrganizationMember {
  userId: string
  role: string
  joinedAt: string
  user: MemberUser
  employee: EmployeeInfo | null
}

interface DepartmentOption {
  id: string
  name: string
}

interface OrganizationInvitation {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt: string
}

interface OrganizationEmployeesPanelProps {
  tenantId: string | null
  memberRole?: string | null
  showCard?: boolean
}

type MemberModalMode = 'add' | 'edit'

const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: STATUS_LABELS.active ?? 'فعال',
  inactive: STATUS_LABELS.inactive ?? 'غیرفعال',
  terminated: 'پایان همکاری',
}

const EMPTY_FORM: EmployeeMemberFormState = {
  firstName: '',
  lastName: '',
  nationalId: '',
  fatherName: '',
  motherName: '',
  birthCertificateNumber: '',
  birthCertificateDate: '',
  birthDate: '',
  maritalStatus: '',
  address: '',
  postalCode: '',
  mobilePhone: '',
  landlinePhone: '',
  bankAccountNumber: '',
  bankCardNumber: '',
  iban: '',
  bankName: '',
  insuranceNumber: '',
  email: '',
  role: TENANT_ROLES.MEMBER,
  employeeCode: '',
  jobTitle: '',
  departmentId: '',
  status: EMPLOYEE_STATUS.ACTIVE,
  hireDate: '',
  password: '',
}

function roleBadgeVariant(role: string): 'default' | 'success' | 'warning' | 'info' {
  if (role === TENANT_ROLES.OWNER) return 'success'
  if (role === TENANT_ROLES.ADMIN) return 'info'
  if (role === TENANT_ROLES.MANAGER) return 'warning'
  return 'default'
}

function employeeStatusBadgeVariant(status: string): 'success' | 'danger' | 'warning' | 'default' {
  if (status === EMPLOYEE_STATUS.ACTIVE) return 'success'
  if (status === EMPLOYEE_STATUS.TERMINATED) return 'danger'
  return 'default'
}

function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function memberDisplayName(member: OrganizationMember): string {
  const fromEmployee = member.employee
    ? formatEmployeeFullName({
        firstName: member.employee.firstName,
        lastName: member.employee.lastName,
      })
    : null
  return fromEmployee ?? member.user.name ?? '—'
}

function buildFormState(member: OrganizationMember): EmployeeMemberFormState {
  const nameFallback = splitPersianFullName(member.user.name ?? '')
  const emp = member.employee

  return {
    firstName: emp?.firstName ?? nameFallback.firstName,
    lastName: emp?.lastName ?? nameFallback.lastName,
    nationalId: emp?.nationalId ?? '',
    fatherName: emp?.fatherName ?? '',
    motherName: emp?.motherName ?? '',
    birthCertificateNumber: emp?.birthCertificateNumber ?? '',
    birthCertificateDate: toDateInputValue(emp?.birthCertificateDate),
    birthDate: toDateInputValue(emp?.birthDate),
    maritalStatus: emp?.maritalStatus ?? '',
    address: emp?.address ?? '',
    postalCode: emp?.postalCode ?? '',
    mobilePhone: emp?.mobilePhone ?? '',
    landlinePhone: emp?.landlinePhone ?? '',
    bankAccountNumber: emp?.bankAccountNumber ?? '',
    bankCardNumber: emp?.bankCardNumber ?? '',
    iban: emp?.iban ?? '',
    bankName: emp?.bankName ?? '',
    insuranceNumber: emp?.insuranceNumber ?? '',
    email: member.user.email ?? '',
    role: member.role,
    employeeCode: emp?.employeeCode ?? '',
    jobTitle: emp?.jobTitle ?? '',
    departmentId: emp?.department?.id ?? '',
    status: emp?.status ?? EMPLOYEE_STATUS.ACTIVE,
    hireDate: toDateInputValue(emp?.hireDate),
    password: '',
  }
}

export function OrganizationEmployeesPanel({
  tenantId,
  memberRole,
  showCard = true,
}: OrganizationEmployeesPanelProps) {
  const { user: currentUser } = useAuth()
  const membersPath = tenantId ? `/tenants/${tenantId}/members` : null
  const departmentsPath =
    tenantId && (memberRole === TENANT_ROLES.OWNER || memberRole === TENANT_ROLES.ADMIN)
      ? `/tenants/${tenantId}/departments`
      : null
  const invitationsPath = tenantId && (memberRole === TENANT_ROLES.OWNER || memberRole === TENANT_ROLES.ADMIN)
    ? `/tenants/${tenantId}/invitations`
    : null

  const { data, isLoading, error, refetch } = useApi<OrganizationMember[]>(membersPath)
  const { data: departmentsData } = useApi<DepartmentOption[]>(departmentsPath)
  const { data: invitationData, refetch: refetchInvitations } = useApi<OrganizationInvitation[]>(invitationsPath)

  const [modalMode, setModalMode] = useState<MemberModalMode | null>(null)
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null)
  const [formState, setFormState] = useState<EmployeeMemberFormState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  const members = Array.isArray(data) ? data : []
  const departments = Array.isArray(departmentsData) ? departmentsData : []
  const invitations = Array.isArray(invitationData) ? invitationData : []
  const canManage = memberRole === TENANT_ROLES.OWNER || memberRole === TENANT_ROLES.ADMIN

  useEffect(() => {
    if (modalMode === 'edit' && editingMember) {
      setFormState(buildFormState(editingMember))
      setFieldErrors({})
      setSaveError(null)
    }
    if (modalMode === 'add') {
      setFormState({ ...EMPTY_FORM })
      setFieldErrors({})
      setSaveError(null)
    }
  }, [modalMode, editingMember])

  const closeModal = () => {
    setModalMode(null)
    setEditingMember(null)
    setFormState(null)
    setFieldErrors({})
    setSaveError(null)
  }

  const openAddModal = () => {
    setEditingMember(null)
    setModalMode('add')
  }

  const openEditModal = (member: OrganizationMember) => {
    setEditingMember(member)
    setModalMode('edit')
  }

  const validateForm = (form: EmployeeMemberFormState): boolean => {
    const errors: Partial<Record<string, string>> = {}

    const profileResult = validateEmployeeProfile(buildProfilePayload(form), { requireAll: false })
    Object.assign(errors, profileResult.errors)

    if (!form.email.trim()) errors.email = 'ایمیل الزامی است'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'ایمیل معتبر نیست'
    }

    if (form.password && form.password.length < 12) {
      errors.password = 'رمز عبور باید حداقل ۱۲ کاراکتر باشد'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId || !formState || !modalMode) return
    if (!validateForm(formState)) return

    setSaving(true)
    setSaveError(null)

    const profile = buildProfilePayload(formState)
    const employeeCode = formState.employeeCode.trim()
    const jobTitle = formState.jobTitle.trim()

    try {
      if (modalMode === 'add') {
        const invitation = await apiFetch<{ token?: string }>(`/tenants/${tenantId}/invite`, {
          method: 'POST',
          body: {
            email: formState.email.trim(),
            ...(formState.password ? { password: formState.password } : {}),
            role: formState.role,
            ...(employeeCode ? { employeeCode } : {}),
            ...(jobTitle ? { jobTitle } : {}),
            ...(formState.departmentId ? { departmentId: formState.departmentId } : {}),
            ...(formState.hireDate ? { hireDate: formState.hireDate } : {}),
            ...profile,
          },
        })
        if (invitation?.token) {
          const inviteUrl = `${window.location.origin}/invitations/accept?token=${encodeURIComponent(invitation.token)}`
          await navigator.clipboard?.writeText(inviteUrl)
          window.alert('دعوت‌نامه ساخته شد و لینک پذیرش در کلیپ‌بورد کپی شد.')
        }
      } else if (editingMember) {
        await apiFetch(`/tenants/${tenantId}/members/${editingMember.userId}`, {
          method: 'PATCH',
          body: {
            email: formState.email.trim(),
            ...(formState.password ? { password: formState.password } : {}),
            role: editingMember.role === TENANT_ROLES.OWNER ? undefined : formState.role,
            ...(employeeCode ? { employeeCode } : {}),
            ...(jobTitle ? { jobTitle } : {}),
            ...(formState.departmentId ? { departmentId: formState.departmentId } : {}),
            status: formState.status,
            ...(formState.hireDate ? { hireDate: formState.hireDate } : {}),
            ...profile,
          },
        })
      }
      closeModal()
      await refetch()
      await refetchInvitations()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'خطا در ذخیره')
    } finally {
      setSaving(false)
    }
  }

  const revokeInvitation = async (id: string) => {
    if (!tenantId || !window.confirm('این دعوت‌نامه لغو شود؟')) return
    await apiFetch(`/tenants/${tenantId}/invitations/${id}`, { method: 'DELETE' })
    await refetchInvitations()
  }

  const resendInvitation = async (id: string) => {
    if (!tenantId) return
    const result = await apiFetch<{ token: string }>(`/tenants/${tenantId}/invitations/${id}/resend`, { method: 'POST' })
    const inviteUrl = `${window.location.origin}/invitations/accept?token=${encodeURIComponent(result.token)}`
    await navigator.clipboard?.writeText(inviteUrl)
    window.alert('لینک تازه دعوت در کلیپ‌بورد کپی شد.')
    await refetchInvitations()
  }

  const handleDeleteMember = async (member: OrganizationMember) => {
    if (!tenantId) return
    const label = memberDisplayName(member)
    if (!window.confirm(`آیا از حذف «${label}» از سازمان مطمئن هستید؟`)) return

    setDeletingUserId(member.userId)
    try {
      await apiFetch(`/tenants/${tenantId}/members/${member.userId}`, {
        method: 'DELETE',
      })
      await refetch()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'خطا در حذف کارمند')
    } finally {
      setDeletingUserId(null)
    }
  }

  const canDeleteMember = (member: OrganizationMember) => {
    if (!canManage) return false
    if (member.role === TENANT_ROLES.OWNER) return false
    if (member.userId === currentUser?.id) return false
    return true
  }

  const content = (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نام</TableHead>
              <TableHead>کد ملی</TableHead>
              <TableHead>ایمیل</TableHead>
              <TableHead>کد پرسنلی</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>وضعیت</TableHead>
              {canManage && <TableHead>عملیات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableEmpty
                colSpan={canManage ? 7 : 6}
                message="کارمندی در این سازمان ثبت نشده است"
              />
            ) : (
              members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium text-slate-900">
                    {memberDisplayName(member)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-left">
                    {member.employee?.nationalId ?? '—'}
                  </TableCell>
                  <TableCell dir="ltr" className="text-left text-slate-600">
                    {member.user.email}
                  </TableCell>
                  <TableCell>{member.employee?.employeeCode ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(member.role)}>
                      {TENANT_ROLE_LABELS[member.role as keyof typeof TENANT_ROLE_LABELS] ??
                        member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={employeeStatusBadgeVariant(
                        member.employee?.status ?? EMPLOYEE_STATUS.ACTIVE,
                      )}
                    >
                      {EMPLOYEE_STATUS_LABELS[member.employee?.status ?? 'active'] ??
                        member.employee?.status ??
                        'فعال'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {member.employee?.id && (
                          <Link href={`/employees/${member.employee.id}`}>
                            <Button variant="outline" size="sm">
                              <ExternalLink className="h-3.5 w-3.5" />
                              پروفایل
                            </Button>
                          </Link>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openEditModal(member)}>
                          <Pencil className="h-3.5 w-3.5" />
                          ویرایش
                        </Button>
                        {canDeleteMember(member) && (
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={deletingUserId === member.userId}
                            onClick={() => handleDeleteMember(member)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {canManage && invitations.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">دعوت‌نامه‌ها</h3>
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <span className="min-w-0 flex-1" dir="ltr">{invitation.email}</span>
              <Badge variant={invitation.status === 'pending' ? 'warning' : invitation.status === 'accepted' ? 'success' : 'default'}>{invitation.status}</Badge>
              {invitation.status === 'pending' && <><Button size="sm" variant="outline" onClick={() => void resendInvitation(invitation.id)}>ارسال مجدد</Button><Button size="sm" variant="danger" onClick={() => void revokeInvitation(invitation.id)}>لغو</Button></>}
            </div>
          ))}
        </section>
      )}

      {modalMode && formState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <h3 className="text-lg font-semibold">
                {modalMode === 'add' ? 'افزودن کارمند' : 'ویرایش مشخصات کارمند'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 hover:bg-slate-100"
                aria-label="بستن"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <EmployeeMemberFormFields
                formState={formState}
                setFormState={setFormState}
                mode={modalMode}
                isOwner={modalMode === 'edit' && editingMember?.role === TENANT_ROLES.OWNER}
                departments={departments}
                fieldErrors={fieldErrors}
              />

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={closeModal}>
                  انصراف
                </Button>
                <Button type="submit" isLoading={saving}>
                  {modalMode === 'add' ? 'ایجاد کارمند' : 'ذخیره'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )

  if (!showCard) {
    return content
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>کارمندان</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              مشخصات پرسنلی و حساب کاربری
              {members.length > 0 ? ` — ${members.length} نفر` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button size="sm" onClick={openAddModal} disabled={!tenantId}>
              <Plus className="h-4 w-4" />
              افزودن کارمند
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!tenantId}>
            <RefreshCw className="h-4 w-4" />
            بروزرسانی
          </Button>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
