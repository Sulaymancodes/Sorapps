import type { Installment } from '@/lib/types/crm'

export const MAX_PLAN_DAYS = 730
export const MIN_INTERVAL_DAYS = 1
export const MAX_INTERVAL_DAYS = 365

export function isValidIntervalDays(days: number) {
  return (
    Number.isFinite(days) &&
    Number.isInteger(days) &&
    days >= MIN_INTERVAL_DAYS &&
    days <= MAX_INTERVAL_DAYS
  )
}

export function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addLocalDays(d: Date, days: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return startOfLocalDay(next)
}

export function toDateInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse `<input type="date">` value as local calendar day (avoids UTC shift). */
export function parseDateInput(iso: string): Date {
  const [y, m, d] = iso.split('-').map((part) => Number(part))
  if (!y || !m || !d) return new Date(NaN)
  return startOfLocalDay(new Date(y, m - 1, d))
}

/** Calendar "today" in Africa/Lagos — sale/PAYGO dates follow Nigerian field ops, not UTC server time. */
export function todayInLagos(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parseDateInput(ymd)
}

/**
 * Equal installments from start through end, spaced by intervalDays.
 * Due dates: start, start+interval, … while due <= end.
 */
export function buildInstallmentsByInterval(params: {
  total: number
  startDate: Date
  endDate: Date
  intervalDays: number
  saleIndexLabel?: string
}): Installment[] {
  const interval = Math.round(params.intervalDays)
  if (!isValidIntervalDays(interval)) {
    throw new Error(`Payment interval must be between ${MIN_INTERVAL_DAYS} and ${MAX_INTERVAL_DAYS} days`)
  }

  const start = startOfLocalDay(params.startDate)
  const end = startOfLocalDay(params.endDate)
  if (end.getTime() <= start.getTime()) {
    throw new Error('Plan end date must be after the sale date (pick a date after today)')
  }

  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000)
  if (spanDays > MAX_PLAN_DAYS) {
    throw new Error(`Plan cannot exceed ${MAX_PLAN_DAYS} days`)
  }

  const dues: Date[] = []
  let cursor = start
  while (cursor.getTime() <= end.getTime()) {
    dues.push(cursor)
    cursor = addLocalDays(cursor, interval)
  }

  if (dues.length === 0) {
    dues.push(end)
  }

  const count = dues.length
  const base = Math.floor(params.total / count)
  const remainder = params.total - base * count
  const label = params.saleIndexLabel || '00000'

  return dues.map((due_date, idx) => {
    const week_number = idx + 1
    const amount = idx === count - 1 ? base + remainder : base
    return {
      id: `INST${label}-W${String(week_number).padStart(2, '0')}`,
      week_number,
      amount,
      due_date,
      status: 'pending' as const,
      reminder: true,
    }
  })
}

/** Preview helper that never throws — returns null if inputs are incomplete/invalid */
export function previewInstallmentPlan(params: {
  total: number
  endDateIso: string
  intervalDays: number
  startDate?: Date
}): { count: number; amount: number; first_due: Date; last_due: Date } | null {
  if (!params.endDateIso || !params.total || params.total <= 0) return null
  try {
    const list = buildInstallmentsByInterval({
      total: Math.round(params.total),
      startDate: params.startDate || new Date(),
      endDate: parseDateInput(params.endDateIso),
      intervalDays: params.intervalDays,
    })
    if (!list.length) return null
    return {
      count: list.length,
      amount: list[0].amount,
      first_due: list[0].due_date,
      last_due: list[list.length - 1].due_date,
    }
  } catch {
    return null
  }
}
