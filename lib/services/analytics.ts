import { format, startOfDay, startOfMonth, endOfMonth } from 'date-fns'
import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'
import {
  listInvoices,
  listPaymentSchedules,
  listSales,
} from '@/lib/services/sales'

function monthWindow(monthsBack: number) {
  const now = new Date()
  const windows: { label: string; start: Date; end: Date }[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    windows.push({
      label: format(date, 'MMM'),
      start: startOfMonth(date),
      end: endOfMonth(date),
    })
  }
  return windows
}

export async function getDashboardStats() {
  const [sales, invoices, customers] = await Promise.all([
    listSales(),
    listInvoices(),
    listCustomers(),
  ])

  const todayStart = startOfDay(new Date())
  const monthStart = startOfMonth(new Date())

  const todaysSales = sales
    .filter((s) => s.date >= todayStart)
    .reduce((sum, s) => sum + s.total_amount, 0)

  const monthlyRevenue = sales
    .filter((s) => s.date >= monthStart)
    .reduce((sum, s) => sum + s.total_amount, 0)

  const outstanding = invoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.total_amount - inv.paid_amount),
    0
  )

  const byStatus: Record<string, number> = {
    draft: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    partial: 0,
  }
  invoices.forEach((inv) => {
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1
  })

  return {
    todays_sales: todaysSales,
    monthly_revenue: monthlyRevenue,
    outstanding,
    total_customers: customers.length,
    total_sales: sales.length,
    by_status: byStatus,
  }
}

export async function getRevenueSeries(months = 12) {
  const [sales, invoices] = await Promise.all([listSales(), listInvoices()])
  // Collected = invoice paid_amount attributed to issue month until payment recording exists
  return monthWindow(months).map(({ label, start, end }) => {
    const revenue = sales
      .filter((s) => s.date >= start && s.date <= end)
      .reduce((sum, s) => sum + s.total_amount, 0)
    const collected = invoices
      .filter((inv) => inv.issue_date >= start && inv.issue_date <= end)
      .reduce((sum, inv) => sum + inv.paid_amount, 0)
    return {
      month: label,
      revenue: Math.round(revenue / 1000),
      collected: Math.round(collected / 1000),
    }
  })
}

export async function getPaymentStatusSeries(months = 12) {
  const [schedules, invoices] = await Promise.all([
    listPaymentSchedules(),
    listInvoices(),
  ])

  return monthWindow(months).map(({ label, start, end }) => {
    let paid = 0
    for (const schedule of schedules) {
      for (const inst of schedule.installments) {
        if (
          inst.status === 'paid' &&
          inst.paid_date &&
          inst.paid_date >= start &&
          inst.paid_date <= end
        ) {
          paid += inst.amount
        }
      }
    }
    // Fallback: treat invoice paid_amount in month as paid if no installment paid_dates yet
    if (paid === 0) {
      paid = invoices
        .filter((inv) => inv.issue_date >= start && inv.issue_date <= end)
        .reduce((sum, inv) => sum + inv.paid_amount, 0)
    }

    const overdue = invoices
      .filter(
        (inv) =>
          inv.due_date >= start &&
          inv.due_date <= end &&
          inv.paid_amount < inv.total_amount
      )
      .reduce((sum, inv) => sum + (inv.total_amount - inv.paid_amount), 0)

    return {
      month: label,
      paid: Math.round(paid / 1000),
      overdue: Math.round(overdue / 1000),
    }
  })
}

export async function getSalesBreakdown() {
  const sales = await listSales()

  const statusCounts: Record<string, number> = {
    'Pending Payment': 0,
    Partial: 0,
    Paid: 0,
    Completed: 0,
    Cancelled: 0,
  }
  const paymentTypeCounts: Record<string, number> = {
    'Full Payment': 0,
    Installment: 0,
  }

  const statusMap: Record<string, string> = {
    pending_payment: 'Pending Payment',
    partial: 'Partial',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }

  sales.forEach((s) => {
    statusCounts[statusMap[s.status]]++
    paymentTypeCounts[s.payment_type === 'full' ? 'Full Payment' : 'Installment']++
  })

  return {
    by_status: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
    by_payment_type: Object.entries(paymentTypeCounts).map(([name, value]) => ({
      name,
      value,
    })),
  }
}

export async function getTopProductsByRevenue(limit = 10) {
  const [sales, products] = await Promise.all([listSales(), listProducts()])
  const productMap = new Map(products.map((p) => [p.id, p]))
  const totals: Record<string, { name: string; value: number }> = {}

  for (const sale of sales) {
    for (const item of sale.items) {
      const product = productMap.get(item.product_id)
      const name = product?.name || item.product_id
      if (!totals[item.product_id]) {
        totals[item.product_id] = { name, value: 0 }
      }
      totals[item.product_id].value += item.total
    }
  }

  return Object.values(totals)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((p) => ({ name: p.name, value: p.value }))
}

export async function getTopCustomersByRevenue(limit = 10) {
  const [sales, customers] = await Promise.all([listSales(), listCustomers()])
  const customerMap = new Map(customers.map((c) => [c.id, c.name]))
  const totals: Record<string, { name: string; value: number }> = {}

  for (const sale of sales) {
    const name = customerMap.get(sale.customer_id) || sale.customer_id
    if (!totals[sale.customer_id]) {
      totals[sale.customer_id] = { name, value: 0 }
    }
    totals[sale.customer_id].value += sale.total_amount
  }

  return Object.values(totals)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => ({ name: c.name, value: c.value }))
}

export async function getInventoryValueByCategory() {
  const products = await listProducts()
  const byCategory: Record<string, number> = {}

  for (const product of products) {
    byCategory[product.category] =
      (byCategory[product.category] || 0) + product.cost * product.stock
  }

  return Object.entries(byCategory)
    .map(([name, value]) => ({
      name,
      value: Math.round(value / 1000), // thousands for chart scale
    }))
    .sort((a, b) => b.value - a.value)
}

export async function getOverallStats() {
  const [sales, invoices, customers] = await Promise.all([
    listSales(),
    listInvoices(),
    listCustomers(),
  ])

  const totalRevenue = sales.reduce((sum, s) => sum + s.total_amount, 0)
  const totalCollected = invoices.reduce((sum, i) => sum + i.paid_amount, 0)
  const totalOutstanding = invoices.reduce(
    (sum, i) => sum + Math.max(0, i.total_amount - i.paid_amount),
    0
  )

  return {
    totalRevenue,
    totalCollected,
    totalOutstanding,
    collectionRate:
      totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : '0.0',
    totalCustomers: customers.length,
    activeDeals: sales.filter((s) => !['completed', 'cancelled'].includes(s.status)).length,
  }
}

export async function getCalendarEvents() {
  const [customers, schedules] = await Promise.all([listCustomers(), listPaymentSchedules()])
  const customerMap = new Map(customers.map((c) => [c.id, c]))
  const now = startOfDay(new Date())

  const events = []

  for (const schedule of schedules) {
    if (schedule.payment_type !== 'installment') continue
    const customer = customerMap.get(schedule.customer_id)
    const totalWeeks = schedule.installment_weeks || schedule.installments.length
    const paidCount = schedule.installments.filter((i) => i.status === 'paid').length

    for (const inst of schedule.installments) {
      if (inst.status === 'paid') continue

      const due = startOfDay(inst.due_date)
      const daysUntil = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      let bucket: 'overdue' | 'due_today' | 'this_week' | 'upcoming' | 'later'
      if (daysUntil < 0) bucket = 'overdue'
      else if (daysUntil === 0) bucket = 'due_today'
      else if (daysUntil <= 7) bucket = 'this_week'
      else if (daysUntil <= 30) bucket = 'upcoming'
      else bucket = 'later'

      events.push({
        id: inst.id,
        sale_id: schedule.sale_id,
        schedule_id: schedule.id,
        customer_id: schedule.customer_id,
        customer_name: customer?.name || 'Unknown customer',
        customer_phone: customer?.phone || '',
        customer_email: customer?.email || '',
        customer_city: customer?.city || '',
        week_number: inst.week_number,
        total_weeks: totalWeeks,
        amount: inst.amount,
        dueDate: inst.due_date,
        daysUntil,
        bucket,
        schedule_outstanding: Math.max(0, schedule.total_amount - schedule.paid_amount),
        paid_installments: paidCount,
        color:
          bucket === 'overdue'
            ? ('red' as const)
            : bucket === 'due_today'
              ? ('orange' as const)
              : bucket === 'this_week'
                ? ('blue' as const)
                : ('green' as const),
      })
    }
  }

  return events.sort((a, b) => a.daysUntil - b.daysUntil || a.customer_name.localeCompare(b.customer_name))
}
