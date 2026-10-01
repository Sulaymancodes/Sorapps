import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { SaleForm } from '@/components/forms/SaleForm'
import { Button } from '@/components/ui/button'
import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listProducts } from '@/lib/services/products'
import { getSaleForEdit } from '@/lib/services/sales'

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    if (!access.isAdmin) redirect('/sales')

    const { id } = await params
    const [record, products] = await Promise.all([getSaleForEdit(id), listProducts()])
    if (!record) notFound()

    return (
      <PageShell>
        <PageHeader
          title={`Edit ${record.sale.id}`}
          description={`Updating ${record.customer.name}`}
          actions={
            <Link href="/sales">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </Link>
          }
        />
        <SaleForm
          mode="edit"
          sale={record.sale}
          customer={record.customer}
          initialItems={record.items}
          customers={[record.customer]}
          products={products}
        />
      </PageShell>
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    throw error
  }
}
