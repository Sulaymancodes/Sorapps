'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { InventoryMovementForm } from '@/components/forms/InventoryMovementForm'
import { Button } from '@/components/ui/button'

function InventoryAdjustContent() {
  const searchParams = useSearchParams()
  const productId = searchParams.get('product') || ''

  return (
    <PageShell>
      <PageHeader
        title="Stock movement"
        description="Record stock in, stock out, or adjust quantity"
        actions={
          <Link href="/inventory">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <InventoryMovementForm defaultProductId={productId} />
    </PageShell>
  )
}

export default function InventoryAdjustPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
        </PageShell>
      }
    >
      <InventoryAdjustContent />
    </Suspense>
  )
}
