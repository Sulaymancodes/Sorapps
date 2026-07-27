import { sales, invoices, payments, customers, products } from '@/data/mockData'
import { startOfMonth, startOfYear, eachDayOfInterval, format } from 'date-fns'

export async function getRevenueData(months: number = 12) {
  const data = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = startOfMonth(date)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)

    const monthRevenue = invoices
      .filter((inv) => inv.issue_date >= monthStart && inv.issue_date <= monthEnd)
      .reduce((sum, inv) => sum + inv.total_amount, 0)

    const monthCollected = payments
      .filter((p) => p.date >= monthStart && p.date <= monthEnd && p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0)

    data.push({
      month: format(date, 'MMM'),
      revenue: Math.round(monthRevenue / 1000),
      collected: Math.round(monthCollected / 1000),
    })
  }

  return data
}

export async function getSalesData() {
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

  sales.forEach((s) => {
    const statusMap: Record<string, string> = {
      pending_payment: 'Pending Payment',
      partial: 'Partial',
      paid: 'Paid',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }
    statusCounts[statusMap[s.status]]++
    paymentTypeCounts[s.payment_type === 'full' ? 'Full Payment' : 'Installment']++
  })

  return {
    by_status: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
    by_payment_type: Object.entries(paymentTypeCounts).map(([name, value]) => ({ name, value })),
  }
}

export async function getTopProducts() {
  const productSales: Record<string, { name: string; value: number }> = {}

  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const product = products.find((p) => p.id === item.product_id)
      if (product) {
        if (!productSales[product.id]) {
          productSales[product.id] = { name: product.name, value: 0 }
        }
        productSales[product.id].value += item.total
      }
    })
  })

  return Object.values(productSales)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      value: Math.round(p.value / 1000),
    }))
}

export async function getTopCustomers() {
  const customerSales: Record<string, { name: string; value: number }> = {}

  sales.forEach((sale) => {
    const customer = customers.find((c) => c.id === sale.customer_id)
    if (customer) {
      if (!customerSales[customer.id]) {
        customerSales[customer.id] = { name: customer.name, value: 0 }
      }
      customerSales[customer.id].value += sale.total_amount
    }
  })

  return Object.values(customerSales)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((c) => ({
      ...c,
      value: Math.round(c.value / 1000),
    }))
}

export async function getPaymentTrendData(months: number = 12) {
  const data = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)

    const monthPaid = payments
      .filter((p) => p.date >= monthStart && p.date <= monthEnd && p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0)

    const monthOverdue = invoices
      .filter(
        (inv) =>
          inv.due_date < monthEnd &&
          inv.due_date >= monthStart &&
          inv.paid_amount < inv.total_amount
      )
      .reduce((sum, inv) => sum + (inv.total_amount - inv.paid_amount), 0)

    data.push({
      month: format(date, 'MMM'),
      paid: Math.round(monthPaid / 1000),
      overdue: Math.round(monthOverdue / 1000),
    })
  }

  return data
}

export async function getInventoryValue() {
  const valueByCategory: Record<string, number> = {}

  products.forEach((product) => {
    const value = product.cost * product.stock
    if (!valueByCategory[product.category]) {
      valueByCategory[product.category] = 0
    }
    valueByCategory[product.category] += value
  })

  return Object.entries(valueByCategory)
    .map(([name, value]) => ({
      name,
      value: Math.round(value / 1000000), // Convert to millions
    }))
    .sort((a, b) => b.value - a.value)
}

export async function getOverallStats() {
  const totalRevenue = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const totalCollected = payments
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + p.amount, 0)
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.total_amount - i.paid_amount), 0)

  return {
    totalRevenue: Math.round(totalRevenue / 1000000),
    totalCollected: Math.round(totalCollected / 1000000),
    totalOutstanding: Math.round(totalOutstanding / 1000000),
    collectionRate: ((totalCollected / totalRevenue) * 100).toFixed(1),
    totalCustomers: customers.length,
    activeDeals: sales.filter((s) => !['completed', 'cancelled'].includes(s.status)).length,
  }
}
