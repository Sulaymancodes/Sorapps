'use client'

import { useMemo, useState } from 'react'
import { Download, Bell, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type {
  Customer,
  Invoice,
  Payment,
  PaymentReminder,
  PaymentSchedule,
} from '@/lib/types/crm'
import { cn } from '@/lib/utils'

export function PaymentsPageClient({
  payments,
  invoices,
  customers: customersList,
  reminders,
  schedules,
}: {
  payments: Payment[]
  invoices: Invoice[]
  customers: Customer[]
  reminders: PaymentReminder[]
  schedules: PaymentSchedule[]
}) {
  const [search, setSearch] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('')
  const [selectedType, setSelectedType] = useState('')

  const customers = useMemo(() => {
    const map = new Map<string, Customer>()
    customersList.forEach((c) => map.set(c.id, c))
    return map
  }, [customersList])

  const stats = useMemo(() => {
    const total = payments.reduce((sum, p) => sum + p.amount, 0)
    return {
      total_amount_collected: total,
      avg_payment: payments.length ? total / payments.length : 0,
      successful_payments: payments.filter((p) => p.status === 'success').length,
    }
  }, [payments])

  const outstanding = useMemo(() => {
    return invoices
      .filter((inv) => inv.paid_amount < inv.total_amount)
      .map((inv) => {
        const schedule = schedules.find((s) => s.invoice_id === inv.id)
        const next = schedule?.installments.find((i) => i.status !== 'paid')
        return {
          invoice_id: inv.id,
          sale_id: inv.sale_id,
          outstanding_amount: inv.total_amount - inv.paid_amount,
          days_overdue: Math.max(
            0,
            Math.floor(
              (Date.now() - (next?.due_date || inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
            )
          ),
          payment_type: schedule?.payment_type || 'full',
          next_week: next?.week_number,
        }
      })
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount)
  }, [invoices, schedules])

  const filteredPayments = useMemo(() => {
    let filtered = payments
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.reference.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.sale_id.toLowerCase().includes(q)
      )
    }
    if (selectedMethod) filtered = filtered.filter((p) => p.method === selectedMethod)
    if (selectedType) filtered = filtered.filter((p) => p.payment_type === selectedType)
    return filtered
  }, [payments, search, selectedMethod, selectedType])

  const totalOutstanding = outstanding.reduce((sum, o) => sum + o.outstanding_amount, 0)

  return (
    <PageShell>
      <PageHeader
        title="Payments"
        description="Collected payments, installment timelines, and due reminders"
        actions={
          <Button className="gap-2">
            <Download className="size-4" />
            Export
          </Button>
        }
      />

      {reminders.length > 0 && (
        <Panel
          title="Installment Reminders"
          description={`${reminders.length} upcoming or overdue weekly payments`}
          action={
            <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
              <Bell className="size-3.5" />
              Active
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {reminders.slice(0, 6).map((reminder) => {
              const customer = customers.get(reminder.customer_id)
              return (
                <div
                  key={reminder.id}
                  className={cn(
                    'rounded-xl border p-4',
                    reminder.status === 'overdue' &&
                      'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
                    reminder.status === 'due_today' &&
                      'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
                    reminder.status === 'due_soon' &&
                      'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{reminder.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {customer?.name} · Sale {reminder.sale_id} · Week {reminder.week_number}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="font-display text-sm font-semibold tabular-nums">
                          {formatCurrency(reminder.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(reminder.due_date)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            label: 'Total Collected',
            value: formatCurrency(stats.total_amount_collected),
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          { label: 'Avg Payment', value: formatCurrency(stats.avg_payment) },
          { label: 'Successful Payments', value: stats.successful_payments },
          {
            label: 'Total Outstanding',
            value: formatCurrency(totalOutstanding),
            className: 'text-accent',
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

      {outstanding.length > 0 && (
        <Panel title="Outstanding Payments" description="Balances still due on sales">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {outstanding.slice(0, 3).map((item) => (
              <div
                key={`${item.invoice_id}-${item.next_week || 'full'}`}
                className="rounded-xl border border-border/60 bg-secondary/40 p-4"
              >
                <p className="text-sm font-medium">
                  {item.payment_type === 'installment'
                    ? `Week ${item.next_week} · ${item.sale_id}`
                    : `Full · ${item.sale_id}`}
                </p>
                <p className="mt-1 font-display text-lg font-semibold tabular-nums text-accent">
                  {formatCurrency(item.outstanding_amount)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.days_overdue > 0 ? `${item.days_overdue} days overdue` : 'Due soon'}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search by reference, payment ID, or sale…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payment Method
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
              >
                <option value="">All Methods</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payment Type
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
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
                {['Payment ID', 'Sale', 'Type', 'Date', 'Amount', 'Method', 'Reference', 'Status'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        i === 4 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredPayments.slice(0, 50).map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-4 text-sm font-medium">{payment.id}</td>
                  <td className="px-5 py-4 text-sm">{payment.sale_id}</td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                        payment.payment_type === 'full'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-accent/10 text-accent'
                      )}
                    >
                      {payment.payment_type === 'full' ? 'Full' : `Week ${payment.week_number}`}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">{formatDate(payment.date)}</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-5 py-4 text-sm capitalize">{payment.method.replace('_', ' ')}</td>
                  <td className="px-5 py-4 text-sm">{payment.reference}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      {payment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPayments.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No payments found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
