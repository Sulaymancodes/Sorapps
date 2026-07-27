'use client'

import { BarChart3, TrendingUp, Users, AlertCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { KpiCard } from '@/components/common/KpiCard'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { formatCurrency, formatNumber } from '@/lib/utils/formatting'
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

type DashboardData = {
  stats: {
    todays_sales: number
    monthly_revenue: number
    outstanding: number
    total_customers: number
    by_status: Record<string, number>
  }
  revenueData: { month: string; revenue: number; collected: number }[]
  paymentData: { month: string; paid: number; overdue: number }[]
  topProducts: { name: string; value: number }[]
  topCustomers: { name: string; value: number }[]
}

export function DashboardPageClient({ data }: { data: DashboardData }) {
  const { stats, revenueData, paymentData, topProducts, topCustomers } = data
  const maxProduct = topProducts[0]?.value || 1

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Your solar distribution overview — sales, collections, and customer activity."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today's Sales"
          value={formatCurrency(stats.todays_sales)}
          icon={BarChart3}
          variant="success"
        />
        <KpiCard
          title="Monthly Revenue"
          value={formatCurrency(stats.monthly_revenue)}
          icon={TrendingUp}
          variant="success"
        />
        <KpiCard
          title="Outstanding Payments"
          value={formatCurrency(stats.outstanding)}
          icon={AlertCircle}
          variant="warning"
        />
        <KpiCard
          title="Total Customers"
          value={formatNumber(stats.total_customers)}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Revenue & Collections" description="12-month revenue versus collected amounts">
          {revenueData.every((d) => d.revenue === 0 && d.collected === 0) ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No sales yet — create sales to see trends
            </p>
          ) : (
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
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke={COLORS.accent}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Payment Status" description="Paid vs overdue by month">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={paymentData} barGap={4}>
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
        <Panel title="Top Selling Products" description="Highest revenue contributors">
          {topProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No product sales yet</p>
          ) : (
            <div className="space-y-4">
              {topProducts.slice(0, 5).map((product, idx) => (
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

        <Panel title="Top Customers" description="Accounts with the highest purchase volume">
          {topCustomers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No customer sales yet</p>
          ) : (
            <div className="space-y-3">
              {topCustomers.slice(0, 5).map((customer, idx) => (
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

      <Panel title="Invoice Status Overview" description="Distribution across the billing lifecycle">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Object.entries(stats.by_status).map(([status, count]) => (
            <div
              key={status}
              className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-4 text-center"
            >
              <p className="font-display text-2xl font-semibold tabular-nums">{count}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {status.replace(/_/g, ' ')}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  )
}
