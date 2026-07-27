import { listInvoices } from '@/lib/services/sales'
import { InvoicesPageClient } from './invoices-page-client'

export default async function InvoicesPage() {
  const invoices = await listInvoices()
  return <InvoicesPageClient invoices={invoices} />
}
