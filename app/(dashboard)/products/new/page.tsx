'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { ProductForm } from '@/components/forms/ProductForm'
import { Button } from '@/components/ui/button'

export default function NewProductPage() {
  return (
    <PageShell>
      <PageHeader
        title="Add product"
        description="Create a new item in your product catalog"
        actions={
          <Link href="/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <ProductForm mode="create" />
    </PageShell>
  )
}
