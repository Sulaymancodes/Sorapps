import {
  payments,
  invoices,
  paymentSchedules,
  paymentReminders,
  Payment,
  PaymentSchedule,
  PaymentReminder,
} from '@/data/mockData'

export async function getPayments(filters?: {
  invoice_id?: string
  sale_id?: string
  customer_id?: string
  status?: Payment['status']
  payment_type?: Payment['payment_type']
  dateRange?: { from: Date; to: Date }
}): Promise<Payment[]> {
  let result = [...payments]

  if (filters?.invoice_id) {
    result = result.filter((p) => p.invoice_id === filters.invoice_id)
  }

  if (filters?.sale_id) {
    result = result.filter((p) => p.sale_id === filters.sale_id)
  }

  if (filters?.customer_id) {
    result = result.filter((p) => p.customer_id === filters.customer_id)
  }

  if (filters?.status) {
    result = result.filter((p) => p.status === filters.status)
  }

  if (filters?.payment_type) {
    result = result.filter((p) => p.payment_type === filters.payment_type)
  }

  if (filters?.dateRange) {
    result = result.filter(
      (p) => p.date >= filters.dateRange!.from && p.date <= filters.dateRange!.to
    )
  }

  return result.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getPaymentSchedules(): Promise<PaymentSchedule[]> {
  return [...paymentSchedules].sort(
    (a, b) => (a.next_due_date?.getTime() || 0) - (b.next_due_date?.getTime() || 0)
  )
}

export async function getPaymentScheduleBySale(saleId: string): Promise<PaymentSchedule | null> {
  return paymentSchedules.find((s) => s.sale_id === saleId) || null
}

export async function getPaymentReminders(): Promise<PaymentReminder[]> {
  return [...paymentReminders].sort((a, b) => a.due_date.getTime() - b.due_date.getTime())
}

export async function getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
  return payments.filter((p) => p.invoice_id === invoiceId).sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
  return payments.filter((p) => p.customer_id === customerId).sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getPaymentStats() {
  const total = payments.reduce((sum, p) => sum + p.amount, 0)
  const successful = payments.filter((p) => p.status === 'success').length
  const pending = payments.filter((p) => p.status === 'pending').length

  const byMethod: Record<string, number> = {}
  payments.forEach((p) => {
    byMethod[p.method] = (byMethod[p.method] || 0) + p.amount
  })

  const fullPayments = payments.filter((p) => p.payment_type === 'full').length
  const installmentPayments = payments.filter((p) => p.payment_type === 'installment').length

  return {
    total_payments: payments.length,
    total_amount_collected: total,
    successful_payments: successful,
    pending_payments: pending,
    avg_payment: payments.length ? total / payments.length : 0,
    by_method: byMethod,
    full_payments: fullPayments,
    installment_payments: installmentPayments,
    active_reminders: paymentReminders.length,
  }
}

export async function getRecentPayments(limit: number = 10): Promise<Payment[]> {
  return [...payments].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}

export async function getPaymentTimeline(invoiceId: string): Promise<Payment[]> {
  return payments
    .filter((p) => p.invoice_id === invoiceId)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export async function getOutstandingPayments() {
  const outstanding = invoices
    .filter((inv) => inv.paid_amount < inv.total_amount)
    .map((inv) => {
      const schedule = paymentSchedules.find((s) => s.invoice_id === inv.id)
      const next = schedule?.installments.find((i) => i.status !== 'paid')
      return {
        invoice_id: inv.id,
        sale_id: inv.sale_id,
        customer_id: inv.customer_id,
        outstanding_amount: inv.total_amount - inv.paid_amount,
        due_date: next?.due_date || inv.due_date,
        days_overdue: Math.max(
          0,
          Math.floor(
            (new Date().getTime() - (next?.due_date || inv.due_date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        ),
        payment_type: schedule?.payment_type || 'full',
        next_week: next?.week_number,
      }
    })

  return outstanding.sort((a, b) => b.outstanding_amount - a.outstanding_amount)
}
