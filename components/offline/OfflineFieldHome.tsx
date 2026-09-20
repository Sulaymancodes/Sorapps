'use client'

import Link from 'next/link'
import { CloudOff, PlusCircle, Users } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Button } from '@/components/ui/button'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { NewSalePageClient } from '@/app/(dashboard)/sales/new/new-sale-page-client'
import { SaleDraftsPageClient } from '@/app/(dashboard)/sales/drafts/drafts-page-client'
import { CustomerDraftsPageClient } from '@/app/(dashboard)/customers/drafts/drafts-page-client'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import type { CachedDashboardUser } from '@/lib/offline/app-shell'

export type OfflineFieldView = 'home' | 'sale' | 'customer' | 'drafts'

export function OfflineFieldHome({
  view,
  user,
}: {
  view: OfflineFieldView
  user: CachedDashboardUser
}) {
  if (view === 'sale') {
    return <NewSalePageClient customers={[]} products={[]} forcedGeo={null} isAdmin={false} />
  }

  if (view === 'customer') {
    return (
      <PageShell>
        <PageHeader
          title="Add customer"
          description="Saved on this device while you are offline, then synced when the network returns."
        />
        <CustomerForm mode="create" />
      </PageShell>
    )
  }

  if (view === 'drafts') {
    return (
      <div className="space-y-8">
        <SaleDraftsPageClient />
        <CustomerDraftsPageClient />
      </div>
    )
  }

  return <OfflineFieldMenu user={user} />
}

function OfflineFieldMenu({ user }: { user: CachedDashboardUser }) {
  const offline = useOfflineSyncOptional()
  const pending = offline?.pendingCount ?? 0

  return (
    <PageShell>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0] || user.name}`}
        description="This device is ready for field work without internet. New sales and customers are saved as drafts until you reconnect."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/~offline?view=sale"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <PlusCircle className="size-5 text-primary" />
          <p className="mt-3 font-medium">Add sale</p>
          <p className="mt-1 text-sm text-muted-foreground">Capture a sale, site photo, and GPS on this phone.</p>
        </Link>
        <Link
          href="/~offline?view=customer"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <Users className="size-5 text-primary" />
          <p className="mt-3 font-medium">Add customer</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a customer record even when the network is down.</p>
        </Link>
        <Link
          href="/~offline?view=drafts"
          className="rounded-xl border border-border bg-card p-5 hover:bg-muted/40"
        >
          <CloudOff className="size-5 text-primary" />
          <p className="mt-3 font-medium">Drafts{pending > 0 ? ` (${pending})` : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">Review work saved on this device until it can sync.</p>
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/~offline?view=sale">
          <Button>Add sale</Button>
        </Link>
        <Link href="/~offline?view=customer">
          <Button variant="outline">Add customer</Button>
        </Link>
      </div>
    </PageShell>
  )
}
