'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, AlertTriangle, CheckCircle, FileWarning } from 'lucide-react'
import { KpiCard } from '@/components/common/KpiCard'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createWarrantyClaimAction,
  registerWarrantyAction,
  updateWarrantyClaimAction,
} from '@/app/actions/warranties'
import type { WarrantyDisplayStatus } from '@/lib/types/crm'
import type { WarrantyWithDetails } from '@/lib/services/warranties'
import { formatDate } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'

const WARRANTY_PERIODS = [12, 24, 36] as const
const FILTER_STATUSES: Array<WarrantyDisplayStatus | 'All'> = [
  'All',
  'Needs serial',
  'Active',
  'Expiring Soon',
  'Expired',
  'Claimed',
]

const statusStyles: Record<WarrantyDisplayStatus, string> = {
  'Needs serial': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Expiring Soon': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  Claimed: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
}

export function WarrantyPageClient({ warranties }: { warranties: WarrantyWithDetails[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<WarrantyDisplayStatus | 'All'>('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [serial, setSerial] = useState('')
  const [period, setPeriod] = useState<12 | 24 | 36>(24)
  const [claimIssue, setClaimIssue] = useState('')
  const [claimResolution, setClaimResolution] = useState('')

  const selected = useMemo(
    () => warranties.find((w) => w.id === selectedId) ?? null,
    [warranties, selectedId]
  )

  const filtered = useMemo(() => {
    return warranties.filter((warranty) => {
      const q = searchTerm.toLowerCase()
      const matchesSearch =
        !q ||
        warranty.customer_name.toLowerCase().includes(q) ||
        warranty.product_name.toLowerCase().includes(q) ||
        warranty.id.toLowerCase().includes(q) ||
        warranty.serial_number.toLowerCase().includes(q) ||
        warranty.sale_id.toLowerCase().includes(q)
      const matchesStatus =
        statusFilter === 'All' || warranty.display_status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [warranties, searchTerm, statusFilter])

  const stats = {
    total: warranties.length,
    active: warranties.filter((w) => w.display_status === 'Active').length,
    expiringSoon: warranties.filter((w) => w.display_status === 'Expiring Soon').length,
    needsSerial: warranties.filter((w) => w.display_status === 'Needs serial').length,
  }

  function selectWarranty(warranty: WarrantyWithDetails) {
    setSelectedId(warranty.id)
    setError(null)
    setSerial(warranty.serial_number)
    setPeriod(
      ([12, 24, 36].includes(warranty.warranty_period_months)
        ? warranty.warranty_period_months
        : 24) as 12 | 24 | 36
    )
    setClaimIssue('')
    setClaimResolution('')
  }

  function refresh() {
    router.refresh()
  }

  function onRegister() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result = await registerWarrantyAction({
        warranty_id: selected.id,
        serial_number: serial,
        warranty_period_months: period,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      refresh()
    })
  }

  function onOpenClaim() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result = await createWarrantyClaimAction({
        warranty_id: selected.id,
        issue_description: claimIssue,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setClaimIssue('')
      refresh()
    })
  }

  function onUpdateClaim(
    claimId: string,
    status: 'approved' | 'rejected' | 'resolved' | 'pending'
  ) {
    setError(null)
    startTransition(async () => {
      const result = await updateWarrantyClaimAction({
        claim_id: claimId,
        status,
        resolution: claimResolution,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setClaimResolution('')
      refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Warranty Management"
        description="Warranties are created with each sale — register serials and manage claims here"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={Shield} title="Active" value={stats.active} variant="success" />
        <KpiCard
          icon={AlertTriangle}
          title="Expiring Soon"
          value={stats.expiringSoon}
          variant="warning"
        />
        <KpiCard
          icon={FileWarning}
          title="Needs serial"
          value={stats.needsSerial}
          variant="warning"
        />
        <KpiCard icon={CheckCircle} title="Total" value={stats.total} />
      </div>

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search by customer, product, serial, sale, or ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {FILTER_STATUSES.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                onClick={() => setStatusFilter(status)}
                size="sm"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/40">
                  {[
                    'Warranty',
                    'Customer',
                    'Product',
                    'Serial',
                    'Sale',
                    'Expires',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((warranty) => (
                  <tr
                    key={warranty.id}
                    onClick={() => selectWarranty(warranty)}
                    className={cn(
                      'cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40',
                      selectedId === warranty.id && 'bg-primary/5'
                    )}
                  >
                    <td className="px-5 py-4 font-medium">{warranty.id}</td>
                    <td className="px-5 py-4">{warranty.customer_name}</td>
                    <td className="px-5 py-4 text-sm">{warranty.product_name}</td>
                    <td className="px-5 py-4 font-mono text-sm">
                      {warranty.serial_number || '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {warranty.sale_id}
                    </td>
                    <td className="px-5 py-4 text-sm">{formatDate(warranty.expiry_date)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                          statusStyles[warranty.display_status]
                        )}
                      >
                        {warranty.display_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="font-medium">
                {warranties.length === 0 ? 'No warranties yet' : 'No warranties found'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {warranties.length === 0
                  ? 'Create a sale to generate warranty records automatically'
                  : 'Try adjusting your search or filters'}
              </p>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title={selected ? `Manage ${selected.id}` : 'Select a warranty'}
            description={
              selected
                ? `${selected.product_name} · ${selected.customer_name}`
                : 'Click a row to register a serial or open a claim'
            }
          >
            {!selected ? (
              <p className="text-sm text-muted-foreground">No warranty selected.</p>
            ) : (
              <div className="space-y-5">
                {error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Register serial
                  </p>
                  <div>
                    <Label htmlFor="serial">Serial number</Label>
                    <Input
                      id="serial"
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      placeholder="e.g. SN-ABC-12345"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="period">Warranty period</Label>
                    <Select
                      id="period"
                      value={String(period)}
                      onChange={(e) =>
                        setPeriod(Number(e.target.value) as 12 | 24 | 36)
                      }
                      className="mt-1.5"
                    >
                      {WARRANTY_PERIODS.map((months) => (
                        <option key={months} value={months}>
                          {months} months
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={onRegister} disabled={isPending} className="w-full">
                    Save serial & period
                  </Button>
                </div>

                <div className="space-y-3 border-t border-border/70 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Open claim
                  </p>
                  <div>
                    <Label htmlFor="issue">Issue description</Label>
                    <Textarea
                      id="issue"
                      value={claimIssue}
                      onChange={(e) => setClaimIssue(e.target.value)}
                      placeholder="Describe the fault or customer complaint…"
                      className="mt-1.5"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={onOpenClaim}
                    disabled={isPending || !selected.serial_number}
                    className="w-full"
                  >
                    Open claim
                  </Button>
                  {!selected.serial_number && (
                    <p className="text-xs text-muted-foreground">
                      Register a serial number before opening a claim.
                    </p>
                  )}
                </div>

                {selected.claims.length > 0 && (
                  <div className="space-y-3 border-t border-border/70 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Claims
                    </p>
                    <div>
                      <Label htmlFor="resolution">Resolution note</Label>
                      <Textarea
                        id="resolution"
                        value={claimResolution}
                        onChange={(e) => setClaimResolution(e.target.value)}
                        placeholder="Required when rejecting or resolving…"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="space-y-3">
                      {selected.claims.map((claim) => (
                        <div
                          key={claim.id}
                          className="rounded-lg border border-border/70 bg-secondary/30 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{claim.id}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {claim.issue_description}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDate(claim.claim_date)} · {claim.status}
                              </p>
                              {claim.resolution && (
                                <p className="mt-1 text-xs">Resolution: {claim.resolution}</p>
                              )}
                            </div>
                          </div>
                          {(claim.status === 'pending' || claim.status === 'approved') && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {claim.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() => onUpdateClaim(claim.id, 'approved')}
                                >
                                  Approve
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => onUpdateClaim(claim.id, 'rejected')}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                disabled={isPending}
                                onClick={() => onUpdateClaim(claim.id, 'resolved')}
                              >
                                Resolve
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
