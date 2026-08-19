import { and, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { format } from 'date-fns'
import { db } from '@/lib/db'
import { customers, installments, paymentSchedules } from '@/lib/db/schema'
import {
  getPaygoOverdueSmsIntervalDays,
  getPaygoReminderDaysBefore,
  isPaygoOverdueSmsEnabled,
} from '@/lib/paygo/validity'
import {
  buildPaygoOverdueSmsBody,
  buildPaygoReminderSmsBody,
  normalizeNigerianPhone,
  sendBulkSms,
} from '@/lib/sms/bulksms'

export type ReminderRunSummary = {
  due_soon_sent: number
  due_soon_failed: number
  overdue_sent: number
  overdue_failed: number
  skipped: number
  errors: string[]
}

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Daily PAYGO SMS job:
 * - Reminder when installment is due in exactly REMINDER_DAYS_BEFORE (default 7)
 * - Overdue SMS when enabled, re-sent every OVERDUE_SMS_INTERVAL_DAYS
 */
export async function runPaygoReminderSmsJob(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    due_soon_sent: 0,
    due_soon_failed: 0,
    overdue_sent: 0,
    overdue_failed: 0,
    skipped: 0,
    errors: [],
  }

  const daysBefore = getPaygoReminderDaysBefore()
  const overdueEnabled = isPaygoOverdueSmsEnabled()
  const overdueInterval = getPaygoOverdueSmsIntervalDays()
  const today = startOfLocalDay()
  const targetDue = addDays(today, daysBefore)
  const targetDueEnd = addDays(targetDue, 1)
  const overdueCutoff = addDays(today, -overdueInterval)

  const dueSoonRows = await db
    .select({
      installment: installments,
      schedule: paymentSchedules,
      customer: customers,
    })
    .from(installments)
    .innerJoin(paymentSchedules, eq(installments.scheduleId, paymentSchedules.id))
    .innerJoin(customers, eq(paymentSchedules.customerId, customers.id))
    .where(
      and(
        sql`${installments.status} <> 'paid'`,
        gte(installments.dueDate, targetDue),
        lt(installments.dueDate, targetDueEnd),
        isNull(installments.reminderSmsSentAt)
      )
    )

  for (const row of dueSoonRows) {
    const sent = await sendDueSoon(row, daysBefore, summary)
    if (!sent) continue
  }

  if (overdueEnabled) {
    const overdueRows = await db
      .select({
        installment: installments,
        schedule: paymentSchedules,
        customer: customers,
      })
      .from(installments)
      .innerJoin(paymentSchedules, eq(installments.scheduleId, paymentSchedules.id))
      .innerJoin(customers, eq(paymentSchedules.customerId, customers.id))
      .where(
        and(
          sql`${installments.status} <> 'paid'`,
          lte(installments.dueDate, today),
          or(isNull(installments.overdueSmsSentAt), lte(installments.overdueSmsSentAt, overdueCutoff))
        )
      )

    for (const row of overdueRows) {
      await sendOverdue(row, today, summary)
    }
  }

  return summary
}

type ReminderRow = {
  installment: typeof installments.$inferSelect
  schedule: typeof paymentSchedules.$inferSelect
  customer: typeof customers.$inferSelect
}

async function sendDueSoon(
  row: ReminderRow,
  daysBefore: number,
  summary: ReminderRunSummary
) {
  const phone = normalizeNigerianPhone(row.customer.phone)
  if (!phone) {
    summary.skipped++
    summary.errors.push(`${row.installment.id}: invalid phone`)
    return false
  }

  const amountDue = Math.max(0, row.installment.amount - (row.installment.paidAmount || 0))
  if (amountDue <= 0) {
    summary.skipped++
    return false
  }

  const firstName = row.customer.name.split(/\s+/)[0] || row.customer.name
  const body = buildPaygoReminderSmsBody({
    customerName: firstName,
    amount: amountDue,
    dueDateLabel: format(row.installment.dueDate, 'dd MMM yyyy'),
    weekNumber: row.installment.weekNumber,
    daysUntil: daysBefore,
  })

  const sms = await sendBulkSms({ to: phone, body, gateway: 'otp' })
  if (sms.success) {
    await db
      .update(installments)
      .set({ reminderSmsSentAt: new Date() })
      .where(eq(installments.id, row.installment.id))
    summary.due_soon_sent++
    return true
  }

  summary.due_soon_failed++
  summary.errors.push(`${row.installment.id}: ${sms.error}`)
  return false
}

async function sendOverdue(row: ReminderRow, today: Date, summary: ReminderRunSummary) {
  const phone = normalizeNigerianPhone(row.customer.phone)
  if (!phone) {
    summary.skipped++
    summary.errors.push(`${row.installment.id}: invalid phone`)
    return
  }

  const amountDue = Math.max(0, row.installment.amount - (row.installment.paidAmount || 0))
  if (amountDue <= 0) {
    summary.skipped++
    return
  }

  const daysOverdue = Math.max(
    1,
    Math.round((today.getTime() - startOfLocalDay(row.installment.dueDate).getTime()) / 86400000)
  )
  const firstName = row.customer.name.split(/\s+/)[0] || row.customer.name
  const body = buildPaygoOverdueSmsBody({
    customerName: firstName,
    amount: amountDue,
    dueDateLabel: format(row.installment.dueDate, 'dd MMM yyyy'),
    weekNumber: row.installment.weekNumber,
    daysOverdue,
  })

  const sms = await sendBulkSms({ to: phone, body, gateway: 'otp' })
  if (sms.success) {
    await db
      .update(installments)
      .set({
        overdueSmsSentAt: new Date(),
        status: row.installment.status === 'partial' ? 'partial' : 'overdue',
      })
      .where(eq(installments.id, row.installment.id))
    summary.overdue_sent++
    return
  }

  summary.overdue_failed++
  summary.errors.push(`${row.installment.id}: ${sms.error}`)
}
