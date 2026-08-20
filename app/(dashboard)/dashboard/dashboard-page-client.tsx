'use client'

import { useMemo, useTransition } from 'react'
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
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { getLgasForState } from '@/lib/constants/lgas'
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

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Annual' },
  { id: 'custom', label: 'Custom' },
]

function filtersToQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams()
  if (filters.period && filters.period !== 'month') params.set('period', filters.period)
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  if (filters.state) params.set('state', filters.state)
  if (filters.lga) params.set('lga', filters.lga)
  if (filters.deployment_area) params.set('area', filters.deployment_area)
  if (filters.agent_id) params.set('agent', filters.agent_id)
  if (filters.activation_status) params.set('activation', filters.activation_status)
  if (filters.payment_status) params.set('payment', filters.payment_status)
  if (filters.serial) params.set('serial', filters.serial)
  if (filters.beneficiary_status) params.set('beneficiary', filters.beneficiary_status)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function activeFilterCount(filters: DashboardFilters) {
  let n = 0
  if (filters.state) n++
  if (filters.lga) n++
  if (filters.deployment_area) n++
  if (filters.agent_id) n++
  if (filters.activation_status) n++
  if (filters.payment_status) n++
  if (filters.serial) n++
  if (filters.beneficiary_status) n++
  if (filters.period === 'custom' && (filters.from || filters.to)) n++
  return n
}

export function DashboardPageClient({
  data,
  options,
}: {
  data: ManagementDashboard
  options: DashboardFilterOptions
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const filters = data.filters

  const lgaOptions = useMemo(() => getLgasForState(filters.state || ''), [filters.state])

  const areaOptions = useMemo(
    () => [
      'All areas',
      ...options.deployment_areas.map(
        (a) => `${a.name} (${a.subsidy_level.replace('_', ' ')})`
      ),
    ],
    [options.deployment_areas]
  )

  const areaLabelToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of options.deployment_areas) {
      map.set(`${a.name} (${a.subsidy_level.replace('_', ' ')})`, a.id)
    }
    return map
  }, [options.deployment_areas])

  const selectedAreaLabel = useMemo(() => {
    if (!filters.deployment_area) return 'All areas'
    const a = options.deployment_areas.find((x) => x.id === filters.deployment_area)
    return a ? `${a.name} (${a.subsidy_level.replace('_', ' ')})` : 'All areas'
  }, [filters.deployment_area, options.deployment_areas])

  const agentOptions = useMemo(
    () => ['All agents', ...options.agents.map((a) => a.name)],
    [options.agents]
  )
  const agentLabelToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of options.agents) map.set(a.name, a.id)
    return map
  }, [options.agents])
  const selectedAgentLabel = useMemo(() => {
    if (!filters.agent_id) return 'All agents'
    return options.agents.find((a) => a.id === filters.agent_id)?.name || 'All agents'
  }, [filters.agent_id, options.agents])

  function apply(next: DashboardFilters) {
    const qs = filtersToQuery(next)
    startTransition(() => {
      router.push(`${pathname}${qs}`)
    })
  }

  function patch(partial: Partial<DashboardFilters>) {
    const next = { ...filters, ...partial }
    if (partial.state !== undefined && partial.state !== filters.state) {
      next.lga = ''
    }
    if (partial.deployment_area) {
      const area = options.deployment_areas.find((a) => a.id === partial.deployment_area)
      if (area && !next.state) next.state = area.state
    }
    apply(next)
  }

  function clearFilters() {
    apply({ period: filters.period === 'custom' ? 'month' : filters.period })
  }

  const maxProduct = data.top_products[0]?.value || 1
  const filterCount = activeFilterCount(filters)

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description={`Management view · ${data.range.label}${pending ? ' · updating…' : ''}`}
      />

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

      <Panel
        title="Filters"
        description="State, LGA, deployment area, agent, status, serial, and beneficiary"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filters.period === 'custom' && (
            <>
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
            </>
          )}

          <div className="space-y-1.5">
            <Label>State</Label>
            <SearchableSelect
              options={['All states', ...options.states]}
              value={filters.state || 'All states'}
              onChange={(v) => patch({ state: v === 'All states' ? '' : v })}
              placeholder="Search state…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>LGA</Label>
            <SearchableSelect
              options={filters.state ? ['All LGAs', ...lgaOptions] : ['Select a state first']}
              value={filters.lga || (filters.state ? 'All LGAs' : 'Select a state first')}
              onChange={(v) =>
                patch({ lga: v === 'All LGAs' || v === 'Select a state first' ? '' : v })
              }
              placeholder="Search LGA…"
              disabled={!filters.state}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Deployment area</Label>
            <SearchableSelect
              options={areaOptions}
              value={selectedAreaLabel}
              onChange={(v) =>
                patch({
                  deployment_area: v === 'All areas' ? '' : areaLabelToId.get(v) || '',
                })
              }
              placeholder="Search area…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Representative / agent</Label>
            <SearchableSelect
              options={agentOptions}
              value={selectedAgentLabel}
              onChange={(v) =>
                patch({ agent_id: v === 'All agents' ? '' : agentLabelToId.get(v) || '' })
              }
              placeholder="Search agent…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment">Payment status</Label>
            <Select
              id="payment"
              value={filters.payment_status || ''}
              onChange={(e) => patch({ payment_status: e.target.value })}
            >
              <option value="">All payment statuses</option>
              {options.payment_statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activation">Activation status</Label>
            <Select
              id="activation"
              value={filters.activation_status || ''}
              onChange={(e) => patch({ activation_status: e.target.value })}
            >
              <option value="">All activation statuses</option>
              {options.activation_statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="beneficiary">Beneficiary status</Label>
            <Select
              id="beneficiary"
              value={filters.beneficiary_status || ''}
              onChange={(e) =>
                patch({
                  beneficiary_status: e.target.value as DashboardFilters['beneficiary_status'],
                })
              }
            >
              <option value="">All beneficiaries</option>
              {options.beneficiary_statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serial">Device / serial</Label>
            <Input
              id="serial"
              placeholder="Search serial…"
              defaultValue={filters.serial || ''}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next !== (filters.serial || '')) patch({ serial: next })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const next = (e.target as HTMLInputElement).value.trim()
                  patch({ serial: next })
                }
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {filterCount > 0
              ? `${filterCount} active filter${filterCount === 1 ? '' : 's'}`
              : 'No dimension filters — showing full period'}
          </p>
          {filterCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Panel>

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
              No sales in this view — adjust period or filters
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

        <Panel title="Payment status" description="Paid vs overdue in view">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.series} barGap={4}>
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
              <Bar dataKey="paid" name="Paid" fill={COLORS.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name="Overdue" fill={COLORS.error} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Sales by payment status" description="Counts in the current filter set">
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

        <Panel title="Activation status" description="Per sale in the current filter set">
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

      <Panel title="Sales in view" description="Latest matches for the current filters">
        {data.recent_sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No sales match this period and filter set
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
