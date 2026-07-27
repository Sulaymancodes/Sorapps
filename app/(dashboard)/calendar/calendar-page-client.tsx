'use client'

import { Calendar, Clock, AlertCircle, Bell } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'

export type CalendarEvent = {
  id: string
  title: string
  description: string
  amount: number
  dueDate: string
  daysUntil: number
  color: 'red' | 'orange' | 'blue' | 'green'
}

function getColorClasses(color: CalendarEvent['color']) {
  switch (color) {
    case 'red':
      return 'border-red-200/80 bg-red-50/80 dark:border-red-800/60 dark:bg-red-950/40'
    case 'orange':
      return 'border-amber-200/80 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/40'
    case 'green':
      return 'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/40'
    case 'blue':
      return 'border-sky-200/80 bg-sky-50/80 dark:border-sky-800/60 dark:bg-sky-950/40'
  }
}

export function CalendarPageClient({ events }: { events: CalendarEvent[] }) {
  const eventsByPriority = {
    overdue: events.filter((e) => e.daysUntil < 0),
    urgent: events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 7),
    upcoming: events.filter((e) => e.daysUntil > 7 && e.daysUntil <= 30),
  }

  const EventCard = ({ event }: { event: CalendarEvent }) => (
    <div className={`rounded-lg border p-4 ${getColorClasses(event.color)}`}>
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {event.daysUntil < 0 ? (
            <AlertCircle className="size-5" />
          ) : event.daysUntil === 0 ? (
            <Bell className="size-5" />
          ) : (
            <Clock className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCurrency(event.amount)} · {event.description}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-medium">
              {event.daysUntil < 0
                ? `${Math.abs(event.daysUntil)} days overdue`
                : event.daysUntil === 0
                  ? 'Due today'
                  : `Due in ${event.daysUntil} days`}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(new Date(event.dueDate))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <PageShell>
      <PageHeader
        title="Calendar & Reminders"
        description="Weekly installment due dates from your live payment schedules"
      />

      {eventsByPriority.overdue.length > 0 && (
        <Panel
          title="Overdue Installments"
          description={`${eventsByPriority.overdue.length} payments need immediate attention`}
        >
          <div className="space-y-3">
            {eventsByPriority.overdue.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Panel>
      )}

      {eventsByPriority.urgent.length > 0 && (
        <Panel title="This Week" description="Installments due within the next 7 days">
          <div className="space-y-3">
            {eventsByPriority.urgent.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Panel>
      )}

      {eventsByPriority.upcoming.length > 0 && (
        <Panel title="Coming Up" description="Installments due within 30 days">
          <div className="space-y-3">
            {eventsByPriority.upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Panel>
      )}

      {events.length === 0 && (
        <Panel>
          <div className="py-12 text-center">
            <Calendar className="mx-auto mb-4 size-12 text-muted-foreground" />
            <p className="font-medium">No installment reminders</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create installment sales to see due dates here
            </p>
          </div>
        </Panel>
      )}
    </PageShell>
  )
}
