import { getCalendarEvents } from '@/lib/services/analytics'
import { CalendarPageClient } from './calendar-page-client'

export default async function CalendarPage() {
  const events = await getCalendarEvents()

  return (
    <CalendarPageClient
      events={events.map((event) => ({
        ...event,
        dueDate: event.dueDate.toISOString(),
      }))}
    />
  )
}
