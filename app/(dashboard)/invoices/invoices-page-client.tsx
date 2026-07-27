'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type { Invoice } from '@/lib/types/crm'

export function InvoicesPageClient({ invoices }: { invoices: Invoice[] }) {
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')

  const filteredInvoices = useMemo(() => {
    let filtered = invoices

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          i.sale_id.toLowerCase().includes(q)
      )
    }

    if (selectedStatus) {
      filtered = filtered.filter((i) => i.status === selectedStatus)
    }

    return filtered
  }, [invoices, search, selectedStatus])

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    sent: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const totalCollected = invoices.reduce((sum, i) => sum + i.paid_amount, 0)
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.total_amount - i.paid_amount), 0)
  const collectionRate =
    totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '0.0'

  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        description="Generated automatically from sales — create a sale to issue an invoice"
        actions={
          <Link href="/sales/new">
            <Button className="gap-2">
              <ShoppingCart className="size-4" />
              New sale
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Invoiced', value: formatCurrency(totalInvoiced) },
          {
            label: 'Collected',
            value: formatCurrency(totalCollected),
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(totalOutstanding),
            className: 'text-accent',
          },
          { label: 'Collection Rate', value: `${collectionRate}%` },
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
            placeholder="Search by invoice number or sale ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                {[
                  'Invoice #',
                  'Sale',
                  'Date',
                  'Due Date',
                  'Amount',
                  'Paid',
                  'Outstanding',
                  'Status',
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                      i >= 4 && i <= 6 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-4">
                    <p className="font-medium">{invoice.invoice_number}</p>
                  </td>
                  <td className="px-5 py-4 text-sm">{invoice.sale_id}</td>
                  <td className="px-5 py-4 text-sm">{formatDate(invoice.issue_date)}</td>
                  <td className="px-5 py-4 text-sm">{formatDate(invoice.due_date)}</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(invoice.paid_amount)}
                  </td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums text-accent">
                    {formatCurrency(invoice.total_amount - invoice.paid_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[invoice.status]}`}
                    >
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredInvoices.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No invoices found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a sale to generate an invoice automatically
            </p>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
