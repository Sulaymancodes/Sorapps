import { getSessionAccess, requireSession } from '@/lib/auth-server'
import { getCalendarEvents } from '@/lib/services/analytics'
import { listCustomers } from '@/lib/services/customers'
import { matchesAgentTerritory } from '@/lib/utils/territory'
import { CalendarPageClient } from './calendar-page-client'

export default async function CalendarPage() {
  const session = await requireSession()
  const access = getSessionAccess(session)
  const [events, customers] = await Promise.all([getCalendarEvents(), listCustomers()])
  const allowed = new Set(
    customers
      .filter((c) => matchesAgentTerritory({ state: c.state, lga: c.lga }, access))
      .map((c) => c.id)
  )
  const scoped = events.filter((e) => allowed.has(e.customer_id))

  return (
    <CalendarPageClient
      events={scoped.map((event) => ({
        ...event,
        dueDate: event.dueDate.toISOString(),
      }))}
    />
  )
}
