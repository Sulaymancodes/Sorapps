'use client'

import { useMemo, useState, Fragment, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, CreditCard, CalendarClock, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { TablePagination, usePagedList } from '@/components/common/TablePagination'
import { deleteSaleAction } from '@/app/actions/sales'
import { SaleCreatedModal } from '@/components/sales/SaleCreatedModal'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { getLgasForState } from '@/lib/constants/lgas'
import { todayInLagos, toDateInputValue } from '@/lib/paygo/schedule'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type {
  Customer,
  Installment,
  PaymentSchedule,
  PaymentType,
  Sale,
} from '@/lib/types/crm'
import { cn } from '@/lib/utils'

function paymentPlanLabel(sale: Sale) {
  if (sale.payment_type === 'full') return 'Full'
  if (sale.installment_interval_days && sale.plan_end_date) {
    return `Every ${sale.installment_interval_days}d · ends ${formatDate(sale.plan_end_date)}`
  }
  if (sale.installment_weeks) return `${sale.installment_weeks}-week`
  return 'Installment'
}

function paymentPlanDetail(sale: Sale) {
  if (sale.payment_type === 'full') return 'Full payment timeline'
  if (sale.installment_interval_days && sale.plan_end_date) {
    return `PAYGO every ${sale.installment_interval_days} days through ${formatDate(sale.plan_end_date)}`
  }
  if (sale.installment_weeks) {
    return `Weekly installment timeline (${sale.installment_weeks} weeks)`
  }
  return 'Installment timeline'
}

function lagosDayKey(value: Date | string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export default function SalesPage({
  sales,
  customers: customersList,
  schedules: schedulesList,
  isAdmin = false,
  assignedLga = '',
  assignedState = '',
}: {
  sales: Sale[]
  customers: Customer[]
  schedules: PaymentSchedule[]
  isAdmin?: boolean
  assignedLga?: string
  assignedState?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createdId = searchParams.get('created')
  const createdInvoice = searchParams.get('invoice')
  const offline = useOfflineSyncOptional()
  const saleDraftCount = offline?.saleDrafts.length ?? 0
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType | ''>('')
  const [selectedState, setSelectedState] = useState('')
  const [selectedLga, setSelectedLga] = useState('')
  const [expandedSale, setExpandedSale] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null)

  const customers = useMemo(() => {
    const map = new Map<string, Customer>()
    customersList.forEach((c) => map.set(c.id, c))
    return map
  }, [customersList])

  const schedules = useMemo(() => {
    const map = new Map<string, PaymentSchedule>()
    schedulesList.forEach((s) => map.set(s.sale_id, s))
    return map
  }, [schedulesList])

  const lgaOptions = useMemo(() => getLgasForState(selectedState), [selectedState])

  const geoSales = useMemo(() => {
    if (!selectedState) return sales
    const stateKey = selectedState.trim().toLowerCase()
    const lgaKey = selectedLga.trim().toLowerCase()
    return sales.filter((s) => {
      const customer = customers.get(s.customer_id)
      if ((customer?.state || '').trim().toLowerCase() !== stateKey) return false
      if (lgaKey && (customer?.lga || '').trim().toLowerCase() !== lgaKey) return false
      return true
    })
  }, [sales, customers, selectedState, selectedLga])

  const stats = useMemo(() => {
    const total_revenue = geoSales.reduce((sum, s) => sum + s.total_amount, 0)
    const total_collected = geoSales.reduce((sum, s) => sum + s.amount_paid, 0)
    const by_status: Record<Sale['status'], number> = {
      pending_payment: 0,
      partial: 0,
      paid: 0,
      completed: 0,
      cancelled: 0,
    }
    const by_payment_type = { full: 0, installment: 0 }
    geoSales.forEach((s) => {
      by_status[s.status]++
      by_payment_type[s.payment_type]++
    })
    const geoSaleIds = new Set(geoSales.map((s) => s.id))
    const active_installments = schedulesList.filter(
      (sch) =>
        geoSaleIds.has(sch.sale_id) &&
        sch.payment_type === 'installment' &&
        sch.paid_amount < sch.total_amount
    ).length

    return {
      total_revenue,
      total_collected,
      outstanding: total_revenue - total_collected,
      avg_sale_value: geoSales.length ? total_revenue / geoSales.length : 0,
      by_status,
      by_payment_type,
      active_installments,
    }
  }, [geoSales, schedulesList])

  const todayKey = toDateInputValue(todayInLagos())
  const todayCount = useMemo(
    () => sales.filter((s) => lagosDayKey(s.date) === todayKey).length,
    [sales, todayKey]
  )
  const territoryLabel = [assignedLga, assignedState].filter(Boolean).join(', ')

  const statuses: Array<{ label: string; value: Sale['status'] }> = [
    { label: 'Pending Payment', value: 'pending_payment' },
    { label: 'Partial', value: 'partial' },
    { label: 'Paid', value: 'paid' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  const filteredSales = useMemo(() => {
    let filtered = geoSales

    if (search) {
      const q = search.toLowerCase()
      const qDigits = q.replace(/\D/g, '')
      filtered = filtered.filter((s) => {
        const customer = customers.get(s.customer_id)
        const haystack = [
          s.id,
          s.status,
          s.payment_type,
          s.notes,
          s.unlock_pin,
          customer?.id,
          customer?.name,
          customer?.email,
          customer?.phone,
          customer?.guardian_phone,
          customer?.nin,
          customer?.bvn,
        ]
        return haystack.some((value) => {
          const raw = String(value || '')
          if (raw.toLowerCase().includes(q)) return true
          if (qDigits.length >= 4 && raw.replace(/\D/g, '').includes(qDigits)) return true
          return false
        })
      })
    }

    if (selectedStatus) filtered = filtered.filter((s) => s.status === selectedStatus)
    if (selectedPaymentType) filtered = filtered.filter((s) => s.payment_type === selectedPaymentType)

    return filtered
  }, [search, selectedStatus, selectedPaymentType, geoSales, customers])

  const { page, setPage, paged, total } = usePagedList(
    filteredSales,
    `${search}|${selectedStatus}|${selectedPaymentType}|${selectedState}|${selectedLga}`
  )

  const statusColors: Record<Sale['status'], string> = {
    pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    partial: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  }

  function handleDelete(sale: Sale) {
    setActionError(null)
    setSaleToDelete(sale)
  }

  function confirmDelete() {
    const sale = saleToDelete
    if (!sale) return
    setDeletingId(sale.id)
    startTransition(async () => {
      const result = await deleteSaleAction(sale.id)
      setDeletingId(null)
      setSaleToDelete(null)
      if (!result.success) {
        setActionError(result.error)
        return
      }
      if (expandedSale === sale.id) setExpandedSale(null)
      router.refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Sales"
        description={
          sales.length === 0
            ? 'No sales yet — add customers and products, then create your first sale'
            : isAdmin
              ? 'Every sale is either full payment or weekly installment'
              : territoryLabel
                ? `${territoryLabel}`
                : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/drafts">
              <Button variant="outline" className="gap-2">
                Drafts
                {saleDraftCount > 0 ? ` (${saleDraftCount})` : ''}
              </Button>
            </Link>
            <Link href="/sales/new">
              <Button className="gap-2">
                <Plus className="size-4" />
                New Sale
              </Button>
            </Link>
          </div>
        }
      />

      {saleDraftCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            {saleDraftCount} sale {saleDraftCount === 1 ? 'draft' : 'drafts'} on this device waiting
            to sync (KYC, site photo, and GPS included).
          </p>
          <Link href="/sales/drafts" className="font-medium underline-offset-2 hover:underline">
            Review drafts
          </Link>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {createdId && (
        <SaleCreatedModal
          saleId={createdId}
          invoiceId={isAdmin ? createdInvoice : null}
          unlockPin={searchParams.get('unlock_pin')}
          showFinanceLinks={isAdmin}
        />
      )}

      {!isAdmin && (
        <div className="grid grid-cols-2 gap-4">
          <div className="surface-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Today{territoryLabel ? ` · ${territoryLabel}` : ''}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{todayCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todayCount === 1 ? 'sale entered today' : 'sales entered today'}
            </p>
          </div>
          <div className="surface-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total sales{territoryLabel ? ` · ${territoryLabel}` : ''}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{sales.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">All sales in this LGA</p>
          </div>
        </div>
      )}

      {isAdmin && (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelectedPaymentType(selectedPaymentType === 'full' ? '' : 'full')}
          className={cn(
            'flex items-start gap-4 rounded-xl border p-5 text-left transition-all',
            selectedPaymentType === 'full'
              ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
              : 'border-border/80 bg-card hover:border-primary/40'
          )}
        >
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CreditCard className="size-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">Full Payment</p>
            <p className="mt-1 text-sm text-muted-foreground">Customer pays the full amount in one go</p>
            <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
              {stats.by_payment_type.full}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setSelectedPaymentType(selectedPaymentType === 'installment' ? '' : 'installment')
          }
          className={cn(
            'flex items-start gap-4 rounded-xl border p-5 text-left transition-all',
            selectedPaymentType === 'installment'
              ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
              : 'border-border/80 bg-card hover:border-accent/40'
          )}
        >
          <div className="flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">Installment Payment</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Spread across weekly timelines with due reminders
            </p>
            <p className="mt-3 font-display text-2xl font-semibold tabular-nums">
              {stats.by_payment_type.installment}
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                ({stats.active_installments} active)
              </span>
            </p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {statuses.map((status) => (
          <button
            key={status.value}
            type="button"
            onClick={() => setSelectedStatus(selectedStatus === status.value ? '' : status.value)}
            className={cn(
              'rounded-xl border px-3 py-3 text-center transition-all',
              selectedStatus === status.value
                ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                : 'border-border/80 bg-card hover:border-primary/40'
            )}
          >
            <p className="font-display text-lg font-semibold tabular-nums">
              {stats.by_status[status.value] || 0}
            </p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {status.label}
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Sales Value', value: formatCurrency(stats.total_revenue) },
          {
            label: 'Collected',
            value: formatCurrency(stats.total_collected),
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.outstanding),
            className: 'text-accent',
          },
          { label: 'Avg Sale', value: formatCurrency(stats.avg_sale_value) },
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
      </>
      )}

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search sale ID, name, phone, NIN, BVN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payment Type
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedPaymentType}
                onChange={(e) => setSelectedPaymentType(e.target.value as PaymentType | '')}
              >
                <option value="">All Types</option>
                <option value="full">Full Payment</option>
                <option value="installment">Installment</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                State
              </label>
              <div className="mt-1.5">
                <SearchableSelect
                  options={['All states', ...NIGERIAN_STATES]}
                  value={selectedState || 'All states'}
                  onChange={(v) => {
                    setSelectedState(v === 'All states' ? '' : v)
                    setSelectedLga('')
                  }}
                  placeholder="Search state…"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                LGA
              </label>
              <div className="mt-1.5">
                <SearchableSelect
                  options={selectedState ? ['All LGAs', ...lgaOptions] : ['Select a state first']}
                  value={
                    selectedLga || (selectedState ? 'All LGAs' : 'Select a state first')
                  }
                  onChange={(v) =>
                    setSelectedLga(v === 'All LGAs' || v === 'Select a state first' ? '' : v)
                  }
                  disabled={!selectedState}
                  placeholder="Search LGA…"
                />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                {[
                  'Sale ID',
                  'Customer',
                  'Date',
                  'Payment',
                  ...(isAdmin ? ['Amount', 'Paid'] : []),
                  'Status',
                  'PIN',
                  'Details',
                  ...(isAdmin ? ['Action'] : []),
                ].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        h === 'Amount' || h === 'Paid' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((sale) => {
                const customer = customers.get(sale.customer_id)
                const schedule = schedules.get(sale.id)
                const isExpanded = expandedSale === sale.id
                const colSpan = isAdmin ? 10 : 7

                return (
                  <Fragment key={sale.id}>
                    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-4 text-sm font-medium">{sale.id}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium">{customer?.name}</p>
                        <p className="text-xs text-muted-foreground">{customer?.business_type}</p>
                      </td>
                      <td className="px-5 py-4 text-sm">{formatDate(sale.date)}</td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                            sale.payment_type === 'full'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-accent/10 text-accent'
                          )}
                        >
                          {paymentPlanLabel(sale)}
                        </span>
                      </td>
                      {isAdmin && (
                        <>
                      <td className="px-5 py-4 text-right font-medium tabular-nums">
                        {formatCurrency(sale.total_amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(sale.amount_paid)}
                      </td>
                        </>
                      )}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[sale.status]}`}
                        >
                          {sale.status
                            .split('_')
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm font-semibold tracking-wide">
                        {sale.unlock_pin || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedSale(isExpanded ? null : sale.id)}
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </Button>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/sales/${sale.id}/edit`}>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={isPending || deletingId === sale.id}
                              onClick={() => handleDelete(sale)}
                            >
                              <Trash2 className="size-3.5" />
                              {deletingId === sale.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-secondary/30">
                        <td colSpan={colSpan} className="px-5 py-4">
                          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                            <div className="space-y-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Unit photo
                              </p>
                              {sale.site_photo_url ? (
                                <a
                                  href={sale.site_photo_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-xl border border-border/70 bg-background"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sale.site_photo_url}
                                    alt={`Unit photo for ${sale.id}`}
                                    className="max-h-64 w-full object-cover"
                                  />
                                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                    Open full image
                                  </p>
                                </a>
                              ) : (
                                <p className="rounded-xl border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                                  No unit photo attached
                                </p>
                              )}

                              {(sale.latitude != null && sale.longitude != null) && (
                                <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-sm">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    GPS
                                  </p>
                                  <p className="mt-1 font-mono text-xs tabular-nums">
                                    {Number(sale.latitude).toFixed(6)},{' '}
                                    {Number(sale.longitude).toFixed(6)}
                                  </p>
                                  {sale.gps_captured_at && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Captured {formatDate(sale.gps_captured_at)}
                                    </p>
                                  )}
                                  {sale.gps_out_of_area && (
                                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                                      Out-of-area flag
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            <div>
                              {sale.unlock_pin ? (
                                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Unlock PIN
                                  </p>
                                  <p className="mt-1 font-mono text-xl font-semibold tracking-[0.18em] text-primary">
                                    {sale.unlock_pin}
                                  </p>
                                </div>
                              ) : null}
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {paymentPlanDetail(sale)}
                              </p>
                              {schedule ? (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {schedule.installments.map((inst: Installment) => (
                                    <div
                                      key={inst.id}
                                      className={cn(
                                        'rounded-lg border px-3 py-2.5',
                                        inst.status === 'paid' &&
                                          'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
                                        inst.status === 'overdue' &&
                                          'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
                                        inst.status === 'pending' && 'border-border/70 bg-card'
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold">
                                          Week {inst.week_number}
                                        </p>
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                          {inst.status}
                                        </span>
                                      </div>
                                      {isAdmin && (
                                      <p className="mt-1 font-display text-sm font-semibold tabular-nums">
                                        {formatCurrency(inst.amount)}
                                      </p>
                                      )}
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        Due {formatDate(inst.due_date)}
                                      </p>
                                      {inst.reminder && inst.status !== 'paid' && (
                                        <p className="mt-1 text-[11px] font-medium text-accent">
                                          Reminder active
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No payment schedule on this sale.
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredSales.length > 0 && (
          <TablePagination page={page} total={total} onPageChange={setPage} />
        )}
        {filteredSales.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">{sales.length === 0 ? 'No sales yet' : 'No sales found'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sales.length === 0
                ? 'Create a customer and product with stock, then add a sale'
                : 'Try adjusting your search or filters'}
            </p>
            {sales.length === 0 && (
              <Link href="/sales/new" className="mt-4 inline-block">
                <Button className="gap-2">
                  <Plus className="size-4" />
                  New Sale
                </Button>
              </Link>
            )}
          </div>
        )}
      </Panel>
      <ConfirmModal
        open={Boolean(saleToDelete)}
        title={
          saleToDelete
            ? `Delete ${saleToDelete.id}${
                customers.get(saleToDelete.customer_id)
                  ? ` (${customers.get(saleToDelete.customer_id)?.name})`
                  : ''
              }?`
            : 'Delete sale'
        }
        description="This restores product stock and removes the invoice, payment schedule, and warranties. This cannot be undone."
        pending={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setSaleToDelete(null)
        }}
        onConfirm={confirmDelete}
      />
    </PageShell>
  )
}
