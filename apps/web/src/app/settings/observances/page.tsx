'use client'

import { ProtectedLayout } from '@/components/layout/protected-layout'
import { ResourceListPage } from '@/components/pages/resource-list-page'
import {
  formatPersianDigits,
  toGregorianParts,
  toJalaliParts,
  RECURRENCE_CALENDAR,
} from '@deska/shared'

interface OfficialObservance {
  id: string
  title: string
  description?: string | null
  startAt: string
  endAt: string
  allDay?: boolean
  entityType?: string | null
  entityId?: string | null
  recurrenceCal?: string | null
  isHoliday?: boolean
}

const normalizeDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))

const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
const GREGORIAN_MONTH_NAMES = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
]
const LUNAR_MONTH_NAMES = [
  'محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه',
]

function parseDate(value: string, calendar: string) {
  const match = normalizeDigits(value).match(/^(\d{1,2})[/-](\d{1,2})$/)
  if (!match) return null
  const year = calendar === RECURRENCE_CALENDAR.GREGORIAN ? 2026 : calendar === RECURRENCE_CALENDAR.LUNAR ? 1448 : 1405
  return { year, month: Number(match[1]), day: Number(match[2]) }
}

function lunarDateToIso(value: string) {
  const parsed = parseDate(value, RECURRENCE_CALENDAR.LUNAR)
  if (!parsed || parsed.year < 1 || parsed.month < 1 || parsed.month > 12 || parsed.day < 1) {
    return null
  }

  const approximate = Date.UTC(622, 6, 19) +
    ((parsed.year - 1) * 354.367 + (parsed.month - 1) * 29.53 + parsed.day - 1) * 86400000
  const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  for (let offset = -5; offset <= 5; offset += 1) {
    const candidate = new Date(approximate + offset * 86400000)
    const parts = formatter.formatToParts(candidate)
    const year = Number(parts.find((part) => part.type === 'year')?.value)
    const month = Number(parts.find((part) => part.type === 'month')?.value)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    if (year === parsed.year && month === parsed.month && day === parsed.day) {
      return candidate.toISOString()
    }
  }
  return null
}

function calendarDateToIso(value: string, calendar: string) {
  const parsed = parseDate(value, calendar)
  if (!parsed) return null

  if (calendar === RECURRENCE_CALENDAR.LUNAR) return lunarDateToIso(value)
  if (calendar === RECURRENCE_CALENDAR.GREGORIAN) {
    const candidate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12))
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString()
  }

  const gregorian = toGregorianParts(parsed.year, parsed.month, parsed.day)
  return new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, 12)).toISOString()
}

function observanceDate(value: string, calendar: string) {
  const date = calendarDateToIso(value, calendar)
  if (!date) throw new Error('تاریخ واردشده برای تقویم انتخابی معتبر نیست')
  return date
}

function lunarDateLabel(value: string) {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(value))
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return `${formatPersianDigits(day)} ${LUNAR_MONTH_NAMES[month - 1] ?? ''}`
}

function dateValue(value: string, calendar: string) {
  const date = new Date(value)
  if (calendar === RECURRENCE_CALENDAR.GREGORIAN) {
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  }
  if (calendar === RECURRENCE_CALENDAR.LUNAR) return lunarDateLabel(value)
  const jalali = toJalaliParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  return `${jalali.jm}/${jalali.jd}`
}

function dateLabel(value: string, calendar: string) {
  const date = new Date(value)
  if (calendar === RECURRENCE_CALENDAR.GREGORIAN) {
    return `${formatPersianDigits(date.getUTCDate())} ${GREGORIAN_MONTH_NAMES[date.getUTCMonth()] ?? ''}`
  }
  if (calendar === RECURRENCE_CALENDAR.LUNAR) return lunarDateLabel(value)
  const jalali = toJalaliParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  return `${formatPersianDigits(jalali.jd)} ${JALALI_MONTH_NAMES[jalali.jm - 1] ?? ''}`
}

function calendarLabel(calendar: string) {
  if (calendar === RECURRENCE_CALENDAR.GREGORIAN) return 'میلادی'
  if (calendar === RECURRENCE_CALENDAR.LUNAR) return 'قمری'
  return 'شمسی'
}

const observanceBody = (values: Record<string, string>) => {
  const recurrenceCal = values.calendarType || RECURRENCE_CALENDAR.JALALI
  const parsed = parseDate(values.calendarDate, recurrenceCal)
  if (!parsed) throw new Error('تاریخ واردشده برای تقویم انتخابی معتبر نیست')
  const startAt = observanceDate(values.calendarDate, recurrenceCal)
  return {
    title: values.title,
    description: values.description || undefined,
    startAt,
    endAt: startAt,
    allDay: true,
    recurrenceType: 'yearly',
    recurrenceCal,
    recurrenceRule: {
      calendar: recurrenceCal,
      month: parsed.month,
      day: parsed.day,
    },
    entityType: 'official_observance',
    entityId: values.isHoliday === 'true' ? 'holiday' : 'observance',
  }
}

function ObservancesContent() {
  return (
    <ResourceListPage<OfficialObservance>
      title="مناسبت‌های تقویم"
      apiPath="/calendar/system-observances"
      createLabel="افزودن مناسبت"
      editLabel="ویرایش مناسبت"
      columns={[
        { key: 'title', header: 'مناسبت' },
        {
          key: 'startAt',
          header: 'تاریخ مرجع',
          render: (row) => dateLabel(row.startAt, row.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI),
        },
        {
          key: 'recurrenceCal',
          header: 'تقویم مرجع',
          render: (row) => calendarLabel(row.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI),
        },
        {
          key: 'entityId',
          header: 'نوع',
          render: (row) => (row.isHoliday ? 'تعطیل رسمی' : 'مناسبت رسمی'),
        },
        { key: 'description', header: 'توضیحات' },
      ]}
      createFields={[
        { name: 'title', label: 'عنوان مناسبت', required: true },
        {
          name: 'calendarType',
          label: 'تقویم مرجع',
          type: 'select',
          required: true,
          options: [
            { value: RECURRENCE_CALENDAR.JALALI, label: 'شمسی' },
            { value: RECURRENCE_CALENDAR.GREGORIAN, label: 'میلادی' },
            { value: RECURRENCE_CALENDAR.LUNAR, label: 'قمری' },
          ],
        },
        {
          name: 'calendarDate',
          label: 'تاریخ در تقویم مرجع',
          type: 'calendar-date',
          required: true,
        },
        {
          name: 'isHoliday',
          label: 'تعطیل رسمی',
          type: 'checkbox',
        },
        { name: 'description', label: 'توضیحات', type: 'textarea' },
      ]}
      transformCreateBody={observanceBody}
      transformUpdateBody={(values) => observanceBody(values)}
      mapRowToForm={(row) => ({
        title: row.title,
        calendarType: row.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI,
        calendarDate: dateValue(row.startAt, row.recurrenceCal ?? RECURRENCE_CALENDAR.JALALI),
        isHoliday: row.isHoliday ? 'true' : 'false',
        description: row.description ?? '',
      })}
      canEdit
      canDelete
    />
  )
}

export default function SettingsObservancesPage() {
  return (
    <ProtectedLayout title="مناسبت‌های تقویم" superAdminOnly>
      <ObservancesContent />
    </ProtectedLayout>
  )
}
