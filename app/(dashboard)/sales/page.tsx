import { Suspense } from 'react'
import { requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listPaymentSchedules, listSales } from '@/lib/services/sales'
import SalesPage from './sales-page'

export default async function SalesRoutePage() {
  const session = await requireSession()
  const [sales, customers, schedules] = await Promise.all([
    listSales(),
    listCustomers(),
    listPaymentSchedules(),
  ])

  return (
    <Suspense
      fallback={
        <div className="page-enter mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
        </div>
      }
    >
      <SalesPage
        sales={sales}
        customers={customers}
        schedules={schedules}
        isAdmin={session.user.role === 'admin'}
      />
    </Suspense>
  )
}
