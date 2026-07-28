'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Bell,
  Calendar as CalendarIcon,
  Clock,
  Mail,
  Phone,
  Plus,
  ShoppingCart,
} from 'lucide-react'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'

export type CalendarBucket = 'overdue' | 'due_today' | 'this_week' | 'upcoming' | 'later'

export type CalendarEvent = {
  id: string
  sale_id: string
  schedule_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_city: string
  week_number: number
  total_weeks: number
  amount: number
  dueDate: string
  daysUntil: number
  bucket: CalendarBucket
  schedule_outstanding: number
  paid_installments: number
  color: 'red' | 'orange' | 'blue' | 'green'
}

type StatusFilter = 'all' | CalendarBucket
type SortKey = 'due_asc' | 'due_desc' | 'amount_desc' | 'customer'

const BUCKET_META: Record<
  CalendarBucket,
  { label: string; short: string; description: string }
> = {
  overdue: {
    label: 'Overdue',
    short: 'Overdue',
    description: 'Past due — needs follow-up now',
  },
  due_today: {
    label: 'Due today',
    short: 'Today',
    description: 'Installments due today',
  },
  this_week: {
    label: 'This week',
    short: 'This week',
    description: 'Due within the next 7 days',
  },
  upcoming: {
    label: 'Upcoming',
    short: '8–30 days',
    description: 'Due within 8–30 days',
  },
  later: {
    label: 'Later',
    short: 'Later',
    description: 'Due more than 30 days from now',
  },
}

function bucketClasses(bucket: CalendarBucket) {
  switch (bucket) {
    case 'overdue':
      return 'border-red-200/80 bg-red-50/80 dark:border-red-800/60 dark:bg-red-950/40'
    case 'due_today':
      return 'border-amber-200/80 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/40'
    case 'this_week':
      return 'border-sky-200/80 bg-sky-50/80 dark:border-sky-800/60 dark:bg-sky-950/40'
    case 'upcoming':
      return 'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/40'
    case 'later':
      return 'border-border/70 bg-secondary/40'
  }
}

function bucketBadge(bucket: CalendarBucket) {
  switch (bucket) {
    case 'overdue':
      return 'bg-red-600/15 text-red-700 dark:text-red-300'
    case 'due_today':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
    case 'this_week':
      return 'bg-sky-500/15 text-sky-800 dark:text-sky-300'
    case 'upcoming':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
    case 'later':
      return 'bg-muted text-muted-foreground'
  }
}

function dueLabel(daysUntil: number) {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue`
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  return `Due in ${daysUntil} days`
}

export function CalendarPageClient({ events }: { events: CalendarEvent[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [customerFilter, setCustomerFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('due_asc')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

  const customers = useMemo(() => {
    const names = Array.from(new Set(events.map((e) => e.customer_name))).sort((a, b) =>
      a.localeCompare(b)
    )
    return names
  }, [events])

  const stats = useMemo(() => {
    const byBucket = {
      overdue: events.filter((e) => e.bucket === 'overdue'),
      due_today: events.filter((e) => e.bucket === 'due_today'),
      this_week: events.filter((e) => e.bucket === 'this_week'),
      upcoming: events.filter((e) => e.bucket === 'upcoming'),
      later: events.filter((e) => e.bucket === 'later'),
    }
    return {
      total: events.length,
      overdueCount: byBucket.overdue.length,
      overdueAmount: byBucket.overdue.reduce((s, e) => s + e.amount, 0),
      dueTodayCount: byBucket.due_today.length,
      dueTodayAmount: byBucket.due_today.reduce((s, e) => s + e.amount, 0),
      thisWeekCount: byBucket.this_week.length + byBucket.due_today.length,
      thisWeekAmount:
        byBucket.this_week.reduce((s, e) => s + e.amount, 0) +
        byBucket.due_today.reduce((s, e) => s + e.amount, 0),
      totalExpected: events.reduce((s, e) => s + e.amount, 0),
      byBucket,
    }
  }, [events])

  const filtered = useMemo(() => {
    let list = [...events]

    if (statusFilter !== 'all') {
      list = list.filter((e) => e.bucket === statusFilter)
    }

    if (customerFilter) {
      list = list.filter((e) => e.customer_name === customerFilter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.customer_name.toLowerCase().includes(q) ||
          e.customer_phone.includes(q) ||
          e.customer_email.toLowerCase().includes(q) ||
          e.sale_id.toLowerCase().includes(q) ||
          e.customer_city.toLowerCase().includes(q)
      )
    }

    if (selectedDay) {
      list = list.filter((e) => isSameDay(new Date(e.dueDate), new Date(selectedDay)))
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case 'due_desc':
          return b.daysUntil - a.daysUntil
        case 'amount_desc':
          return b.amount - a.amount
        case 'customer':
          return a.customer_name.localeCompare(b.customer_name) || a.daysUntil - b.daysUntil
        case 'due_asc':
        default:
          return a.daysUntil - b.daysUntil
      }
    })

    return list
  }, [events, statusFilter, customerFilter, search, selectedDay, sortKey])

  const grouped = useMemo(() => {
    const order: CalendarBucket[] = ['overdue', 'due_today', 'this_week', 'upcoming', 'later']
    return order
      .map((bucket) => ({
        bucket,
        items: filtered.filter((e) => e.bucket === bucket),
      }))
      .filter((g) => g.items.length > 0)
  }, [filtered])

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [monthCursor])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = format(new Date(event.dueDate), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

  const hasActiveFilters =
    statusFilter !== 'all' || !!customerFilter || !!search.trim() || !!selectedDay

  function clearFilters() {
    setStatusFilter('all')
    setCustomerFilter('')
    setSearch('')
    setSelectedDay(null)
    setSortKey('due_asc')
  }

  return (
    <PageShell>
      <PageHeader
        title="Calendar & Reminders"
        description="Track installment due dates, classify risk, and follow up with customers"
        actions={
          <Link href="/sales/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              New installment sale
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Overdue',
            value: String(stats.overdueCount),
            sub: formatCurrency(stats.overdueAmount),
            tone: 'text-red-700 dark:text-red-400',
            onClick: () => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue'),
            active: statusFilter === 'overdue',
          },
          {
            label: 'Due today',
            value: String(stats.dueTodayCount),
            sub: formatCurrency(stats.dueTodayAmount),
            tone: 'text-amber-700 dark:text-amber-400',
            onClick: () => setStatusFilter(statusFilter === 'due_today' ? 'all' : 'due_today'),
            active: statusFilter === 'due_today',
          },
          {
            label: 'Next 7 days',
            value: String(stats.thisWeekCount),
            sub: formatCurrency(stats.thisWeekAmount),
            tone: 'text-sky-700 dark:text-sky-400',
            onClick: () => setStatusFilter(statusFilter === 'this_week' ? 'all' : 'this_week'),
            active: statusFilter === 'this_week',
          },
          {
            label: 'All open',
            value: String(stats.total),
            sub: formatCurrency(stats.totalExpected),
            tone: 'text-foreground',
            onClick: () => setStatusFilter('all'),
            active: statusFilter === 'all' && !selectedDay,
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={cn(
              'surface-panel p-4 text-left transition-all',
              card.active && 'ring-2 ring-primary/30'
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className={cn('mt-1 font-display text-2xl font-semibold tabular-nums', card.tone)}>
              {card.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        <Panel
          title={format(monthCursor, 'MMMM yyyy')}
          description="Days with installment dues"
          action={
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonthCursor(startOfMonth(addDays(monthCursor, -1)))}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonthCursor(startOfMonth(new Date()))}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonthCursor(startOfMonth(addDays(endOfMonth(monthCursor), 1)))}
              >
                Next
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const dayEvents = eventsByDay.get(key) ?? []
              const inMonth = isSameMonth(day, monthCursor)
              const isSelected = selectedDay === key
              const isToday = isSameDay(day, new Date())
              const hasOverdue = dayEvents.some((e) => e.bucket === 'overdue')
              const hasDue = dayEvents.length > 0

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!hasDue && !isSelected}
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors',
                    !inMonth && 'opacity-35',
                    isSelected && 'bg-primary text-primary-foreground',
                    !isSelected && hasDue && 'bg-muted hover:bg-muted/80',
                    !isSelected && !hasDue && 'text-muted-foreground',
                    isToday && !isSelected && 'ring-1 ring-primary/40'
                  )}
                >
                  <span className="font-medium tabular-nums">{format(day, 'd')}</span>
                  {hasDue && (
                    <span
                      className={cn(
                        'mt-0.5 size-1.5 rounded-full',
                        isSelected
                          ? 'bg-primary-foreground'
                          : hasOverdue
                            ? 'bg-red-500'
                            : 'bg-sky-500'
                      )}
                    />
                  )}
                </button>
              )
            })}
          </div>
          {selectedDay && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing dues for {formatDate(new Date(selectedDay))}.{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setSelectedDay(null)}
              >
                Clear day
              </button>
            </p>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Filters" description="Search and classify installment dues">
            <div className="space-y-4">
              <SearchField
                placeholder="Search customer, phone, email, sale ID, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'all',
                    'overdue',
                    'due_today',
                    'this_week',
                    'upcoming',
                    'later',
                  ] as StatusFilter[]
                ).map((key) => {
                  const label = key === 'all' ? 'All' : BUCKET_META[key].short
                  const count =
                    key === 'all' ? events.length : stats.byBucket[key as CalendarBucket].length
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        statusFilter === key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      )}
                    >
                      {label}
                      <span className="tabular-nums opacity-70">{count}</span>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Customer
                  </label>
                  <select
                    className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={customerFilter}
                    onChange={(e) => setCustomerFilter(e.target.value)}
                  >
                    <option value="">All customers</option>
                    {customers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sort by
                  </label>
                  <select
                    className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="due_asc">Due date (soonest)</option>
                    <option value="due_desc">Due date (latest)</option>
                    <option value="amount_desc">Amount (highest)</option>
                    <option value="customer">Customer name</option>
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
                    {events.length} installments
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="font-medium text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </Panel>

          {events.length === 0 ? (
            <Panel>
              <div className="py-12 text-center">
                <CalendarIcon className="mx-auto mb-4 size-12 text-muted-foreground" />
                <p className="font-medium">No installment schedules yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Create a sale with weekly installment payments to populate this calendar with due
                  dates, reminders, and follow-up priorities.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link href="/sales/new">
                    <Button className="gap-2">
                      <Plus className="size-4" />
                      Create installment sale
                    </Button>
                  </Link>
                  <Link href="/payments">
                    <Button variant="outline">View payments</Button>
                  </Link>
                </div>
              </div>
            </Panel>
          ) : filtered.length === 0 ? (
            <Panel>
              <div className="py-12 text-center">
                <p className="font-medium">No installments match your filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try another status, customer, or clear the selected day
                </p>
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            </Panel>
          ) : (
            grouped.map(({ bucket, items }) => (
              <Panel
                key={bucket}
                title={BUCKET_META[bucket].label}
                description={`${items.length} · ${BUCKET_META[bucket].description} · ${formatCurrency(
                  items.reduce((s, e) => s + e.amount, 0)
                )}`}
              >
                <div className="space-y-3">
                  {items.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </Panel>
            ))
          )}
        </div>
      </div>
    </PageShell>
  )
}

function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <div className={cn('rounded-xl border p-4', bucketClasses(event.bucket))}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 shrink-0 text-muted-foreground">
            {event.bucket === 'overdue' ? (
              <AlertCircle className="size-5 text-red-600" />
            ) : event.bucket === 'due_today' ? (
              <Bell className="size-5 text-amber-600" />
            ) : (
              <Clock className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{event.customer_name}</p>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  bucketBadge(event.bucket)
                )}
              >
                {BUCKET_META[event.bucket].short}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Week {event.week_number} of {event.total_weeks} · Sale {event.sale_id}
              {event.customer_city ? ` · ${event.customer_city}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {event.paid_installments}/{event.total_weeks} weeks paid · Schedule outstanding{' '}
              {formatCurrency(event.schedule_outstanding)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {event.customer_phone && (
                <a
                  href={`tel:${event.customer_phone}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Phone className="size-3" />
                  {formatPhone(event.customer_phone)}
                </a>
              )}
              {event.customer_email && (
                <a
                  href={`mailto:${event.customer_email}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="size-3" />
                  {event.customer_email}
                </a>
              )}
              <Link
                href="/payments"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ShoppingCart className="size-3" />
                Payments
              </Link>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="font-display text-lg font-semibold tabular-nums">
            {formatCurrency(event.amount)}
          </p>
          <p className="mt-0.5 text-xs font-medium">{dueLabel(event.daysUntil)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(new Date(event.dueDate))}</p>
        </div>
      </div>
    </div>
  )
}
