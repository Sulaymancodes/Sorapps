import { listCustomers } from '@/lib/services/customers'
import { CustomersPageClient } from './customers-page-client'

export default async function CustomersPage() {
  const customers = await listCustomers()
  return <CustomersPageClient customers={customers} />
}
