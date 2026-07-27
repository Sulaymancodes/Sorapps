import { invoices, Invoice, customers } from '@/data/mockData'

export async function getInvoices(filters?: {
  customer_id?: string
  status?: Invoice['status']
  dateRange?: { from: Date; to: Date }
}): Promise<Invoice[]> {
  let result = [...invoices]

  if (filters?.customer_id) {
    result = result.filter((i) => i.customer_id === filters.customer_id)
  }

  if (filters?.status) {
    result = result.filter((i) => i.status === filters.status)
  }

  if (filters?.dateRange) {
    result = result.filter(
      (i) =>
        i.issue_date >= filters.dateRange!.from &&
        i.issue_date <= filters.dateRange!.to
    )
  }

  return result.sort((a, b) => b.issue_date.getTime() - a.issue_date.getTime())
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  return invoices.find((i) => i.id === id) || null
}

export async function getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
  return invoices.filter((i) => i.customer_id === customerId).sort((a, b) => b.issue_date.getTime() - a.issue_date.getTime())
}

export async function getInvoicesByStatus(status: Invoice['status']): Promise<Invoice[]> {
  return invoices.filter((i) => i.status === status)
}

export async function getOverdueInvoices(): Promise<Invoice[]> {
  const now = new Date()
  return invoices.filter((i) => i.status === 'overdue' || (i.due_date < now && i.status !== 'paid'))
}

export async function getInvoiceStats() {
  const total = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const collected = invoices.reduce((sum, i) => sum + i.paid_amount, 0)
  const outstanding = total - collected

  const byStatus: Record<Invoice['status'], number> = {
    draft: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    partial: 0,
  }

  invoices.forEach((i) => {
    byStatus[i.status]++
  })

  return {
    total_invoices: invoices.length,
    total_amount: total,
    collected: collected,
    outstanding,
    collection_rate: (collected / total) * 100,
    by_status: byStatus,
  }
}

export async function getRecentInvoices(limit: number = 10): Promise<Invoice[]> {
  return [...invoices].sort((a, b) => b.issue_date.getTime() - a.issue_date.getTime()).slice(0, limit)
}

export async function getInvoicesWithCustomerDetails(): Promise<(Invoice & { customer: typeof customers[0] })[]> {
  return invoices.map((i) => ({
    ...i,
    customer: customers.find((c) => c.id === i.customer_id)!,
  }))
}
