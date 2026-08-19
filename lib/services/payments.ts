import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  customers,
  installments,
  invoices,
  paymentSchedules,
  payments,
  sales,
} from '@/lib/db/schema'
import { calculateValidityDays } from '@/lib/paygo/validity'
import type { Payment, PaymentType } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

export type PaymentMethod = Payment['method']

export type OutstandingSaleOption = {
  sale_id: string
  customer_id: string
  customer_name: string
  phone: string
  payment_type: PaymentType
  total_amount: number
  amount_paid: number
  outstanding: number
  expected_amount: number
  week_number?: number
  next_due_date?: string
  status: string
  date: string
  days_until_due: number
  urgency: 'overdue' | 'due_today' | 'due_soon' | 'later'
}

export type PaymentStats = {
  total_collected: number
  payment_count: number
  avg_payment: number
  total_outstanding: number
  outstanding_sales: number
  overdue_sales: number
  due_today_sales: number
}

export type ListPaymentsPageInput = {
  search?: string
  method?: string
  payment_type?: string
  page?: number
  page_size?: number
}

function mapPayment(row: typeof payments.$inferSelect): Payment {
  return {
    id: row.id,
    invoice_id: row.invoiceId,
    sale_id: row.saleId,
    customer_id: row.customerId,
    schedule_id: row.scheduleId ?? undefined,
    installment_id: row.installmentId ?? undefined,
    amount: row.amount,
    date: row.date,
    method: row.method as PaymentMethod,
    reference: row.reference,
    bank: row.bank || undefined,
    status: row.status as Payment['status'],
    payment_type: row.paymentType as PaymentType,
    week_number: row.weekNumber ?? undefined,
    is_partial: row.isPartial,
    expected_amount: row.expectedAmount ?? undefined,
    validity_days: row.validityDays ?? undefined,
    activation_id: row.activationId ?? undefined,
    notes: row.notes || undefined,
  }
}

function urgencyFromDays(daysUntil: number): OutstandingSaleOption['urgency'] {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'due_today'
  if (daysUntil <= 14) return 'due_soon'
  return 'later'
}

function urgencyRank(u: OutstandingSaleOption['urgency']) {
  return { overdue: 0, due_today: 1, due_soon: 2, later: 3 }[u]
}

export async function getPaymentStats(): Promise<PaymentStats> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(startOfToday)
  endOfToday.setDate(endOfToday.getDate() + 1)

  const [[collected], [outstanding], [overdue], [dueToday]] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(eq(payments.status, 'success')),
    db
      .select({
        total: sql<number>`coalesce(sum(${sales.totalAmount} - ${sales.amountPaid}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(sql`${sales.amountPaid} < ${sales.totalAmount}`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .innerJoin(paymentSchedules, eq(paymentSchedules.saleId, sales.id))
      .where(
        and(
          sql`${sales.amountPaid} < ${sales.totalAmount}`,
          lt(paymentSchedules.nextDueDate, startOfToday)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .innerJoin(paymentSchedules, eq(paymentSchedules.saleId, sales.id))
      .where(
        and(
          sql`${sales.amountPaid} < ${sales.totalAmount}`,
          gte(paymentSchedules.nextDueDate, startOfToday),
          lt(paymentSchedules.nextDueDate, endOfToday)
        )
      ),
  ])

  const totalCollected = Number(collected?.total || 0)
  const paymentCount = Number(collected?.count || 0)

  return {
    total_collected: totalCollected,
    payment_count: paymentCount,
    avg_payment: paymentCount ? totalCollected / paymentCount : 0,
    total_outstanding: Number(outstanding?.total || 0),
    outstanding_sales: Number(outstanding?.count || 0),
    overdue_sales: Number(overdue?.count || 0),
    due_today_sales: Number(dueToday?.count || 0),
  }
}

export async function listPaymentsPage(input: ListPaymentsPageInput = {}) {
  const page = Math.max(1, Math.floor(input.page || 1))
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.page_size || 25)))
  const offset = (page - 1) * pageSize
  const search = input.search?.trim() || ''

  const filters = []
  if (input.method) filters.push(eq(payments.method, input.method))
  if (input.payment_type) filters.push(eq(payments.paymentType, input.payment_type))
  if (search) {
    const q = `%${search}%`
    filters.push(
      or(
        ilike(payments.id, q),
        ilike(payments.saleId, q),
        ilike(payments.reference, q),
        ilike(payments.customerId, q)
      )!
    )
  }

  const where = filters.length ? and(...filters) : undefined

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .where(where)

  const rows = await db
    .select()
    .from(payments)
    .where(where)
    .orderBy(desc(payments.date))
    .limit(pageSize)
    .offset(offset)

  const total = Number(countRow?.count || 0)
  return {
    items: rows.map(mapPayment),
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function listPayments(limit = 100): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(payments)
    .orderBy(desc(payments.date))
    .limit(limit)
  return rows.map(mapPayment)
}

export async function listPaymentsForSale(saleId: string): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.saleId, saleId))
    .orderBy(desc(payments.date))
  return rows.map(mapPayment)
}

export type RecordPaymentInput = {
  sale_id: string
  amount: number
  method: PaymentMethod
  reference?: string
  bank?: string
  notes?: string
  date?: Date
  created_by_user_id?: string
}

export type RecordPaymentResult = {
  payment: Payment
  outstanding: number
  validity: ReturnType<typeof calculateValidityDays>
  sale_status: string
  next_due_date?: Date
  customer_id: string
}

/**
 * Apply a cash/bank collection against a sale's installment schedule (FIFO),
 * update outstanding / next due / partial flags. Activation SMS is issued by the caller.
 */
export async function recordPayment(
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  const amount = Math.round(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero')
  }

  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, input.sale_id)).limit(1)
    if (!sale) throw new Error('Sale not found')

    const outstandingBefore = Math.max(0, sale.totalAmount - sale.amountPaid)
    if (outstandingBefore <= 0) {
      throw new Error('This sale is already fully paid')
    }
    if (amount > outstandingBefore) {
      throw new Error(
        `Payment exceeds outstanding balance of ₦${outstandingBefore.toLocaleString('en-NG')}`
      )
    }

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.saleId, sale.id))
      .limit(1)
    if (!invoice) throw new Error('Invoice not found for sale')

    const [schedule] = await tx
      .select()
      .from(paymentSchedules)
      .where(eq(paymentSchedules.saleId, sale.id))
      .limit(1)
    if (!schedule) throw new Error('Payment schedule not found for sale')

    const instRows = await tx
      .select()
      .from(installments)
      .where(eq(installments.scheduleId, schedule.id))
      .orderBy(installments.weekNumber)

    const openInstallments = instRows.filter((i) => i.status !== 'paid')
    const primary = openInstallments[0]
    const expectedAmount = primary
      ? Math.max(1, primary.amount - (primary.paidAmount || 0))
      : outstandingBefore

    const validity = calculateValidityDays({
      amount_paid: amount,
      expected_amount: expectedAmount,
    })

    let remaining = amount
    let primaryInstallmentId: string | null = primary?.id ?? null
    let primaryWeek: number | null = primary?.weekNumber ?? null
    const now = input.date ? new Date(input.date) : new Date()

    for (const inst of openInstallments) {
      if (remaining <= 0) break
      const already = Math.max(0, inst.paidAmount || 0)
      const need = Math.max(0, inst.amount - already)
      if (need <= 0) continue

      const apply = Math.min(remaining, need)
      const newPaid = already + apply
      remaining -= apply

      const fullyPaid = newPaid >= inst.amount
      await tx
        .update(installments)
        .set({
          paidAmount: newPaid,
          status: fullyPaid ? 'paid' : 'partial',
          paidDate: fullyPaid ? now : inst.paidDate,
        })
        .where(eq(installments.id, inst.id))
    }

    if (remaining > 0) {
      throw new Error('Could not allocate full payment across installments')
    }

    const refreshed = await tx
      .select()
      .from(installments)
      .where(eq(installments.scheduleId, schedule.id))
      .orderBy(installments.weekNumber)

    const newPaidTotal = sale.amountPaid + amount
    const outstandingAfter = Math.max(0, sale.totalAmount - newPaidTotal)
    const nextOpen = refreshed.find((i) => i.status !== 'paid')
    const nextDue = nextOpen?.dueDate ?? null

    const saleStatus =
      outstandingAfter <= 0 ? 'paid' : newPaidTotal > 0 ? 'partial' : 'pending_payment'
    const invoiceStatus =
      outstandingAfter <= 0 ? 'paid' : newPaidTotal > 0 ? 'partial' : invoice.status

    await tx
      .update(sales)
      .set({ amountPaid: newPaidTotal, status: saleStatus })
      .where(eq(sales.id, sale.id))

    await tx
      .update(invoices)
      .set({ paidAmount: newPaidTotal, status: invoiceStatus })
      .where(eq(invoices.id, invoice.id))

    await tx
      .update(paymentSchedules)
      .set({
        paidAmount: newPaidTotal,
        nextDueDate: nextDue,
      })
      .where(eq(paymentSchedules.id, schedule.id))

    await tx
      .update(customers)
      .set({
        outstandingBalance: sql`GREATEST(0, ${customers.outstandingBalance} - ${amount})`,
      })
      .where(eq(customers.id, sale.customerId))

    const existingPaymentIds = await tx.select({ id: payments.id }).from(payments)
    const paymentId = nextId(
      'PAY',
      existingPaymentIds.map((r) => r.id),
      6
    )

    const [paymentRow] = await tx
      .insert(payments)
      .values({
        id: paymentId,
        invoiceId: invoice.id,
        saleId: sale.id,
        customerId: sale.customerId,
        scheduleId: schedule.id,
        installmentId: primaryInstallmentId,
        amount,
        date: now,
        method: input.method,
        reference: input.reference?.trim() || paymentId,
        bank: input.bank?.trim() || '',
        status: 'success',
        paymentType: sale.paymentType,
        weekNumber: primaryWeek,
        isPartial: validity.is_partial,
        expectedAmount,
        validityDays: validity.validity_days,
        notes: input.notes?.trim() || '',
        createdByUserId: input.created_by_user_id || null,
      })
      .returning()

    return {
      payment: mapPayment(paymentRow),
      outstanding: outstandingAfter,
      validity,
      sale_status: saleStatus,
      next_due_date: nextDue ?? undefined,
      customer_id: sale.customerId,
    }
  })
}

export async function linkPaymentActivation(paymentId: string, activationId: string) {
  await db
    .update(payments)
    .set({ activationId })
    .where(eq(payments.id, paymentId))
}

export async function getExpectedAmountForSale(saleId: string): Promise<{
  expected_amount: number
  outstanding: number
  week_number?: number
  payment_type: PaymentType
} | null> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!sale) return null

  const outstanding = Math.max(0, sale.totalAmount - sale.amountPaid)
  const [schedule] = await db
    .select()
    .from(paymentSchedules)
    .where(eq(paymentSchedules.saleId, saleId))
    .limit(1)

  if (!schedule) {
    return {
      expected_amount: outstanding || sale.totalAmount,
      outstanding,
      payment_type: sale.paymentType as PaymentType,
    }
  }

  const instRows = await db
    .select()
    .from(installments)
    .where(eq(installments.scheduleId, schedule.id))
    .orderBy(installments.weekNumber)

  const next = instRows.find((i) => i.status !== 'paid')
  const expected = next
    ? Math.max(1, next.amount - (next.paidAmount || 0))
    : Math.max(1, instRows[0]?.amount || outstanding || sale.totalAmount)

  return {
    expected_amount: expected,
    outstanding,
    week_number: next?.weekNumber,
    payment_type: sale.paymentType as PaymentType,
  }
}

/** Outstanding sales for collection queue / record payment — one row per sale */
export async function listOutstandingSaleOptions(opts?: {
  search?: string
  urgency?: OutstandingSaleOption['urgency'] | 'actionable' | 'all'
  limit?: number
}): Promise<OutstandingSaleOption[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 80))
  const search = opts?.search?.trim() || ''
  const candidateLimit = search
    ? Math.min(500, Math.max(limit, 100))
    : Math.min(800, Math.max(limit * 8, 200))

  const filters = [sql`${sales.amountPaid} < ${sales.totalAmount}`]
  if (search) {
    const q = `%${search}%`
    filters.push(
      or(
        ilike(sales.id, q),
        ilike(customers.name, q),
        ilike(customers.phone, q),
        ilike(customers.id, q)
      )!
    )
  }

  const saleRows = await db
    .select({
      id: sales.id,
      customerId: sales.customerId,
      totalAmount: sales.totalAmount,
      amountPaid: sales.amountPaid,
      paymentType: sales.paymentType,
      status: sales.status,
      date: sales.date,
      nextDueDate: paymentSchedules.nextDueDate,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(paymentSchedules, eq(paymentSchedules.saleId, sales.id))
    .where(and(...filters))
    .orderBy(
      search
        ? desc(sales.date)
        : sql`${paymentSchedules.nextDueDate} asc nulls last`
    )
    .limit(candidateLimit)

  if (!saleRows.length) return []

  const scheduleRows = await db
    .select()
    .from(paymentSchedules)
    .where(
      inArray(
        paymentSchedules.saleId,
        saleRows.map((s) => s.id)
      )
    )
  const scheduleBySale = new Map(scheduleRows.map((s) => [s.saleId, s]))

  const scheduleIds = scheduleRows.map((s) => s.id)
  const instRows =
    scheduleIds.length > 0
      ? await db
          .select()
          .from(installments)
          .where(inArray(installments.scheduleId, scheduleIds))
      : []

  const instBySchedule = new Map<string, typeof instRows>()
  for (const inst of instRows) {
    const list = instBySchedule.get(inst.scheduleId) ?? []
    list.push(inst)
    instBySchedule.set(inst.scheduleId, list)
  }

  const now = Date.now()
  let mapped: OutstandingSaleOption[] = saleRows.map((sale) => {
    const schedule = scheduleBySale.get(sale.id)
    const insts = schedule
      ? (instBySchedule.get(schedule.id) ?? []).sort((a, b) => a.weekNumber - b.weekNumber)
      : []
    const next = insts.find((i) => i.status !== 'paid')
    const expected = next
      ? Math.max(1, next.amount - (next.paidAmount || 0))
      : Math.max(1, sale.totalAmount - sale.amountPaid)
    const due = next?.dueDate ?? schedule?.nextDueDate ?? sale.date
    const daysUntil = Math.ceil((due.getTime() - now) / 86400000)

    return {
      sale_id: sale.id,
      customer_id: sale.customerId,
      customer_name: sale.customerName || 'Customer',
      phone: sale.customerPhone || '',
      payment_type: sale.paymentType as PaymentType,
      total_amount: sale.totalAmount,
      amount_paid: sale.amountPaid,
      outstanding: sale.totalAmount - sale.amountPaid,
      expected_amount: expected,
      week_number: next?.weekNumber,
      next_due_date: due.toISOString(),
      status: sale.status,
      date: sale.date.toISOString(),
      days_until_due: daysUntil,
      urgency: urgencyFromDays(daysUntil),
    }
  })

  const urgencyFilter = opts?.urgency || 'all'
  if (urgencyFilter === 'actionable') {
    mapped = mapped.filter((s) => s.urgency !== 'later')
  } else if (urgencyFilter !== 'all') {
    mapped = mapped.filter((s) => s.urgency === urgencyFilter)
  }

  mapped.sort((a, b) => {
    const rank = urgencyRank(a.urgency) - urgencyRank(b.urgency)
    if (rank !== 0) return rank
    return a.days_until_due - b.days_until_due
  })

  return mapped.slice(0, limit)
}
