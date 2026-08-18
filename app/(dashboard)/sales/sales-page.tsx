'use client'

import { useMemo, useState, Fragment, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, CreditCard, CalendarClock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { deleteSaleAction } from '@/app/actions/sales'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type {
  Customer,
  Installment,
  PaymentSchedule,
  PaymentType,
  Sale,
} from '@/lib/types/crm'
import { cn } from '@/lib/utils'

export default function SalesPage({
  sales,
  customers: customersList,
  schedules: schedulesList,
  isAdmin = false,
}: {
  sales: Sale[]
  customers: Customer[]
  schedules: PaymentSchedule[]
  isAdmin?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createdId = searchParams.get('created')
  const createdInvoice = searchParams.get('invoice')
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType | ''>('')
  const [expandedSale, setExpandedSale] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  const stats = useMemo(() => {
    const total_revenue = sales.reduce((sum, s) => sum + s.total_amount, 0)
    const total_collected = sales.reduce((sum, s) => sum + s.amount_paid, 0)
    const by_status: Record<Sale['status'], number> = {
      pending_payment: 0,
      partial: 0,
      paid: 0,
      completed: 0,
      cancelled: 0,
    }
    const by_payment_type = { full: 0, installment: 0 }
    sales.forEach((s) => {
      by_status[s.status]++
      by_payment_type[s.payment_type]++
    })
    const active_installments = schedulesList.filter(
      (sch) => sch.payment_type === 'installment' && sch.paid_amount < sch.total_amount
    ).length

    return {
      total_revenue,
      total_collected,
      outstanding: total_revenue - total_collected,
      avg_sale_value: sales.length ? total_revenue / sales.length : 0,
      by_status,
      by_payment_type,
      active_installments,
    }
  }, [sales, schedulesList])

  const statuses: Array<{ label: string; value: Sale['status'] }> = [
    { label: 'Pending Payment', value: 'pending_payment' },
    { label: 'Partial', value: 'partial' },
    { label: 'Paid', value: 'paid' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  const filteredSales = useMemo(() => {
    let filtered = sales

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((s) => {
        const customer = customers.get(s.customer_id)
        return (
          s.id.toLowerCase().includes(q) ||
          customer?.name.toLowerCase().includes(q) ||
          customer?.email.toLowerCase().includes(q)
        )
      })
    }

    if (selectedStatus) filtered = filtered.filter((s) => s.status === selectedStatus)
    if (selectedPaymentType) filtered = filtered.filter((s) => s.payment_type === selectedPaymentType)

    return filtered
  }, [search, selectedStatus, selectedPaymentType, sales, customers])

  const statusColors: Record<Sale['status'], string> = {
    pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    partial: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  }

  function handleDelete(sale: Sale) {
    const customer = customers.get(sale.customer_id)
    const ok = window.confirm(
      `Delete ${sale.id}${customer ? ` (${customer.name})` : ''}?\n\nThis restores product stock, removes the invoice/schedule/warranties, and cannot be undone.`
    )
    if (!ok) return

    setActionError(null)
    setDeletingId(sale.id)
    startTransition(async () => {
      const result = await deleteSaleAction(sale.id)
      setDeletingId(null)
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
            : 'Every sale is either full payment or weekly installment'
        }
        actions={
          <Link href="/sales/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              New Sale
            </Button>
          </Link>
        }
      />

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {createdId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Sale <span className="font-semibold">{createdId}</span> created
          {createdInvoice ? (
            <>
              {' '}
              — invoice <span className="font-semibold">{createdInvoice}</span> generated, and
              inventory stock was subtracted automatically.
            </>
          ) : (
            ' — inventory stock was subtracted automatically.'
          )}{' '}
          <Link href="/invoices" className="font-medium underline underline-offset-2">
            View invoices
          </Link>
          {' · '}
          <Link href="/inventory" className="font-medium underline underline-offset-2">
            View inventory
          </Link>
        </div>
      )}

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

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search by customer or sale ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  'Amount',
                  'Paid',
                  'Status',
                  'Schedule',
                  ...(isAdmin ? ['Action'] : []),
                ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        i === 4 || i === 5 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredSales.slice(0, 50).map((sale) => {
                const customer = customers.get(sale.customer_id)
                const schedule = schedules.get(sale.id)
                const isExpanded = expandedSale === sale.id
                const colSpan = isAdmin ? 9 : 8

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
                          {sale.payment_type === 'full' ? 'Full' : `${sale.installment_weeks}-week`}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums">
                        {formatCurrency(sale.total_amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(sale.amount_paid)}
                      </td>
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
                      <td className="px-5 py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedSale(isExpanded ? null : sale.id)}
                        >
                          {isExpanded ? 'Hide' : 'Timeline'}
                        </Button>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
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
                        </td>
                      )}
                    </tr>
                    {isExpanded && schedule && (
                      <tr className="bg-secondary/30">
                        <td colSpan={colSpan} className="px-5 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {sale.payment_type === 'full'
                              ? 'Full payment timeline'
                              : `Weekly installment timeline (${sale.installment_weeks} weeks)`}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                                  <p className="text-xs font-semibold">Week {inst.week_number}</p>
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {inst.status}
                                  </span>
                                </div>
                                <p className="mt-1 font-display text-sm font-semibold tabular-nums">
                                  {formatCurrency(inst.amount)}
                                </p>
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
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
    </PageShell>
  )
}
