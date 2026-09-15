'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { getLgasForState } from '@/lib/constants/lgas'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatting'
import { downloadCsv, rowsToCsv } from '@/lib/utils/csv'
import { cn } from '@/lib/utils'
import type { OddyseaFilters, OddyseaPeriod, OddyseaReport } from '@/lib/types/oddysea'

const PERIODS: { id: OddyseaPeriod; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Annual' },
  { id: 'custom', label: 'Custom' },
]

const SECTIONS = [
  { id: 'connections', label: '1. SHS connections' },
  { id: 'subsidy', label: '2. Subsidy claims' },
  { id: 'evidence', label: '3. Installation evidence' },
  { id: 'gps', label: '4. GPS verification' },
  { id: 'inventory', label: '5. Sales inventory' },
  { id: 'payments', label: '6. Payment tracking' },
  { id: 'claims', label: '7. Claims & issues' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

function filtersToQuery(filters: OddyseaFilters): string {
  const params = new URLSearchParams()
  if (filters.period && filters.period !== 'all') params.set('period', filters.period)
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  if (filters.state) params.set('state', filters.state)
  if (filters.lga) params.set('lga', filters.lga)
  if (filters.deployment_area) params.set('area', filters.deployment_area)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function ExportButton({
  label,
  filename,
  rows,
}: {
  label: string
  filename: string
  rows: Record<string, unknown>[]
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={!rows.length}
      onClick={() => downloadCsv(filename, rowsToCsv(rows))}
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  )
}

function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode }[]
  rows: Record<string, unknown>[]
  empty: string
}) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, idx) => (
            <tr key={idx} className="border-b border-border/60">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-2.5 align-top">
                  {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing 50 of {rows.length} — export CSV for the full set.
        </p>
      )}
    </div>
  )
}

export function ReportsPageClient({
  report,
  options,
}: {
  report: OddyseaReport
  options: {
    states: string[]
    deployment_areas: { id: string; name: string; state: string }[]
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [section, setSection] = useState<SectionId>('connections')
  const filters = report.filters

  const lgaOptions = useMemo(() => getLgasForState(filters.state || ''), [filters.state])

  const areaOptions = useMemo(
    () => ['All areas', ...options.deployment_areas.map((a) => a.name)],
    [options.deployment_areas]
  )
  const areaLabelToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of options.deployment_areas) map.set(a.name, a.id)
    return map
  }, [options.deployment_areas])
  const selectedAreaLabel = useMemo(() => {
    if (!filters.deployment_area) return 'All areas'
    return (
      options.deployment_areas.find((a) => a.id === filters.deployment_area)?.name || 'All areas'
    )
  }, [filters.deployment_area, options.deployment_areas])

  function apply(next: OddyseaFilters) {
    startTransition(() => {
      router.push(`${pathname}${filtersToQuery(next)}`)
    })
  }

  function patch(partial: Partial<OddyseaFilters>) {
    const next = { ...filters, ...partial }
    if (partial.state !== undefined && partial.state !== filters.state) next.lga = ''
    if (partial.deployment_area) {
      const area = options.deployment_areas.find((a) => a.id === partial.deployment_area)
      if (area && !next.state) next.state = area.state
    }
    apply(next)
  }

  function exportAll() {
    const stamp = formatStamp(report.range.label)
    downloadCsv(
      `oddysea-shs-connections-${stamp}.csv`,
      rowsToCsv(report.shs_connections as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-subsidy-by-state-${stamp}.csv`,
      rowsToCsv(report.subsidy_claim_summary.by_state as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-installation-evidence-${stamp}.csv`,
      rowsToCsv(report.installation_evidence as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-gps-verification-${stamp}.csv`,
      rowsToCsv(report.gps_verification as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-sales-inventory-${stamp}.csv`,
      rowsToCsv(report.sales_inventory as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-payment-tracking-${stamp}.csv`,
      rowsToCsv(report.payment_tracking as unknown as Record<string, unknown>[])
    )
    downloadCsv(
      `oddysea-outstanding-issues-${stamp}.csv`,
      rowsToCsv(report.outstanding_issues as unknown as Record<string, unknown>[])
    )
  }

  const s = report.summary

  return (
    <PageShell>
      <PageHeader
        title="ODDYSEA Reports"
        description={`SHS subsidy reporting pack · ${report.range.label}${pending ? ' · updating…' : ''}`}
        actions={
          <Button type="button" className="gap-2" onClick={exportAll}>
            <Download className="size-4" />
            Export all CSVs
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={filters.period === p.id ? 'default' : 'outline'}
            onClick={() =>
              patch(
                p.id === 'all'
                  ? { period: 'all', state: '', lga: '', deployment_area: '', from: '', to: '' }
                  : { period: p.id }
              )
            }
          >
            {p.label}
          </Button>
        ))}
      </div>

      {filters.period !== 'all' && (
      <Panel title="Report filters" description="Scope the ODDYSEA pack by period and geography">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              disabled={!filters.state}
              placeholder="Search LGA…"
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
        </div>
      </Panel>
      )}

      <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5', pending && 'opacity-70')}>
        {[
          { label: 'SHS connections', value: formatNumber(s.shs_connections) },
          { label: 'Eligible claims', value: formatNumber(s.eligible_claims) },
          { label: 'Pending claims', value: formatNumber(s.pending_claims) },
          { label: 'GPS verified', value: formatNumber(s.gps_verified) },
          { label: 'GPS flagged', value: formatNumber(s.gps_flagged) },
          { label: 'Payments', value: formatNumber(s.payments_recorded) },
          { label: 'Outstanding ₦', value: formatCurrency(s.outstanding_amount) },
          { label: 'Open warranty claims', value: formatNumber(s.open_warranty_claims) },
          { label: 'Outstanding issues', value: formatNumber(s.outstanding_issues) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={section === item.id ? 'default' : 'outline'}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {section === 'connections' && (
        <Panel
          title="1. SHS connections — customer master"
          description="Beneficiary master data linked to sales in this period"
          action={
            <ExportButton
              label="Export CSV"
              filename={`oddysea-shs-connections-${formatStamp(report.range.label)}.csv`}
              rows={report.shs_connections as unknown as Record<string, unknown>[]}
            />
          }
        >
          <DataTable
            empty="No SHS connections in this period"
            rows={report.shs_connections as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'name', label: 'Beneficiary' },
              { key: 'phone', label: 'Phone' },
              {
                key: 'state',
                label: 'Location',
                render: (r) => `${r.lga || '—'}, ${r.state || '—'}`,
              },
              { key: 'subsidy_level', label: 'Subsidy' },
              {
                key: 'sale_date',
                label: 'Sale date',
                render: (r) => formatDate(new Date(String(r.sale_date))),
              },
              { key: 'payment_type', label: 'Pay type' },
              { key: 'sale_status', label: 'Status' },
              {
                key: 'total_amount',
                label: 'Amount',
                render: (r) => formatCurrency(Number(r.total_amount) || 0),
              },
            ]}
          />
        </Panel>
      )}

      {section === 'subsidy' && (
        <div className="space-y-6">
          <Panel
            title="2. Monthly subsidy claim summary"
            description="Eligible = GPS verified + site photo + not cancelled. Pending = missing evidence or out-of-area GPS."
            action={
              <ExportButton
                label="Export by state"
                filename={`oddysea-subsidy-by-state-${formatStamp(report.range.label)}.csv`}
                rows={report.subsidy_claim_summary.by_state as unknown as Record<string, unknown>[]}
              />
            }
          >
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              {report.subsidy_claim_summary.by_tier.map((tier) => (
                <div
                  key={tier.subsidy_level}
                  className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-3"
                >
                  <p className="text-sm font-medium">{tier.subsidy_label}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tier.connections} connections · {tier.eligible} eligible · {tier.pending}{' '}
                    pending
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold tabular-nums">
                    {formatCurrency(tier.sales_value)}
                  </p>
                </div>
              ))}
            </div>
            <DataTable
              empty="No subsidy rows"
              rows={report.subsidy_claim_summary.by_state as unknown as Record<string, unknown>[]}
              columns={[
                { key: 'state', label: 'State' },
                { key: 'subsidy_level', label: 'Tier' },
                { key: 'connections', label: 'Connections' },
                { key: 'eligible', label: 'Eligible' },
                { key: 'pending', label: 'Pending' },
                {
                  key: 'sales_value',
                  label: 'Sales value',
                  render: (r) => formatCurrency(Number(r.sales_value) || 0),
                },
              ]}
            />
          </Panel>
          <Panel title="By month" description="Claim volume across months in view">
            <DataTable
              empty="No monthly rows"
              rows={report.subsidy_claim_summary.monthly as unknown as Record<string, unknown>[]}
              columns={[
                { key: 'month', label: 'Month' },
                { key: 'connections', label: 'Connections' },
                { key: 'eligible', label: 'Eligible' },
                { key: 'pending', label: 'Pending' },
                {
                  key: 'sales_value',
                  label: 'Sales value',
                  render: (r) => formatCurrency(Number(r.sales_value) || 0),
                },
              ]}
            />
          </Panel>
        </div>
      )}

      {section === 'evidence' && (
        <Panel
          title="3. Installation evidence"
          description="Site photos and KYC / sales form uploads"
          action={
            <ExportButton
              label="Export CSV"
              filename={`oddysea-installation-evidence-${formatStamp(report.range.label)}.csv`}
              rows={report.installation_evidence as unknown as Record<string, unknown>[]}
            />
          }
        >
          <DataTable
            empty="No installation evidence rows"
            rows={report.installation_evidence as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'beneficiary_name', label: 'Beneficiary' },
              {
                key: 'state',
                label: 'Location',
                render: (r) => `${r.lga || '—'}, ${r.state || '—'}`,
              },
              {
                key: 'has_site_photo',
                label: 'Site photo',
                render: (r) =>
                  r.has_site_photo ? (
                    r.site_photo_url ? (
                      <a
                        href={String(r.site_photo_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      'Yes'
                    )
                  ) : (
                    <span className="text-destructive">Missing</span>
                  ),
              },
              { key: 'kyc_documents', label: 'KYC docs' },
              { key: 'sales_form_documents', label: 'Sales forms' },
              {
                key: 'evidence_complete',
                label: 'Complete',
                render: (r) => (r.evidence_complete ? 'Yes' : 'No'),
              },
            ]}
          />
        </Panel>
      )}

      {section === 'gps' && (
        <Panel
          title="4. GPS verification of sales"
          description="Locked coordinates and out-of-area flags"
          action={
            <ExportButton
              label="Export CSV"
              filename={`oddysea-gps-verification-${formatStamp(report.range.label)}.csv`}
              rows={report.gps_verification as unknown as Record<string, unknown>[]}
            />
          }
        >
          <DataTable
            empty="No GPS rows"
            rows={report.gps_verification as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'beneficiary_name', label: 'Beneficiary' },
              {
                key: 'state',
                label: 'Location',
                render: (r) => `${r.lga || '—'}, ${r.state || '—'}`,
              },
              {
                key: 'latitude',
                label: 'Lat / Lng',
                render: (r) =>
                  r.latitude != null && r.longitude != null
                    ? `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`
                    : '—',
              },
              {
                key: 'gps_captured_at',
                label: 'Captured',
                render: (r) =>
                  r.gps_captured_at ? formatDate(new Date(String(r.gps_captured_at))) : '—',
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => (
                  <span
                    className={cn(
                      'capitalize',
                      r.status === 'verified' && 'text-emerald-700 dark:text-emerald-400',
                      r.status === 'flagged' && 'text-amber-700 dark:text-amber-300',
                      r.status === 'missing' && 'text-destructive'
                    )}
                  >
                    {String(r.status)}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {section === 'inventory' && (
        <Panel
          title="5. Sales inventory — product serials"
          description="Devices registered against sales in this period"
          action={
            <ExportButton
              label="Export CSV"
              filename={`oddysea-sales-inventory-${formatStamp(report.range.label)}.csv`}
              rows={report.sales_inventory as unknown as Record<string, unknown>[]}
            />
          }
        >
          <DataTable
            empty="No serials registered for sales in this period"
            rows={report.sales_inventory as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'serial_number', label: 'Serial' },
              { key: 'product_name', label: 'Product' },
              { key: 'product_sku', label: 'SKU' },
              { key: 'beneficiary_name', label: 'Beneficiary' },
              { key: 'state', label: 'State' },
              { key: 'sale_id', label: 'Sale ID' },
            ]}
          />
        </Panel>
      )}

      {section === 'payments' && (
        <Panel
          title="6. Payment tracking (PAYGO / cash / transfer)"
          description="Collections linked to period sales"
          action={
            <ExportButton
              label="Export CSV"
              filename={`oddysea-payment-tracking-${formatStamp(report.range.label)}.csv`}
              rows={report.payment_tracking as unknown as Record<string, unknown>[]}
            />
          }
        >
          <DataTable
            empty="No payments for sales in this period"
            rows={report.payment_tracking as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: 'date',
                label: 'Date',
                render: (r) => formatDate(new Date(String(r.date))),
              },
              { key: 'beneficiary_name', label: 'Beneficiary' },
              {
                key: 'amount',
                label: 'Amount',
                render: (r) => formatCurrency(Number(r.amount) || 0),
              },
              { key: 'method', label: 'Method' },
              { key: 'payment_type', label: 'Type' },
              {
                key: 'is_partial',
                label: 'Partial',
                render: (r) => (r.is_partial ? 'Yes' : 'No'),
              },
              {
                key: 'validity_days',
                label: 'Validity days',
                render: (r) => (r.validity_days != null ? String(r.validity_days) : '—'),
              },
              { key: 'reference', label: 'Reference' },
            ]}
          />
        </Panel>
      )}

      {section === 'claims' && (
        <div className="space-y-6">
          <Panel title="7. Total claims summary" description="Eligibility and open issues overview">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Object.entries(report.claims_overview).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-3"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Pending claims / outstanding issues"
            description="Missing evidence, GPS problems, payment arrears, warranty claims"
            action={
              <ExportButton
                label="Export CSV"
                filename={`oddysea-outstanding-issues-${formatStamp(report.range.label)}.csv`}
                rows={report.outstanding_issues as unknown as Record<string, unknown>[]}
              />
            }
          >
            <DataTable
              empty="No outstanding issues in this view"
              rows={report.outstanding_issues as unknown as Record<string, unknown>[]}
              columns={[
                { key: 'severity', label: 'Severity' },
                { key: 'issue_type', label: 'Issue' },
                { key: 'beneficiary_name', label: 'Beneficiary' },
                { key: 'state', label: 'State' },
                { key: 'detail', label: 'Detail' },
                {
                  key: 'date',
                  label: 'Date',
                  render: (r) => formatDate(new Date(String(r.date))),
                },
              ]}
            />
          </Panel>
        </div>
      )}
    </PageShell>
  )
}

function formatStamp(label: string) {
  return label.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'report'
}
