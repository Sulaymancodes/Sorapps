'use client'

import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { InvoiceDetail } from '@/lib/types/crm'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  sent: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

function methodLabel(method: string) {
  return method.replace(/_/g, ' ')
}

export function InvoiceDetailClient({ detail }: { detail: InvoiceDetail }) {
  const { invoice, customer, sale, payments } = detail
  const outstanding = Math.max(0, invoice.total_amount - invoice.paid_amount)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          View and print this invoice. Payments recorded against it appear below.
        </p>
        <Button type="button" variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <article className="surface-panel overflow-hidden print:border print:border-border print:shadow-none">
        <div className="border-b border-border/70 bg-secondary/30 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight">Sorapps</p>
              <p className="mt-1 text-sm text-muted-foreground">Invoice</p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-semibold">{invoice.invoice_number}</p>
              <span
                className={cn(
                  'mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                  statusColors[invoice.status]
                )}
              >
                {invoice.status}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Bill to
              </p>
              <p className="mt-1 font-medium">{customer.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{customer.phone}</p>
              {customer.email ? (
                <p className="text-sm text-muted-foreground">{customer.email}</p>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">
                {[customer.address, customer.city, customer.lga, customer.state]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
            <div className="sm:text-right">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-6 sm:justify-end">
                  <dt className="text-muted-foreground">Issue date</dt>
                  <dd className="font-medium">{formatDate(invoice.issue_date)}</dd>
                </div>
                <div className="flex justify-between gap-6 sm:justify-end">
                  <dt className="text-muted-foreground">Due date</dt>
                  <dd className="font-medium">{formatDate(invoice.due_date)}</dd>
                </div>
                <div className="flex justify-between gap-6 sm:justify-end">
                  <dt className="text-muted-foreground">Sale</dt>
                  <dd className="font-medium">
                    <Link
                      href="/sales"
                      className="text-primary underline-offset-2 hover:underline print:no-underline print:text-foreground"
                    >
                      {sale.id}
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-6 sm:justify-end">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium capitalize">
                    {sale.payment_type === 'full' ? 'Full payment' : 'Installment / PAYGO'}
                    {' · '}
                    {methodLabel(sale.payment_method)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-0 sm:px-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-background">
                {['Item', 'Qty', 'Unit price', 'Total'].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-8',
                      i === 0 ? 'text-left' : 'text-right'
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={`${item.product_id}-${idx}`} className="border-b border-border/50">
                  <td className="px-5 py-3.5 text-sm font-medium sm:px-8">{item.description}</td>
                  <td className="px-5 py-3.5 text-right text-sm tabular-nums sm:px-8">
                    {item.quantity}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm tabular-nums sm:px-8">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium tabular-nums sm:px-8">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-6 border-t border-border/70 px-5 py-5 sm:grid-cols-[1fr_280px] sm:px-8 sm:py-6">
          <div className="text-sm text-muted-foreground">
            {sale.notes ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide">Notes</p>
                <p className="mt-1 text-foreground/80">{sale.notes}</p>
              </>
            ) : (
              <p>Thank you for your business.</p>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(invoice.total_amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(invoice.paid_amount)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border/60 pt-2">
              <dt className="font-semibold">Outstanding</dt>
              <dd className="font-display text-lg font-semibold tabular-nums text-accent">
                {formatCurrency(outstanding)}
              </dd>
            </div>
          </dl>
        </div>
      </article>

      {payments.length > 0 && (
        <section className="surface-panel overflow-hidden print:break-inside-avoid">
          <div className="border-b border-border/70 px-5 py-3.5">
            <h2 className="font-display text-base font-semibold">Payments on this invoice</h2>
            <p className="text-sm text-muted-foreground">
              {payments.length} payment{payments.length === 1 ? '' : 's'} recorded
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/40">
                  {['Payment', 'Date', 'Method', 'Reference', 'Amount'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        i === 4 ? 'text-right' : 'text-left'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3 text-sm font-medium">{p.id}</td>
                    <td className="px-5 py-3 text-sm">{formatDate(p.date)}</td>
                    <td className="px-5 py-3 text-sm capitalize">{methodLabel(p.method)}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{p.reference || '—'}</td>
                    <td className="px-5 py-3 text-right text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {outstanding > 0 && (
        <div className="print:hidden">
          <Link href="/payments">
            <Button className="gap-2">Record payment</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
