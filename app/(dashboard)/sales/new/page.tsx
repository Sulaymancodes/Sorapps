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

export default async function NewSalePage() {
  const session = await requireSession()
  const access = getSessionAccess(session)
  const [customers, products] = await Promise.all([listCustomers(), listProducts()])
  const scopedCustomers = customers.filter((c) =>
    matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
  )
  const hasStock = products.some((p) => p.stock > 0)
  const forcedGeo =
    access.isAgent && access.assignedState && access.assignedLga
      ? { state: access.assignedState, lga: access.assignedLga }
      : null

  return (
    <PageShell>
      <PageHeader
        title={forcedGeo ? 'Add sale' : 'New sale'}
        description={
          forcedGeo
            ? `Territory locked to ${forcedGeo.lga}, ${forcedGeo.state}`
            : 'Create a sale — invoice and payment schedule are generated automatically'
        }
        actions={
          <Link href="/sales">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      {!hasStock ? (
        <div className="rounded-xl border border-border/70 bg-card p-6 text-sm">
          <p className="font-medium">Before you can create a sale</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              {access.isAdmin ? (
                <Link href="/products/new" className="text-primary hover:underline">
                  Add a product with stock
                </Link>
              ) : (
                'Ask an admin to add product stock'
              )}
            </li>
          </ul>
        </div>
      ) : null}
      <SaleForm customers={scopedCustomers} products={products} forcedGeo={forcedGeo} />
    </PageShell>
  )
}
