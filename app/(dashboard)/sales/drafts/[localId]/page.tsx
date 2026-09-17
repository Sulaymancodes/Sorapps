import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { SaleForm } from '@/components/forms/SaleForm'
import { Button } from '@/components/ui/button'
import { getSessionAccess, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'
import { matchesAgentTerritory } from '@/lib/utils/territory'

export default async function EditSaleDraftPage({
  params,
}: {
  params: Promise<{ localId: string }>
}) {
  const { localId } = await params
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
    <PageShell>
      <PageHeader
        title="Edit sale draft"
        description="This sale is stored on this device until it syncs"
        actions={
          <Link href="/sales/drafts">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <SaleForm
        customers={scopedCustomers}
        products={products}
        forcedGeo={forcedGeo}
        draftId={localId}
      />
    </PageShell>
  )
}
