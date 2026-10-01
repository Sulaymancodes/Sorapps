'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CloudOff, Plus, Mail, Phone, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { TablePagination, usePagedList } from '@/components/common/TablePagination'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import { deleteCustomerAction } from '@/app/actions/customers'
import { ConfirmModal } from '@/components/common/ConfirmModal'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { formatCurrency, formatPhone } from '@/lib/utils/formatting'
import type { Customer } from '@/lib/types/crm'

export function CustomersPageClient({
  customers,
  canDelete = false,
  showMoney = true,
}: {
  customers: Customer[]
  canDelete?: boolean
  showMoney?: boolean
}) {
  const router = useRouter()
  const offline = useOfflineSyncOptional()
  const pendingCount = offline?.pendingCount ?? 0
  const [search, setSearch] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [selectedBusinessType, setSelectedBusinessType] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
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
      const qDigits = q.replace(/\D/g, '')
      filtered = filtered.filter((c) => {
        const haystack = [
          c.id,
          c.name,
          c.email,
          c.phone,
          c.guardian_phone,
          c.next_of_kin_phone,
          c.nin,
          c.bvn,
          c.city,
          c.state,
          c.lga,
        ]
        return haystack.some((value) => {
          const raw = String(value || '')
          if (raw.toLowerCase().includes(q)) return true
          if (qDigits.length >= 4 && raw.replace(/\D/g, '').includes(qDigits)) return true
          return false
        })
      })
    }

    if (selectedState) {
      filtered = filtered.filter((c) => c.state === selectedState)
    }

    if (selectedBusinessType) {
      filtered = filtered.filter((c) => c.business_type === selectedBusinessType)
    }

    return filtered
  }, [customers, search, selectedState, selectedBusinessType])

  const { page, setPage, paged, total } = usePagedList(
    filteredCustomers,
    `${search}|${selectedState}|${selectedBusinessType}`
  )

  function handleDelete(customer: Customer) {
    setActionError(null)
    setCustomerToDelete(customer)
  }

  function confirmDelete() {
    const customer = customerToDelete
    if (!customer) return
    setDeletingId(customer.id)
    startTransition(async () => {
      const result = await deleteCustomerAction(customer.id)
      setDeletingId(null)
      setCustomerToDelete(null)
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
          <div className="flex flex-wrap gap-2">
            <Link href="/customers/drafts">
              <Button variant="outline" className="gap-2">
                <CloudOff className="size-4" />
                Drafts
                {pendingCount > 0 ? ` (${pendingCount})` : ''}
              </Button>
            </Link>
            <Link href="/customers/new">
              <Button className="gap-2">
                <Plus className="size-4" />
                Add Customer
              </Button>
            </Link>
          </div>
        }
      />

      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            {pendingCount} customer {pendingCount === 1 ? 'draft' : 'drafts'} on this device waiting
            to sync.
          </p>
          <Link href="/customers/drafts" className="font-medium underline-offset-2 hover:underline">
            Review drafts
          </Link>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search name, phone, NIN, BVN, or customer ID…"
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
                  ...(showMoney ? ['Total Purchases', 'Outstanding'] : []),
                  'Action',
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                      h === 'Total Purchases' || h === 'Outstanding' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((customer) => (
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
                  {showMoney && (
                    <>
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
                    </>
                  )}
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Link href={`/customers/${customer.id}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Pencil className="size-3" />
                          Edit
                        </Button>
                      </Link>
                      {canDelete && (
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
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCustomers.length > 0 && (
          <TablePagination page={page} total={total} onPageChange={setPage} />
        )}
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
      <ConfirmModal
        open={Boolean(customerToDelete)}
        title={customerToDelete ? `Delete ${customerToDelete.name}?` : 'Delete customer'}
        description="This cannot be undone. Customers with existing sales cannot be deleted."
        pending={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setCustomerToDelete(null)
        }}
        onConfirm={confirmDelete}
      />
    </PageShell>
  )
}
