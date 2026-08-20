import { getSessionAccess, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { matchesAgentTerritory } from '@/lib/utils/territory'
import { CustomersPageClient } from './customers-page-client'

export default async function CustomersPage() {
  const session = await requireSession()
  const access = getSessionAccess(session)
  const customers = await listCustomers()
  const scoped = customers.filter((c) =>
    matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
  )
  return <CustomersPageClient customers={scoped} canDelete={access.isAdmin} />
}
