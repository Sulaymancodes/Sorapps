'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  ListChecks,
  Phone,
} from 'lucide-react'
import {
  listCollectionQueueAction,
  listOutstandingSalesAction,
  listPaymentsPageAction,
  recordPaymentAction,
} from '@/app/actions/payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { calculateValidityDays } from '@/lib/paygo/validity'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type { Payment } from '@/lib/types/crm'
import { cn } from '@/lib/utils'

type OutstandingSaleOption = {
  sale_id: string
  customer_id: string
  customer_name: string
  phone: string
  payment_type: 'full' | 'installment'
  total_amount: number
  amount_paid: number
  outstanding: number
  expected_amount: number
  week_number?: number
  next_due_date?: string
  status: string
  date: string
  days_until_due: number
  urgency: 'overdue' | 'due_today' | 'due_soon' | 'later'
}

type PaymentStats = {
  total_collected: number
  payment_count: number
  avg_payment: number
  total_outstanding: number
  outstanding_sales: number
  overdue_sales: number
  due_today_sales: number
}

type PaymentsPageResult = {
  items: Payment[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

type QueueFilter = 'actionable' | 'overdue' | 'due_today' | 'due_soon' | 'all'

function dueLabel(sale: OutstandingSaleOption) {
  if (sale.urgency === 'overdue') {
    return `${Math.abs(sale.days_until_due)}d overdue`
  }
  if (sale.urgency === 'due_today') return 'Due today'
  if (sale.days_until_due === 1) return 'Due tomorrow'
  return `In ${sale.days_until_due}d`
}

function saleOptionLabel(sale: OutstandingSaleOption) {
  const week = sale.week_number ? ` · Wk ${sale.week_number}` : ''
  const phone = sale.phone ? ` · ${sale.phone}` : ''
  return `${sale.customer_name}${phone} · ${sale.sale_id}${week} · ${formatCurrency(sale.expected_amount)}`
}

function urgencyTone(urgency: OutstandingSaleOption['urgency']) {
  if (urgency === 'overdue') {
    return 'border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/30'
  }
  if (urgency === 'due_today') {
    return 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30'
  }
  if (urgency === 'due_soon') {
    return 'border-sky-200 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20'
  }
  return 'border-border/60 bg-background'
}

export function PaymentsPageClient({
  stats,
  initialPayments,
  collectionQueue: initialQueue,
  outstandingSales: initialOutstanding,
  smsConfigured,
  baseValidityDays,
}: {
  stats: PaymentStats
  initialPayments: PaymentsPageResult
  collectionQueue: OutstandingSaleOption[]
  outstandingSales: OutstandingSaleOption[]
  smsConfigured: boolean
  baseValidityDays: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [queuePending, startQueueTransition] = useTransition()
  const [historyPending, startHistoryTransition] = useTransition()
  const formRef = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [queue, setQueue] = useState(initialQueue)
  const [outstandingSales, setOutstandingSales] = useState(initialOutstanding)
  const [queueSearch, setQueueSearch] = useState('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('actionable')

  const [paymentsPage, setPaymentsPage] = useState(initialPayments)
  const [historySearch, setHistorySearch] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('')
  const [selectedType, setSelectedType] = useState('')

  const [saleId, setSaleId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Payment['method']>('cash')
  const [reference, setReference] = useState('')
  const [issueActivation, setIssueActivation] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [saleLookupQuery, setSaleLookupQuery] = useState('')
  const [pinnedSale, setPinnedSale] = useState<OutstandingSaleOption | null>(null)

  useEffect(() => {
    setQueue(initialQueue)
  }, [initialQueue])

  useEffect(() => {
    setOutstandingSales(initialOutstanding)
  }, [initialOutstanding])

  useEffect(() => {
    setPaymentsPage(initialPayments)
  }, [initialPayments])

  const selectedSale =
    pinnedSale?.sale_id === saleId
      ? pinnedSale
      : outstandingSales.find((s) => s.sale_id === saleId) ||
        queue.find((s) => s.sale_id === saleId) ||
        null

  const amountNum = Math.max(0, Math.round(Number(amount) || 0))
  const validityPreview = selectedSale
    ? calculateValidityDays({
        amount_paid: amountNum || selectedSale.expected_amount,
        expected_amount: selectedSale.expected_amount,
        base_validity_days: baseValidityDays,
      })
    : null

  const saleOptions = useMemo(() => {
    const map = new Map<string, OutstandingSaleOption>()
    for (const s of outstandingSales) map.set(s.sale_id, s)
    for (const s of queue) map.set(s.sale_id, s)
    if (pinnedSale) map.set(pinnedSale.sale_id, pinnedSale)
    return [...map.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name))
  }, [outstandingSales, queue, pinnedSale])

  const saleLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of saleOptions) map.set(s.sale_id, saleOptionLabel(s))
    return map
  }, [saleOptions])

  const saleIdByLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of saleOptions) map.set(saleOptionLabel(s), s.sale_id)
    return map
  }, [saleOptions])

  const saleSelectOptions = useMemo(
    () => saleOptions.map((s) => saleOptionLabel(s)),
    [saleOptions]
  )

  const selectedSaleLabel = saleId ? saleLabelById.get(saleId) || '' : ''

  const refreshQueue = useCallback(
    (search: string, urgency: QueueFilter) => {
      startQueueTransition(async () => {
        const result = await listCollectionQueueAction({
          search: search || undefined,
          urgency,
          limit: 60,
        })
        if (result.success) setQueue(result.data)
      })
    },
    []
  )

  const refreshHistory = useCallback(
    (opts: { search?: string; method?: string; payment_type?: string; page?: number }) => {
      startHistoryTransition(async () => {
        const result = await listPaymentsPageAction({
          search: opts.search,
          method: opts.method || undefined,
          payment_type: opts.payment_type || undefined,
          page: opts.page ?? 1,
          page_size: paymentsPage.page_size,
        })
        if (result.success) setPaymentsPage(result.data)
      })
    },
    [paymentsPage.page_size]
  )

  const searchOutstandingForSelect = useCallback(async (q: string) => {
    const result = await listOutstandingSalesAction(q || undefined)
    if (result.success) setOutstandingSales(result.data)
  }, [])

  const onSaleQueryChange = useCallback((query: string) => {
    setSaleLookupQuery(query)
  }, [])

  const skipQueueFetch = useRef(true)
  const skipHistoryFetch = useRef(true)

  useEffect(() => {
    if (skipQueueFetch.current) {
      skipQueueFetch.current = false
      return
    }
    const t = setTimeout(() => {
      if (tab !== 'queue') return
      refreshQueue(queueSearch, queueFilter)
    }, 280)
    return () => clearTimeout(t)
  }, [queueSearch, queueFilter, tab, refreshQueue])

  useEffect(() => {
    if (skipHistoryFetch.current) {
      skipHistoryFetch.current = false
      return
    }
    const t = setTimeout(() => {
      if (tab !== 'history') return
      refreshHistory({
        search: historySearch || undefined,
        method: selectedMethod,
        payment_type: selectedType,
        page: 1,
      })
    }, 280)
    return () => clearTimeout(t)
  }, [historySearch, selectedMethod, selectedType, tab, refreshHistory])

  useEffect(() => {
    const t = setTimeout(() => {
      void searchOutstandingForSelect(saleLookupQuery.trim())
    }, 280)
    return () => clearTimeout(t)
  }, [saleLookupQuery, searchOutstandingForSelect])

  function focusForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function collectFrom(sale: OutstandingSaleOption) {
    setSaleId(sale.sale_id)
    setPinnedSale(sale)
    setAmount(String(sale.expected_amount))
    setFormError(null)
    setFormSuccess(null)
    if (!outstandingSales.some((s) => s.sale_id === sale.sale_id)) {
      setOutstandingSales((prev) => [sale, ...prev])
    }
    focusForm()
  }

  function onSaleLabelChange(label: string) {
    setFormError(null)
    setFormSuccess(null)
    if (!label) {
      setSaleId('')
      setPinnedSale(null)
      setAmount('')
      return
    }
    const id = saleIdByLabel.get(label)
    if (!id) return
    const sale = saleOptions.find((s) => s.sale_id === id)
    setSaleId(id)
    setPinnedSale(sale || null)
    if (sale) setAmount(String(sale.expected_amount))
    else setAmount('')
  }

  function setQuickAmount(kind: 'stipulated' | 'half' | 'full') {
    if (!selectedSale) return
    if (kind === 'stipulated') setAmount(String(selectedSale.expected_amount))
    else if (kind === 'half') {
      setAmount(String(Math.max(1, Math.round(selectedSale.expected_amount / 2))))
    } else setAmount(String(selectedSale.outstanding))
  }

  function handleRecord() {
    setFormError(null)
    setFormSuccess(null)
    if (!saleId) {
      setFormError('Select a sale with outstanding balance')
      return
    }
    if (amountNum <= 0) {
      setFormError('Enter a payment amount')
      return
    }

    startTransition(async () => {
      const result = await recordPaymentAction({
        sale_id: saleId,
        amount: amountNum,
        method,
        reference: reference || undefined,
        issue_activation: issueActivation,
        phone: selectedSale?.phone,
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      const parts = [
        `Recorded ${formatCurrency(result.data.payment.amount)}`,
        `validity ${result.data.validity_days}d`,
        result.data.is_partial ? 'partial' : null,
        `left ${formatCurrency(result.data.outstanding)}`,
        result.data.activation_id ? result.data.activation_id : null,
      ].filter(Boolean)

      setFormSuccess(parts.join(' · '))
      setSaleId('')
      setPinnedSale(null)
      setAmount('')
      setReference('')
      refreshQueue(queueSearch, queueFilter)
      refreshHistory({
        search: historySearch || undefined,
        method: selectedMethod,
        payment_type: selectedType,
        page: 1,
      })
      router.refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Payments"
        description="Collect PAYGO installments, apply FIFO, and issue amount-based activation"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            label: 'Collected',
            value: formatCurrency(stats.total_collected),
            hint: `${stats.payment_count.toLocaleString()} payments`,
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.total_outstanding),
            hint: `${stats.outstanding_sales.toLocaleString()} sales`,
            className: 'text-accent',
          },
          {
            label: 'Overdue',
            value: stats.overdue_sales.toLocaleString(),
            hint: 'Need collection',
            className: 'text-red-700 dark:text-red-400',
          },
          {
            label: 'Due today',
            value: stats.due_today_sales.toLocaleString(),
            hint: 'Action now',
            className: 'text-amber-700 dark:text-amber-400',
          },
          {
            label: 'Avg payment',
            value: formatCurrency(stats.avg_payment),
            hint: 'Successful average',
          },
        ].map((stat) => (
          <div key={stat.label} className="surface-panel px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                'mt-0.5 font-display text-xl font-semibold tabular-nums sm:text-2xl',
                stat.className
              )}
            >
              {stat.value}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <div ref={formRef} className="xl:sticky xl:top-4">
          <Panel title="Record payment" description="FIFO to installments · validity from amount">
            <div className="space-y-3.5">
              {!smsConfigured && issueActivation && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  BULK_SMS_TOKEN missing — activation SMS will fail until set.
                </p>
              )}
              {formError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {formError}
                </p>
              )}
              {formSuccess && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                  {formSuccess}
                </p>
              )}

              <div>
                <Label htmlFor="sale">Outstanding sale</Label>
                <SearchableSelect
                  id="sale"
                  options={saleSelectOptions}
                  value={selectedSaleLabel}
                  onChange={onSaleLabelChange}
                  onQueryChange={onSaleQueryChange}
                  placeholder="Search by name, phone, or sale ID…"
                  emptyLabel="No outstanding sales match"
                />
              </div>

              {selectedSale && (
                <div className="rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-xs space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{selectedSale.customer_name}</p>
                      <p className="text-muted-foreground">
                        {selectedSale.sale_id}
                        {selectedSale.week_number ? ` · Week ${selectedSale.week_number}` : ''}
                        {' · '}
                        {dueLabel(selectedSale)}
                      </p>
                    </div>
                    {selectedSale.phone && (
                      <a
                        href={`tel:${selectedSale.phone}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] font-medium hover:bg-background"
                      >
                        <Phone className="size-3" />
                        Call
                      </a>
                    )}
                  </div>
                  <p>
                    Due now {formatCurrency(selectedSale.expected_amount)} · Balance{' '}
                    {formatCurrency(selectedSale.outstanding)}
                  </p>
                </div>
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label htmlFor="amount">Amount paid (₦)</Label>
                  {selectedSale && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {(
                        [
                          ['stipulated', 'Due'],
                          ['half', '½'],
                          ['full', 'All'],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                          onClick={() => setQuickAmount(kind)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              {validityPreview && amountNum > 0 && (
                <div className="rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                  <p className="font-medium">
                    Validity {validityPreview.validity_days}d
                    {validityPreview.is_partial ? ' · partial' : ''}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {(validityPreview.ratio * 100).toFixed(0)}% of stipulated installment
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="method">Method</Label>
                  <Select
                    id="method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as Payment['method'])}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={issueActivation}
                  onChange={(e) => setIssueActivation(e.target.checked)}
                />
                <span>
                  Send device PIN by SMS
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    BeeBeeJump PIN from the serial. Full payment is permanent; installments follow the paid period.
                  </span>
                </span>
              </label>

              <Button className="w-full gap-2" disabled={pending || !saleId} onClick={handleRecord}>
                <CreditCard className="size-4" />
                {pending ? 'Recording…' : 'Record payment'}
              </Button>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border/70 bg-secondary/40 p-0.5">
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'queue' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setTab('queue')}
              >
                <ListChecks className="size-3.5" />
                Due now
                <span className="tabular-nums text-xs text-muted-foreground">
                  {stats.overdue_sales + stats.due_today_sales}
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'history'
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setTab('history')}
              >
                <History className="size-3.5" />
                History
                <span className="tabular-nums text-xs text-muted-foreground">
                  {paymentsPage.total.toLocaleString()}
                </span>
              </button>
            </div>
          </div>

          {tab === 'queue' ? (
            <Panel
              title="Collection queue"
              description="One row per sale — next installment only. Collect prefills the form."
              action={
                queuePending ? (
                  <span className="text-xs text-muted-foreground">Updating…</span>
                ) : null
              }
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <SearchField
                  containerClassName="flex-1"
                  placeholder="Search customer, phone, or sale…"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                />
                <select
                  className="h-10 rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value as QueueFilter)}
                >
                  <option value="actionable">Needs action</option>
                  <option value="overdue">Overdue</option>
                  <option value="due_today">Due today</option>
                  <option value="due_soon">Due ≤14d</option>
                  <option value="all">All outstanding</option>
                </select>
              </div>

              {queue.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
                  <AlertCircle className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">Nothing in this queue</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try “All outstanding” or clear the search
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                  {queue.map((sale) => (
                    <li
                      key={sale.sale_id}
                      className={cn(
                        'flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                        urgencyTone(sale.urgency)
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="truncate text-sm font-semibold">{sale.customer_name}</p>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                              sale.urgency === 'overdue' &&
                                'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
                              sale.urgency === 'due_today' &&
                                'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
                              sale.urgency === 'due_soon' &&
                                'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200',
                              sale.urgency === 'later' &&
                                'bg-secondary text-muted-foreground'
                            )}
                          >
                            {dueLabel(sale)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {sale.sale_id}
                          {sale.week_number ? ` · Week ${sale.week_number}` : ''}
                          {sale.next_due_date
                            ? ` · ${formatDate(new Date(sale.next_due_date))}`
                            : ''}
                          {' · '}
                          bal {formatCurrency(sale.outstanding)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="font-display text-sm font-semibold tabular-nums">
                          {formatCurrency(sale.expected_amount)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => collectFrom(sale)}
                        >
                          Collect
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : (
            <>
              <Panel>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SearchField
                    containerClassName="md:col-span-1"
                    placeholder="Search payment, sale, reference…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                  <select
                    className="h-10 rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                  >
                    <option value="">All methods</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                  <select
                    className="h-10 rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="">All types</option>
                    <option value="full">Full</option>
                    <option value="installment">Installment</option>
                  </select>
                </div>
              </Panel>

              <Panel
                padded={false}
                title="Payment history"
                description={`${paymentsPage.total.toLocaleString()} records · page ${paymentsPage.page} of ${paymentsPage.total_pages}`}
                action={
                  historyPending ? (
                    <span className="pr-4 text-xs text-muted-foreground">Loading…</span>
                  ) : null
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/70 bg-secondary/40">
                        {['Payment', 'Sale', 'Type', 'Date', 'Amount', 'Validity', 'Method'].map(
                          (h, i) => (
                            <th
                              key={h}
                              className={cn(
                                'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                                i === 4 ? 'text-right' : 'text-left'
                              )}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsPage.items.map((payment) => (
                        <tr
                          key={payment.id}
                          className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-3 py-2.5 text-sm font-medium">{payment.id}</td>
                          <td className="px-3 py-2.5 text-sm">{payment.sale_id}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                                payment.is_partial
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                  : payment.payment_type === 'full'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-accent/10 text-accent'
                              )}
                            >
                              {payment.is_partial
                                ? 'Partial'
                                : payment.payment_type === 'full'
                                  ? 'Full'
                                  : `Wk ${payment.week_number}`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm">{formatDate(payment.date)}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="px-3 py-2.5 text-sm tabular-nums">
                            {payment.validity_days != null ? `${payment.validity_days}d` : '—'}
                            {payment.activation_id ? (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                {payment.activation_id}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-sm capitalize">
                            {payment.method.replace('_', ' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {paymentsPage.items.length === 0 && (
                  <div className="px-6 py-14 text-center">
                    <p className="font-medium">No payments match</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Adjust filters or record a collection
                    </p>
                  </div>
                )}

                {paymentsPage.total_pages > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      {(paymentsPage.page - 1) * paymentsPage.page_size + 1}–
                      {Math.min(
                        paymentsPage.page * paymentsPage.page_size,
                        paymentsPage.total
                      )}{' '}
                      of {paymentsPage.total.toLocaleString()}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1"
                        disabled={historyPending || paymentsPage.page <= 1}
                        onClick={() =>
                          refreshHistory({
                            search: historySearch || undefined,
                            method: selectedMethod,
                            payment_type: selectedType,
                            page: paymentsPage.page - 1,
                          })
                        }
                      >
                        <ChevronLeft className="size-3.5" />
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1"
                        disabled={
                          historyPending || paymentsPage.page >= paymentsPage.total_pages
                        }
                        onClick={() =>
                          refreshHistory({
                            search: historySearch || undefined,
                            method: selectedMethod,
                            payment_type: selectedType,
                            page: paymentsPage.page + 1,
                          })
                        }
                      >
                        Next
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}
