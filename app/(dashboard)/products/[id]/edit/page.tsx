import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { ProductForm } from '@/components/forms/ProductForm'
import { Button } from '@/components/ui/button'
import { getProduct } from '@/lib/services/products'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id)

  if (!product) notFound()

  return (
    <PageShell>
      <PageHeader
        title="Edit product"
        description={`Updating ${product.name}`}
        actions={
          <Link href="/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <ProductForm mode="edit" product={product} />
    </PageShell>
  )
}
