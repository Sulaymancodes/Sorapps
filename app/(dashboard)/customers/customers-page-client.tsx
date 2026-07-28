'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Mail, Phone, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { deleteCustomerAction } from '@/app/actions/customers'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { formatCurrency, formatPhone } from '@/lib/utils/formatting'
import type { Customer } from '@/lib/types/crm'

export function CustomersPageClient({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [selectedBusinessType, setSelectedBusinessType] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const states = useMemo(() => {
    const fromData = customers.map((c) => c.state)
    return Array.from(new Set([...NIGERIAN_STATES, ...fromData])).sort()
  }, [customers])
  const businessTypes = useMemo(
    () => Array.from(new Set(customers.map((c) => c.business_type))).sort(),
    [customers]
  )

  const filteredCustomers = useMemo(() => {
    let filtered = customers

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q)
      )
    }

    if (selectedState) {
      filtered = filtered.filter((c) => c.state === selectedState)
    }

    if (selectedBusinessType) {
      filtered = filtered.filter((c) => c.business_type === selectedBusinessType)
    }

    return filtered
  }, [customers, search, selectedState, selectedBusinessType])

  function handleDelete(customer: Customer) {
    const ok = window.confirm(
      `Delete ${customer.name}? This cannot be undone.\n\nCustomers with existing sales cannot be deleted.`
    )
    if (!ok) return

    setActionError(null)
    setDeletingId(customer.id)
    startTransition(async () => {
      const result = await deleteCustomerAction(customer.id)
      setDeletingId(null)
      if (!result.success) {
        setActionError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        description={
          customers.length === 0
            ? 'No customers yet — add your first account'
            : `${filteredCustomers.length} accounts in your directory`
        }
        actions={
          <Link href="/customers/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              Add Customer
            </Button>
          </Link>
        }
      />

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                State
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
              >
                <option value="">All States</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Business Type
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedBusinessType}
                onChange={(e) => setSelectedBusinessType(e.target.value)}
              >
                <option value="">All Types</option>
                {businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
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
                  'Name',
                  'Business Type',
                  'Location',
                  'Contact',
                  'Total Purchases',
                  'Outstanding',
                  'Action',
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                      i === 4 || i === 5 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary">
                        {customer.name[0]}
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {customer.business_type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {customer.city}, {customer.state}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <div className="flex flex-col gap-1">
                      <a
                        href={`mailto:${customer.email}`}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Mail className="size-3" />
                        {customer.email}
                      </a>
                      <a
                        href={`tel:${customer.phone}`}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3" />
                        {formatPhone(customer.phone)}
                      </a>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums">
                    {formatCurrency(customer.total_purchases)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    <span
                      className={
                        customer.outstanding_balance > 0
                          ? 'font-medium text-accent'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }
                    >
                      {formatCurrency(customer.outstanding_balance)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Link href={`/customers/${customer.id}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Pencil className="size-3" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={pending && deletingId === customer.id}
                        onClick={() => handleDelete(customer)}
                      >
                        <Trash2 className="size-3" />
                        {deletingId === customer.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCustomers.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">
              {customers.length === 0 ? 'No customers yet' : 'No customers found'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {customers.length === 0
                ? 'Add a customer to start creating sales'
                : 'Try adjusting your search or filters'}
            </p>
            {customers.length === 0 && (
              <Link href="/customers/new" className="mt-4 inline-block">
                <Button className="gap-2">
                  <Plus className="size-4" />
                  Add Customer
                </Button>
              </Link>
            )}
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
