import {
  addDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  activationCodes,
  customers,
  invoices,
  payments,
  saleItems,
  sales,
  user,
  warranties,
} from '@/lib/db/schema'
import { APPROVED_DEPLOYMENT_AREAS } from '@/lib/constants/deployment-areas'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { listProducts } from '@/lib/services/products'

export type DashboardPeriod =
  | 'all'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'

export type BeneficiaryStatusFilter =
  | ''
  | 'minor'
  | 'adult'
  | 'activated'
  | 'not_activated'
  | 'outstanding'

export type DashboardFilters = {
  period: DashboardPeriod
  from?: string
  to?: string
  state?: string
  lga?: string
  deployment_area?: string
  agent_id?: string
  activation_status?: string
  payment_status?: string
  serial?: string
  beneficiary_status?: BeneficiaryStatusFilter
}

export type ManagementDashboard = {
  filters: DashboardFilters
  range: { start: string; end: string; label: string }
  stats: {
    period_sales: number
    period_revenue: number
    outstanding: number
    customers_in_view: number
    activations_sent: number
    collection_rate: string
  }
  series: { label: string; revenue: number; collected: number; paid: number; overdue: number }[]
  by_gender: { name: string; value: number }[]
  by_payment_status: { name: string; value: number }[]
  by_activation_status: { name: string; value: number }[]
  top_products: { name: string; value: number }[]
  top_customers: { name: string; value: number }[]
  by_state: { name: string; value: number }[]
  recent_sales: {
    id: string
    customer_name: string
    state: string
    lga: string
    total_amount: number
    status: string
    date: string
    activation_status: string | null
    serials: string[]
    agent_name: string | null
  }[]
}

export type DashboardFilterOptions = {
  states: string[]
  deployment_areas: { id: string; name: string; state: string; subsidy_level: string }[]
  agents: { id: string; name: string; email: string }[]
  payment_statuses: { id: string; label: string }[]
  activation_statuses: { id: string; label: string }[]
  beneficiary_statuses: { id: string; label: string }[]
}

function parseDateInput(value?: string): Date | null {
  if (!value?.trim()) return null
  const d = new Date(`${value.trim()}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function resolveDashboardRange(
  filters: Pick<DashboardFilters, 'period' | 'from' | 'to'>,
  now = new Date()
): { start: Date; end: Date; label: string } {
  const period = filters.period || 'all'

  if (period === 'all') {
    return {
      start: new Date(2000, 0, 1),
      end: endOfDay(now),
      label: 'All time',
    }
  }

  if (period === 'custom') {
    const from = parseDateInput(filters.from) ?? startOfMonth(now)
    const to = parseDateInput(filters.to) ?? endOfDay(now)
    return {
      start: startOfDay(from),
      end: endOfDay(to),
      label: `${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}`,
    }
  }

  if (period === 'day') {
    return { start: startOfDay(now), end: endOfDay(now), label: format(now, 'dd MMM yyyy') }
  }
  if (period === 'week') {
    const start = startOfWeek(now, { weekStartsOn: 1 })
    const end = endOfWeek(now, { weekStartsOn: 1 })
    return {
      start,
      end,
      label: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
    }
  }
  if (period === 'quarter') {
    const start = startOfQuarter(now)
    const end = endOfQuarter(now)
    return { start, end, label: `Q${Math.floor(now.getMonth() / 3) + 1} ${format(now, 'yyyy')}` }
  }
  if (period === 'year') {
    return { start: startOfYear(now), end: endOfYear(now), label: format(now, 'yyyy') }
  }

  return {
    start: startOfMonth(now),
    end: endOfMonth(now),
    label: format(now, 'MMMM yyyy'),
  }
}

function buildBuckets(start: Date, end: Date, period: DashboardPeriod) {
  const spanDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1)

  if (period === 'day' || spanDays <= 1) {
    return [{ label: format(start, 'dd MMM'), start, end }]
  }

  if (period === 'week' || (period === 'custom' && spanDays <= 14)) {
    return eachDayOfInterval({ start, end }).map((day) => ({
      label: format(day, 'EEE dd'),
      start: startOfDay(day),
      end: endOfDay(day),
    }))
  }

  if (period === 'month' || (period === 'custom' && spanDays <= 45)) {
    return eachDayOfInterval({ start, end }).map((day) => ({
      label: format(day, 'dd'),
      start: startOfDay(day),
      end: endOfDay(day),
    }))
  }

  return eachMonthOfInterval({ start, end }).map((month) => ({
    label: format(month, 'MMM'),
    start: startOfMonth(month),
    end: endOfMonth(month),
  }))
}

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

export function parseDashboardFilters(
  raw: Record<string, string | string[] | undefined>
): DashboardFilters {
  const one = (key: string) => {
    const v = raw[key]
    return Array.isArray(v) ? v[0] || '' : v || ''
  }

  const periodRaw = one('period')
  const period = (
    ['all', 'day', 'week', 'month', 'quarter', 'year', 'custom'].includes(periodRaw)
      ? periodRaw
      : 'all'
  ) as DashboardPeriod

  return {
    period,
    from: one('from') || undefined,
    to: one('to') || undefined,
    state: one('state') || undefined,
    lga: one('lga') || undefined,
    deployment_area: one('area') || one('deployment_area') || undefined,
    agent_id: one('agent') || one('agent_id') || undefined,
    activation_status: one('activation') || one('activation_status') || undefined,
    payment_status: one('payment') || one('payment_status') || undefined,
    serial: one('serial') || undefined,
    beneficiary_status: (one('beneficiary') ||
      one('beneficiary_status') ||
      '') as BeneficiaryStatusFilter,
  }
}

export async function getDashboardFilterOptions(): Promise<DashboardFilterOptions> {
  const agents = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .orderBy(user.name)

  return {
    states: [...NIGERIAN_STATES],
    deployment_areas: APPROVED_DEPLOYMENT_AREAS.map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      subsidy_level: a.subsidy_level,
    })),
    agents,
    payment_statuses: [
      { id: 'pending_payment', label: 'Pending payment' },
      { id: 'partial', label: 'Partial' },
      { id: 'paid', label: 'Paid' },
      { id: 'completed', label: 'Completed' },
      { id: 'cancelled', label: 'Cancelled' },
    ],
    activation_statuses: [
      { id: 'none', label: 'No activation' },
      { id: 'pending', label: 'Pending' },
      { id: 'sent', label: 'Sent' },
      { id: 'failed', label: 'Failed' },
      { id: 'used', label: 'Used' },
      { id: 'expired', label: 'Expired' },
    ],
    beneficiary_statuses: [
      { id: 'minor', label: 'Minor' },
      { id: 'adult', label: 'Adult' },
      { id: 'activated', label: 'Activated' },
      { id: 'not_activated', label: 'Not activated' },
      { id: 'outstanding', label: 'Has outstanding' },
    ],
  }
}

export async function getManagementDashboard(
  filters: DashboardFilters
): Promise<ManagementDashboard> {
  const range = resolveDashboardRange(filters)
  const area = filters.deployment_area
    ? APPROVED_DEPLOYMENT_AREAS.find((a) => a.id === filters.deployment_area)
    : undefined

  const effectiveState = filters.state || area?.state || ''
  const effectiveLga = filters.lga || ''

  const [saleRows, invoiceRows, activationRows, warrantyRows, paymentRows, productList, agentRows] =
    await Promise.all([
      db
        .select({
          sale: sales,
          customer: customers,
        })
        .from(sales)
        .innerJoin(customers, eq(sales.customerId, customers.id))
        .orderBy(desc(sales.date)),
      db.select().from(invoices),
      db.select().from(activationCodes),
      db
        .select({
          id: warranties.id,
          saleId: warranties.saleId,
          customerId: warranties.customerId,
          serialNumber: warranties.serialNumber,
        })
        .from(warranties),
      db
        .select({
          id: payments.id,
          saleId: payments.saleId,
          createdByUserId: payments.createdByUserId,
          amount: payments.amount,
          date: payments.date,
        })
        .from(payments),
      listProducts(),
      db.select({ id: user.id, name: user.name }).from(user),
    ])

  const agentName = new Map(agentRows.map((a) => [a.id, a.name]))
  const productMap = new Map(productList.map((p) => [p.id, p]))

  const saleIds = saleRows.map((r) => r.sale.id)
  const itemRows =
    saleIds.length > 0
      ? await db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))
      : []
  const itemsBySale = new Map<string, typeof itemRows>()
  for (const item of itemRows) {
    const list = itemsBySale.get(item.saleId) || []
    list.push(item)
    itemsBySale.set(item.saleId, list)
  }

  const warrantiesBySale = new Map<string, typeof warrantyRows>()
  for (const w of warrantyRows) {
    if (!w.saleId) continue
    const list = warrantiesBySale.get(w.saleId) || []
    list.push(w)
    warrantiesBySale.set(w.saleId, list)
  }

  const activationsBySale = new Map<string, typeof activationRows>()
  const activationsByCustomer = new Map<string, typeof activationRows>()
  for (const a of activationRows) {
    if (a.saleId) {
      const list = activationsBySale.get(a.saleId) || []
      list.push(a)
      activationsBySale.set(a.saleId, list)
    }
    const clist = activationsByCustomer.get(a.customerId) || []
    clist.push(a)
    activationsByCustomer.set(a.customerId, clist)
  }

  const paymentAgentsBySale = new Map<string, Set<string>>()
  for (const p of paymentRows) {
    if (!p.saleId || !p.createdByUserId) continue
    const set = paymentAgentsBySale.get(p.saleId) || new Set()
    set.add(p.createdByUserId)
    paymentAgentsBySale.set(p.saleId, set)
  }

  const serialQuery = normalize(filters.serial)

  type Row = (typeof saleRows)[number]

  const matchesGeoAndDims = (row: Row, checkDateRange: boolean) => {
    const { sale, customer } = row
    const saleDate = sale.date instanceof Date ? sale.date : new Date(sale.date)
    if (checkDateRange && (saleDate < range.start || saleDate > range.end)) return false

    if (effectiveState && normalize(customer.state) !== normalize(effectiveState)) return false
    if (effectiveLga && normalize(customer.lga) !== normalize(effectiveLga)) return false

    if (area?.lgas?.length) {
      const ok = area.lgas.some((lga) => normalize(lga) === normalize(customer.lga))
      if (!ok) return false
    }

    if (filters.payment_status && sale.status !== filters.payment_status) return false

    const saleActs = activationsBySale.get(sale.id) || []
    const custActs = activationsByCustomer.get(customer.id) || []
    const acts = saleActs.length ? saleActs : custActs
    const actStatus = acts[0]?.status || 'none'

    if (filters.activation_status) {
      if (filters.activation_status === 'none') {
        if (acts.length > 0) return false
      } else if (actStatus !== filters.activation_status) {
        return false
      }
    }

    if (filters.agent_id) {
      const paymentAgents = paymentAgentsBySale.get(sale.id)
      const activationAgents = new Set(
        acts.map((a) => a.createdByUserId).filter(Boolean) as string[]
      )
      const match =
        sale.createdByUserId === filters.agent_id ||
        paymentAgents?.has(filters.agent_id) ||
        activationAgents.has(filters.agent_id)
      if (!match) return false
    }

    if (serialQuery) {
      const serials = [
        ...(warrantiesBySale.get(sale.id) || []).map((w) => w.serialNumber),
        ...acts.map((a) => a.deviceSerial),
      ]
      if (!serials.some((s) => normalize(s).includes(serialQuery))) return false
    }

    const beneficiary = filters.beneficiary_status || ''
    if (beneficiary === 'minor' && !customer.isMinor) return false
    if (beneficiary === 'adult' && customer.isMinor) return false
    if (beneficiary === 'outstanding') {
      const outstandingBal =
        customer.outstandingBalance > 0 || sale.amountPaid < sale.totalAmount
      if (!outstandingBal) return false
    }
    if (beneficiary === 'activated') {
      if (!acts.some((a) => a.status === 'sent' || a.status === 'used')) return false
    }
    if (beneficiary === 'not_activated') {
      if (acts.some((a) => a.status === 'sent' || a.status === 'used')) return false
    }

    return true
  }

  const filtered = saleRows.filter((row) => matchesGeoAndDims(row, true))
  const filteredSaleIds = new Set(filtered.map((r) => r.sale.id))
  const filteredCustomerIds = new Set(filtered.map((r) => r.customer.id))
  const filteredInvoices = invoiceRows.filter((inv) => filteredSaleIds.has(inv.saleId))

  const periodRevenue = filtered.reduce((sum, r) => sum + r.sale.totalAmount, 0)
  const periodCollected = filteredInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0)
  const outstanding = filteredInvoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.totalAmount - inv.paidAmount),
    0
  )

  const activationsInView = activationRows.filter((a) => {
    if (a.saleId && filteredSaleIds.has(a.saleId)) return true
    if (!a.saleId && filteredCustomerIds.has(a.customerId)) return true
    return false
  })
  const activationsSent = activationsInView.filter(
    (a) => a.status === 'sent' || a.status === 'used'
  ).length

  const baseBuckets = buildBuckets(range.start, range.end, filters.period)
  const chartBuckets =
    filters.period === 'day'
      ? eachDayOfInterval({
          start: startOfDay(addDays(range.start, -6)),
          end: range.end,
        }).map((day) => ({
          label: format(day, 'EEE dd'),
          start: startOfDay(day),
          end: endOfDay(day),
        }))
      : baseBuckets.length > 62
        ? eachMonthOfInterval({ start: range.start, end: range.end }).map((month) => ({
            label: format(month, 'MMM'),
            start: startOfMonth(month),
            end: endOfMonth(month),
          }))
        : baseBuckets

  const chartRows =
    filters.period === 'day'
      ? saleRows.filter((row) => {
          const saleDate = row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)
          if (saleDate < chartBuckets[0].start || saleDate > range.end) return false
          return matchesGeoAndDims(row, false)
        })
      : filtered

  const series = chartBuckets.map((bucket) => {
    const inBucket = chartRows.filter((r) => {
      const d = r.sale.date instanceof Date ? r.sale.date : new Date(r.sale.date)
      return d >= bucket.start && d <= bucket.end
    })
    const ids = new Set(inBucket.map((r) => r.sale.id))
    const invs = invoiceRows.filter((inv) => ids.has(inv.saleId))
    const revenue = inBucket.reduce((sum, r) => sum + r.sale.totalAmount, 0)
    const collected = invs.reduce((sum, inv) => sum + inv.paidAmount, 0)
    const overdue = invs
      .filter((inv) => inv.paidAmount < inv.totalAmount && inv.dueDate < new Date())
      .reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0)
    return {
      label: bucket.label,
      revenue: Math.round(revenue / 1000),
      collected: Math.round(collected / 1000),
      paid: Math.round(collected / 1000),
      overdue: Math.round(overdue / 1000),
    }
  })

  const statusCounts: Record<string, number> = {
    pending_payment: 0,
    partial: 0,
    paid: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const row of filtered) {
    statusCounts[row.sale.status] = (statusCounts[row.sale.status] || 0) + 1
  }

  const actCounts: Record<string, number> = {
    none: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    used: 0,
    expired: 0,
  }
  for (const row of filtered) {
    const acts = activationsBySale.get(row.sale.id) || []
    if (!acts.length) {
      actCounts.none += 1
      continue
    }
    const status = acts[0].status || 'pending'
    actCounts[status] = (actCounts[status] || 0) + 1
  }

  const productTotals: Record<string, { name: string; value: number }> = {}
  for (const row of filtered) {
    for (const item of itemsBySale.get(row.sale.id) || []) {
      const product = productMap.get(item.productId)
      const name = product?.name || item.productId
      if (!productTotals[item.productId]) productTotals[item.productId] = { name, value: 0 }
      productTotals[item.productId].value += item.total
    }
  }

  const customerTotals: Record<string, { name: string; value: number }> = {}
  const stateTotals: Record<string, number> = {}
  const genderCounts: Record<string, number> = { Male: 0, Female: 0 }
  const countedGenders = new Set<string>()
  for (const row of filtered) {
    const cid = row.customer.id
    if (!customerTotals[cid]) customerTotals[cid] = { name: row.customer.name, value: 0 }
    customerTotals[cid].value += row.sale.totalAmount
    const st = row.customer.state || 'Unknown'
    stateTotals[st] = (stateTotals[st] || 0) + row.sale.totalAmount
    if (!countedGenders.has(cid)) {
      countedGenders.add(cid)
      const gender = (row.customer.gender || '').trim()
      if (gender === 'Male' || gender === 'Female') {
        genderCounts[gender] += 1
      } else if (gender) {
        genderCounts[gender] = (genderCounts[gender] || 0) + 1
      } else {
        genderCounts.Unspecified = (genderCounts.Unspecified || 0) + 1
      }
    }
  }

  const recent = filtered.slice(0, 12).map((row) => {
    const acts = activationsBySale.get(row.sale.id) || []
    const serials = (warrantiesBySale.get(row.sale.id) || [])
      .map((w) => w.serialNumber)
      .filter(Boolean)
    const agentId =
      row.sale.createdByUserId ||
      acts[0]?.createdByUserId ||
      [...(paymentAgentsBySale.get(row.sale.id) || [])][0] ||
      null
    return {
      id: row.sale.id,
      customer_name: row.customer.name,
      state: row.customer.state,
      lga: row.customer.lga,
      total_amount: row.sale.totalAmount,
      status: row.sale.status,
      date: (row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)).toISOString(),
      activation_status: acts[0]?.status || null,
      serials,
      agent_name: agentId ? agentName.get(agentId) || null : null,
    }
  })

  return {
    filters,
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
    },
    stats: {
      period_sales: filtered.length,
      period_revenue: periodRevenue,
      outstanding,
      customers_in_view: filteredCustomerIds.size,
      activations_sent: activationsSent,
      collection_rate:
        periodRevenue > 0 ? ((periodCollected / periodRevenue) * 100).toFixed(1) : '0.0',
    },
    series,
    by_gender: Object.entries(genderCounts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const order = (name: string) =>
          name === 'Male' ? 0 : name === 'Female' ? 1 : 2
        return order(a.name) - order(b.name)
      }),
    by_payment_status: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
    by_activation_status: Object.entries(actCounts).map(([name, value]) => ({ name, value })),
    top_products: Object.values(productTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    top_customers: Object.values(customerTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    by_state: Object.entries(stateTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    recent_sales: recent,
  }
}
