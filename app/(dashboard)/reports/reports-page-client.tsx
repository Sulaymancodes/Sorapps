'use client'

import { Download, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { formatCurrency } from '@/lib/utils/formatting'
import { COLORS } from '@/lib/constants/colors'

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-muted-foreground">
          <span
            className="mr-2 inline-block size-2 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.name}: {formatCurrency((entry.value as number) * 1000)}
        </p>
      ))}
    </div>
  )
}

type ReportsData = {
  stats: {
    totalRevenue: number
    totalCollected: number
    totalOutstanding: number
    collectionRate: string
    totalCustomers: number
    activeDeals: number
  }
  revenueData: { month: string; revenue: number; collected: number }[]
  salesByStatus: { name: string; value: number }[]
  paymentTypeData: { name: string; value: number }[]
  paymentTrend: { month: string; paid: number; overdue: number }[]
  inventoryValue: { name: string; value: number }[]
  topProducts: { name: string; value: number }[]
  topCustomers: { name: string; value: number }[]
}

export function ReportsPageClient({ data }: { data: ReportsData }) {
  const {
    stats,
    revenueData,
    salesByStatus,
    paymentTypeData,
    paymentTrend,
    inventoryValue,
    topProducts,
    topCustomers,
  } = data

  const chartColors = [
    COLORS.primary,
    COLORS.accent,
    COLORS.success,
    COLORS.warning,
    COLORS.error,
    COLORS.info,
    '#06b6d4',
    '#64748b',
  ]
  const maxProduct = topProducts[0]?.value || 1

  return (
    <PageShell>
      <PageHeader
        title="Reports & Analytics"
        description="Live performance from your Neon sales, invoices, and inventory"
        actions={
          <>
            <Button variant="outline" className="gap-2" disabled>
              <Filter className="size-4" />
              Filter
            </Button>
            <Button className="gap-2" disabled>
              <Download className="size-4" />
              Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue) },
          {
            label: 'Total Collected',
            value: formatCurrency(stats.totalCollected),
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.totalOutstanding),
            className: 'text-accent',
          },
          {
            label: 'Collection Rate',
            value: `${stats.collectionRate}%`,
            className: 'text-primary',
          },
        ].map((stat) => (
          <div key={stat.label} className="surface-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={`mt-1 font-display text-2xl font-semibold tabular-nums ${stat.className || ''}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Revenue Trend" description="12-month revenue versus collected amounts">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={COLORS.primary}
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="collected"
                name="Collected"
                stroke={COLORS.success}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Sales by Status" description="Full and installment sales by collection status">
          {salesByStatus.every((s) => s.value === 0) ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No sales data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={salesByStatus.filter((s) => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {salesByStatus
                    .filter((s) => s.value > 0)
                    .map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} sales`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Payment Type Mix" description="Full payment vs weekly installment sales">
          {paymentTypeData.every((s) => s.value === 0) ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No sales data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={paymentTypeData.filter((s) => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {paymentTypeData
                    .filter((s) => s.value > 0)
                    .map((entry, index) => (
                      <Cell
                        key={`ptype-${entry.name}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} sales`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Payment Status Trend" description="Paid vs overdue by month">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={paymentTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="paid" name="Paid" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name="Overdue" fill={COLORS.error} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Inventory Value by Category" description="Stock value across product categories">
          {inventoryValue.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Add products to see inventory value
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={inventoryValue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Top 10 Products by Revenue" description="Highest revenue contributors">
          {topProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No product sales yet</p>
          ) : (
            <div className="space-y-4">
              {topProducts.map((product, idx) => (
                <div key={`${product.name}-${idx}`} className="flex items-center gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-display text-xs font-semibold text-secondary-foreground">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(product.value)}
                      </p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(product.value / maxProduct) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Top 10 Customers by Revenue" description="Accounts with the highest purchase volume">
          {topCustomers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No customer sales yet</p>
          ) : (
            <div className="space-y-3">
              {topCustomers.map((customer, idx) => (
                <div
                  key={`${customer.name}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary">
                      {customer.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">Rank #{idx + 1}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(customer.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
