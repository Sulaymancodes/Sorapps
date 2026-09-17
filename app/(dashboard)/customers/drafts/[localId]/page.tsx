'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { Button } from '@/components/ui/button'
import { useOfflineSync } from '@/components/offline/offline-sync-context'
import type { CustomerDraft } from '@/lib/offline/customer-drafts'

export default function EditCustomerDraftPage() {
  const params = useParams<{ localId: string }>()
  const { drafts, ready } = useOfflineSync()
  const [draft, setDraft] = useState<CustomerDraft | null | undefined>(undefined)

  useEffect(() => {
    if (!ready) return
    setDraft(drafts.find((row) => row.localId === params.localId) ?? null)
  }, [drafts, params.localId, ready])

  return (
    <PageShell>
      <PageHeader
        title="Edit draft"
        description={
          draft ? `Local draft for ${draft.payload.name || 'customer'}` : 'Loading local draft'
        }
        actions={
          <Link href="/customers/drafts">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      {!ready || draft === undefined ? (
        <p className="text-sm text-muted-foreground">Loading draft…</p>
      ) : draft === null ? (
        <div className="rounded-lg border border-border/70 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          This draft is gone — it may already have synced.
          <div className="mt-4">
            <Link href="/customers/drafts">
              <Button variant="outline">View drafts</Button>
            </Link>
          </div>
        </div>
      ) : (
        <CustomerForm mode={draft.mode} draft={draft} />
      )}
    </PageShell>
  )
}
