import { DashboardShell } from '@/components/layout/DashboardShell'
import { requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listPaymentReminders } from '@/lib/services/sales'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const customers = await listCustomers()
  const reminders = await listPaymentReminders(customers)

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
        role: session.user.role,
        image: session.user.image,
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
      {children}
    </DashboardShell>
  )
}
