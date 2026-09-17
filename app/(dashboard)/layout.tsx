import { DashboardShell } from '@/components/layout/DashboardShell'
import { AgentRouteGuard } from '@/components/layout/AgentRouteGuard'
import { DashboardOfflineShell } from '@/components/offline/DashboardOfflineShell'
import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listPaymentReminders } from '@/lib/services/sales'
import { matchesAgentTerritory } from '@/lib/utils/territory'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    const customers = await listCustomers()
    const scopedCustomers = customers.filter((c) =>
      matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
    )
    const reminders = await listPaymentReminders(scopedCustomers)

    const sortedReminders = [...reminders].sort((a, b) => {
      const rank = { overdue: 0, due_today: 1, due_soon: 2 } as const
      const rankDiff = rank[a.status] - rank[b.status]
      if (rankDiff !== 0) return rankDiff
      return a.due_date.getTime() - b.due_date.getTime()
    })

    return (
      <DashboardShell
        user={{
          name: session.user.name,
          email: session.user.email,
          role: access.role,
          image: session.user.image,
          assignedState: access.assignedState,
          assignedLga: access.assignedLga,
        }}
        reminders={sortedReminders.map((reminder) => ({
          id: reminder.id,
          sale_id: reminder.sale_id,
          customer_id: reminder.customer_id,
          amount: reminder.amount,
          due_date: reminder.due_date.toISOString(),
          status: reminder.status,
          message: reminder.message,
          week_number: reminder.week_number,
        }))}
      >
        <AgentRouteGuard isAgent={access.isAgent}>{children}</AgentRouteGuard>
      </DashboardShell>
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return <DashboardOfflineShell>{children}</DashboardOfflineShell>
  }
}
