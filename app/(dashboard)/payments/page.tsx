import { listCustomers } from '@/lib/services/customers'
import {
  listInvoices,
  listPaymentReminders,
  listPaymentSchedules,
} from '@/lib/services/sales'
import { PaymentsPageClient } from './payments-page-client'

export default async function PaymentsPage() {
  const customers = await listCustomers()
  const [invoices, schedules, reminders] = await Promise.all([
    listInvoices(),
    listPaymentSchedules(),
    listPaymentReminders(customers),
  ])

  // Payment recording stays for a later phase — show empty collected history for now
  return (
    <PaymentsPageClient
      payments={[]}
      invoices={invoices}
      customers={customers}
      reminders={reminders}
      schedules={schedules}
    />
  )
}
