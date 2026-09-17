import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'
import { matchesAgentTerritory } from '@/lib/utils/territory'
import { NewSalePageClient } from './new-sale-page-client'

export default async function NewSalePage() {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    const [customers, products] = await Promise.all([listCustomers(), listProducts()])
    const scopedCustomers = customers.filter((c) =>
      matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
    )
    const forcedGeo =
      access.isAgent && access.assignedState && access.assignedLga
        ? { state: access.assignedState, lga: access.assignedLga }
        : null

    return (
      <NewSalePageClient
        customers={scopedCustomers}
        products={products}
        forcedGeo={forcedGeo}
        isAdmin={access.isAdmin}
      />
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return (
      <NewSalePageClient customers={[]} products={[]} forcedGeo={null} isAdmin={false} />
    )
  }
}
