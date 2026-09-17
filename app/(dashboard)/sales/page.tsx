import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listPaymentSchedules, listSales } from '@/lib/services/sales'
import { matchesAgentTerritory } from '@/lib/utils/territory'
import { Suspense } from 'react'
import SalesPage from './sales-page'

export default async function SalesRoutePage() {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    const [sales, customers, schedules] = await Promise.all([
      listSales(),
      listCustomers(),
      listPaymentSchedules(),
    ])

    const scopedCustomers = customers.filter((c) =>
      matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
    )
    const customerIds = new Set(scopedCustomers.map((c) => c.id))
    const scopedSales = sales.filter((s) => customerIds.has(s.customer_id))
    const scopedSchedules = schedules.filter((s) => customerIds.has(s.customer_id))

    return (
      <Suspense
        fallback={
          <div className="page-enter mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
            <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
          </div>
        }
      >
        <SalesPage
          sales={scopedSales}
          customers={scopedCustomers}
          schedules={scopedSchedules}
          isAdmin={access.isAdmin}
        />
      </Suspense>
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return <SalesPage sales={[]} customers={[]} schedules={[]} />
  }
}
