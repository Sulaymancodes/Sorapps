/**
 * PAYGO amount → activation validity.
 * Stipulated deposit unlocks base days (default 30). Extra payment extends
 * proportionally beyond 30; underpayment yields a shorter (partial) period.
 */

export type ValidityResult = {
  validity_days: number
  is_partial: boolean
  ratio: number
  base_validity_days: number
  expected_amount: number
  amount_paid: number
}

export function getPaygoBaseValidityDays() {
  const raw = Number(process.env.PAYGO_BASE_VALIDITY_DAYS || 30)
  if (!Number.isFinite(raw) || raw < 1) return 30
  return Math.min(365, Math.round(raw))
}

export function getPaygoReminderDaysBefore() {
  const raw = Number(process.env.PAYGO_REMINDER_DAYS_BEFORE || 7)
  if (!Number.isFinite(raw) || raw < 1) return 7
  return Math.min(30, Math.round(raw))
}

export function isPaygoOverdueSmsEnabled() {
  const raw = (process.env.PAYGO_OVERDUE_SMS_ENABLED || 'true').toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

export function getPaygoOverdueSmsIntervalDays() {
  const raw = Number(process.env.PAYGO_OVERDUE_SMS_INTERVAL_DAYS || 3)
  if (!Number.isFinite(raw) || raw < 1) return 3
  return Math.min(30, Math.round(raw))
}

export function calculateValidityDays(params: {
  amount_paid: number
  expected_amount: number
  base_validity_days?: number
}): ValidityResult {
  const base = params.base_validity_days ?? getPaygoBaseValidityDays()
  const expected = Math.max(1, Math.round(params.expected_amount || 0))
  const paid = Math.max(0, Math.round(params.amount_paid || 0))
  const ratio = paid / expected
  const validity_days = Math.max(1, Math.min(365, Math.round(ratio * base)))
  const is_partial = paid > 0 && paid < expected

  return {
    validity_days,
    is_partial,
    ratio,
    base_validity_days: base,
    expected_amount: expected,
    amount_paid: paid,
  }
}
