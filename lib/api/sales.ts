import { sales, Sale, customers, paymentSchedules, PaymentType } from '@/data/mockData'

export async function getSales(filters?: {
  customer_id?: string
  status?: Sale['status']
  payment_type?: PaymentType
  dateRange?: { from: Date; to: Date }
}): Promise<Sale[]> {
  let result = [...sales]

  if (filters?.customer_id) {
    result = result.filter((s) => s.customer_id === filters.customer_id)
  }

  if (filters?.status) {
    result = result.filter((s) => s.status === filters.status)
  }

  if (filters?.payment_type) {
    result = result.filter((s) => s.payment_type === filters.payment_type)
  }

  if (filters?.dateRange) {
    result = result.filter(
      (s) => s.date >= filters.dateRange!.from && s.date <= filters.dateRange!.to
    )
  }

  return result.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getSaleById(id: string): Promise<Sale | null> {
  return sales.find((s) => s.id === id) || null
}

export async function getSalesByCustomer(customerId: string): Promise<Sale[]> {
  return sales.filter((s) => s.customer_id === customerId).sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getSalesByStatus(status: Sale['status']): Promise<Sale[]> {
  return sales.filter((s) => s.status === status)
}

export async function getSalesStats() {
  const thisMonth = new Date()
  thisMonth.setDate(1)
  const currentMonthSales = sales.filter((s) => s.date >= thisMonth)

  const totalRevenue = sales.reduce((sum, s) => sum + s.total_amount, 0)
  const monthlyRevenue = currentMonthSales.reduce((sum, s) => sum + s.total_amount, 0)
  const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0)
  const totalCollected = sales.reduce((sum, s) => sum + s.amount_paid, 0)

  const byStatus: Record<Sale['status'], number> = {
    pending_payment: 0,
    partial: 0,
    paid: 0,
    completed: 0,
    cancelled: 0,
  }

  const byPaymentType: Record<PaymentType, number> = {
    full: 0,
    installment: 0,
  }

  sales.forEach((s) => {
    byStatus[s.status]++
    byPaymentType[s.payment_type]++
  })

  const activeInstallments = paymentSchedules.filter(
    (sch) => sch.payment_type === 'installment' && sch.paid_amount < sch.total_amount
  ).length

  return {
    total_sales: sales.length,
    total_revenue: totalRevenue,
    monthly_revenue: monthlyRevenue,
    total_profit: totalProfit,
    total_collected: totalCollected,
    outstanding: totalRevenue - totalCollected,
    avg_sale_value: totalRevenue / sales.length,
    by_status: byStatus,
    by_payment_type: byPaymentType,
    active_installments: activeInstallments,
  }
}

export async function getRecentSales(limit: number = 10): Promise<Sale[]> {
  return [...sales].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}

export async function getSalesWithCustomerDetails(): Promise<(Sale & { customer: (typeof customers)[0] })[]> {
  return sales.map((s) => ({
    ...s,
    customer: customers.find((c) => c.id === s.customer_id)!,
  }))
}

export async function getScheduleForSale(saleId: string) {
  return paymentSchedules.find((s) => s.sale_id === saleId) || null
}
