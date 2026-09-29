'use client'

import { CloudOff, PlusCircle, Users } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Button } from '@/components/ui/button'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { NewSalePageClient } from '@/app/(dashboard)/sales/new/new-sale-page-client'
import { SaleDraftsPageClient } from '@/app/(dashboard)/sales/drafts/drafts-page-client'
import { CustomerDraftsPageClient } from '@/app/(dashboard)/customers/drafts/drafts-page-client'
import { DeviceSyncEntryCard } from '@/components/offline/OfflineSyncButton'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import type { CachedDashboardUser, OfflineFieldView } from '@/lib/offline/app-shell'

export type { OfflineFieldView }

export function OfflineFieldHome({
  view,
  user,
  onViewChange,
}: {
  view: OfflineFieldView
  user: CachedDashboardUser
  onViewChange: (view: OfflineFieldView) => void
}) {
  if (view === 'sale') {
    return (
      <NewSalePageClient
        customers={[]}
        products={[]}
        forcedGeo={null}
        isAdmin={false}
        onBack={() => onViewChange('home')}
      />
    )
  }

  if (view === 'customer') {
    return (
      <PageShell>
        <PageHeader
          title="Add customer"
          description="Saved on this device while you are offline, then synced when the network returns."
          actions={
            <Button type="button" variant="outline" onClick={() => onViewChange('home')}>
              Back
            </Button>
          }
        />
        <CustomerForm mode="create" />
      </PageShell>
    )
  }

  if (view === 'drafts') {
    return (
      <div className="space-y-8">
        <PageShell>
          <PageHeader
            title="Drafts"
            description="Work saved on this device until it can sync."
            actions={
              <Button type="button" variant="outline" onClick={() => onViewChange('home')}>
                Back
              </Button>
            }
          />
        </PageShell>
        <SaleDraftsPageClient />
        <CustomerDraftsPageClient />
      </div>
    )
  }

  return <OfflineFieldMenu user={user} onViewChange={onViewChange} />
}

function OfflineFieldMenu({
  user,
  onViewChange,
}: {
  user: CachedDashboardUser
  onViewChange: (view: OfflineFieldView) => void
}) {
  const offline = useOfflineSyncOptional()
  const pending = offline?.pendingCount ?? 0

  return (
    <PageShell>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0] || user.name}`}
        description="This device is ready for field work without internet. Sync once when you enter, then add sales and customers at your own pace."
      />
      <DeviceSyncEntryCard />
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onViewChange('sale')}
          className="rounded-xl border border-border bg-card p-5 text-left hover:bg-muted/40"
        >
          <PlusCircle className="size-5 text-primary" />
          <p className="mt-3 font-medium">Add sale</p>
          <p className="mt-1 text-sm text-muted-foreground">Capture a sale, site photo, and GPS on this phone.</p>
        </button>
        <button
          type="button"
          onClick={() => onViewChange('customer')}
          className="rounded-xl border border-border bg-card p-5 text-left hover:bg-muted/40"
        >
          <Users className="size-5 text-primary" />
          <p className="mt-3 font-medium">Add customer</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a customer record even when the network is down.</p>
        </button>
        <button
          type="button"
          onClick={() => onViewChange('drafts')}
          className="rounded-xl border border-border bg-card p-5 text-left hover:bg-muted/40"
        >
          <CloudOff className="size-5 text-primary" />
          <p className="mt-3 font-medium">Drafts{pending > 0 ? ` (${pending})` : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">Review work saved on this device until it can sync.</p>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onViewChange('sale')}>
          Add sale
        </Button>
        <Button type="button" variant="outline" onClick={() => onViewChange('customer')}>
          Add customer
        </Button>
      </div>
    </PageShell>
  )
}
