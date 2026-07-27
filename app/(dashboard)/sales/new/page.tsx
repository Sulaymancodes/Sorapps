import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { SaleForm } from '@/components/forms/SaleForm'
import { Button } from '@/components/ui/button'
import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'

export default async function NewSalePage() {
  const [customers, products] = await Promise.all([listCustomers(), listProducts()])

  return (
    <PageShell>
      <PageHeader
        title="New sale"
        description="Create a sale — invoice and payment schedule are generated automatically"
        actions={
          <Link href="/sales">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      {customers.length === 0 || products.filter((p) => p.stock > 0).length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-card p-6 text-sm">
          <p className="font-medium">Before you can create a sale</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {customers.length === 0 && (
              <li>
                <Link href="/customers/new" className="text-primary hover:underline">
                  Add at least one customer
                </Link>
              </li>
            )}
            {products.filter((p) => p.stock > 0).length === 0 && (
              <li>
                <Link href="/products/new" className="text-primary hover:underline">
                  Add a product with stock
                </Link>
              </li>
            )}
          </ul>
        </div>
      ) : null}
      <SaleForm customers={customers} products={products} />
    </PageShell>
  )
}
