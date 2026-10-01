'use client'

import { useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  BarChart3,
  Percent,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
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
import { KpiCard } from '@/components/common/KpiCard'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatting'
import { COLORS } from '@/lib/constants/colors'
import { cn } from '@/lib/utils'
import type {
  DashboardFilterOptions,
  DashboardFilters,
  DashboardPeriod,
  ManagementDashboard,
} from '@/lib/services/dashboard'

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

const GENDER_COLORS: Record<string, string> = {
  Male: COLORS.primary,
  Female: COLORS.accent,
  'Prefer not to say': COLORS.info,
  Unspecified: '#94a3b8',
}

function GenderTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">
        {row.name}: {formatNumber(row.value)}
      </p>
    </div>
  )
}

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Annual' },
  { id: 'custom', label: 'Custom' },
]

function filtersToQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams()
  if (filters.period && filters.period !== 'all') params.set('period', filters.period)
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}


export function DashboardPageClient({
  data,
}: {
  data: ManagementDashboard
  options?: DashboardFilterOptions
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const filters = data.filters

  function apply(next: DashboardFilters) {
    const qs = filtersToQuery(next)
    startTransition(() => {
      router.push(`${pathname}${qs}`)
    })
  }

  function patch(partial: Partial<DashboardFilters>) {
    apply({ ...filters, ...partial })
  }

  const maxProduct = data.top_products[0]?.value || 1
  const genderTotal = data.by_gender.reduce((sum, row) => sum + row.value, 0)

  return (
    <PageShell>
      <PageHeader title="Dashboard" description={pending ? 'Updating…' : undefined} />

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={filters.period === p.id ? 'default' : 'outline'}
            onClick={() => patch({ period: p.id })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {filters.period === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              defaultValue={filters.from || ''}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              defaultValue={filters.to || ''}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </div>
        </div>
      )}

      <div
        className={cn(
          'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
          pending && 'opacity-70 transition-opacity'
        )}
      >
        <KpiCard
          title="Period sales"
          value={formatNumber(data.stats.period_sales)}
          icon={BarChart3}
          variant="success"
        />
        <KpiCard
          title="Period revenue"
          value={formatCurrency(data.stats.period_revenue)}
          icon={TrendingUp}
          variant="success"
        />
        <KpiCard
          title="Outstanding"
          value={formatCurrency(data.stats.outstanding)}
          icon={AlertCircle}
          variant="warning"
        />
        <KpiCard
          title="Beneficiaries"
          value={formatNumber(data.stats.customers_in_view)}
          icon={Users}
        />
        <KpiCard
          title="Activations sent"
          value={formatNumber(data.stats.activations_sent)}
          icon={Activity}
        />
        <KpiCard
          title="Collection rate"
          value={`${data.stats.collection_rate}%`}
          icon={Percent}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Revenue & collections" description={`Trend for ${data.range.label}`}>
          {data.series.every((d) => d.revenue === 0 && d.collected === 0) ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No sales in this view — adjust period
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
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

        <Panel title="Gender" description="Male vs female beneficiaries in view">
          {genderTotal === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No gender data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.by_gender}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={96}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {data.by_gender.map((row) => (
                    <Cell key={row.name} fill={GENDER_COLORS[row.name] || COLORS.info} />
                  ))}
                </Pie>
                <Tooltip content={<GenderTooltip />} />
                <Legend
                  formatter={(value, entry) => {
                    const count = Number(entry.payload?.value || 0)
                    return `${value} (${count})`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Sales by payment status" description="Counts in the current period">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.by_payment_status.map((row) => (
              <div
                key={row.name}
                className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-4 text-center"
              >
                <p className="font-display text-2xl font-semibold tabular-nums">{row.value}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {row.name.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Activation status" description="Per sale in the current period">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.by_activation_status.map((row) => (
              <div
                key={row.name}
                className="rounded-xl border border-border/60 bg-secondary/40 px-3 py-4 text-center"
              >
                <p className="font-display text-2xl font-semibold tabular-nums">{row.value}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {row.name.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Top products" description="Revenue in view">
          {data.top_products.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No product sales</p>
          ) : (
            <div className="space-y-4">
              {data.top_products.slice(0, 5).map((product, idx) => (
                <div key={`${product.name}-${idx}`} className="flex items-center gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-display text-xs font-semibold">
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
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(product.value / maxProduct) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Top beneficiaries" description="Highest purchase volume">
          {data.top_customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No customers</p>
          ) : (
            <div className="space-y-3">
              {data.top_customers.slice(0, 5).map((customer, idx) => (
                <div
                  key={`${customer.name}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary">
                      {customer.name[0]}
                    </div>
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(customer.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Revenue by state" description="Geographic mix in view">
          {data.by_state.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No state data</p>
          ) : (
            <div className="space-y-3">
              {data.by_state.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{row.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(row.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sales in view" description={`Latest sales for ${data.range.label}`}>
        {data.recent_sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No sales match this period
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Beneficiary</th>
                  <th className="px-2 py-2 font-medium">Location</th>
                  <th className="px-2 py-2 font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Payment</th>
                  <th className="px-2 py-2 font-medium">Activation</th>
                  <th className="px-2 py-2 font-medium">Serial</th>
                  <th className="px-2 py-2 font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border/60">
                    <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatDate(new Date(sale.date))}
                    </td>
                    <td className="px-2 py-2.5 font-medium">{sale.customer_name}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {[sale.lga, sale.state].filter(Boolean).join(', ')}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {formatCurrency(sale.total_amount)}
                    </td>
                    <td className="px-2 py-2.5 capitalize">
                      {sale.status.replace(/_/g, ' ')}
                    </td>
                    <td className="px-2 py-2.5 capitalize text-muted-foreground">
                      {sale.activation_status || '—'}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">
                      {sale.serials[0] || '—'}
                      {sale.serials.length > 1 ? ` +${sale.serials.length - 1}` : ''}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {sale.agent_name || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
