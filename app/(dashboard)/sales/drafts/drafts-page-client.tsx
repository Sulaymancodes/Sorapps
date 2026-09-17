'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CloudOff, Loader2, Pencil, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { useOfflineSync } from '@/components/offline/offline-sync-context'
import { formatDate } from '@/lib/utils/formatting'
import type { SaleDraft } from '@/lib/offline/sale-drafts'

function statusLabel(draft: SaleDraft) {
  if (draft.status === 'syncing') return 'Syncing'
  if (draft.status === 'failed') return 'Needs attention'
  return 'Pending sale'
}

export function SaleDraftsPageClient() {
  const router = useRouter()
  const {
    saleDrafts,
    customerDrafts,
    isOnline,
    isSyncing,
    pendingCount,
    syncNow,
    syncOneSale,
    removeSaleDraft,
  } = useOfflineSync()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...saleDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [saleDrafts]
  )

  async function handleSyncAll() {
    setActionError(null)
    const report = await syncNow({ includeFailed: true })
    if (report.skippedOffline) {
      setActionError('Connect to the internet to sync drafts.')
      return
    }
    if (report.synced > 0) router.refresh()
    if (report.failed > 0) {
      setActionError(report.errors[0]?.error || 'Some drafts could not be synced.')
    }
  }

  async function handleSyncOne(localId: string) {
    setActionError(null)
    setBusyId(localId)
    try {
      const report = await syncOneSale(localId)
      if (report.skippedOffline) {
        setActionError('Connect to the internet to sync this draft.')
        return
      }
      if (report.synced > 0) router.refresh()
      if (report.failed > 0) {
        setActionError(report.errors[0]?.error || 'Could not sync this draft.')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(draft: SaleDraft) {
    const ok = window.confirm(
      `Delete the local sale draft for ${draft.label || 'this sale'}? This only removes it from this device.`
    )
    if (!ok) return
    setActionError(null)
    await removeSaleDraft(draft.localId)
  }

  return (
    <PageShell>
      <PageHeader
        title="Sale drafts"
        description={
          sorted.length === 0
            ? 'Sales saved on this device while offline appear here until they sync'
            : `${sorted.length} sale ${sorted.length === 1 ? 'draft' : 'drafts'} waiting to sync`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/sales/new">
              <Button variant="outline">New sale</Button>
            </Link>
            <Button
              className="gap-2"
              disabled={!isOnline || isSyncing || pendingCount === 0}
              onClick={() => void handleSyncAll()}
            >
              {isSyncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Sync now
            </Button>
          </div>
        }
      />

      {!isOnline && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          You are offline. Drafts stay on this device — including KYC, site photo, and GPS — until
          you reconnect.
        </div>
      )}

      {customerDrafts.length > 0 && (
        <div className="rounded-lg border border-border/70 bg-card px-4 py-3 text-sm">
          {customerDrafts.length} customer {customerDrafts.length === 1 ? 'draft' : 'drafts'} also
          waiting.{' '}
          <Link href="/customers/drafts" className="font-medium text-primary hover:underline">
            Review customer drafts
          </Link>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Panel padded={false}>
        {sorted.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CloudOff className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No sale drafts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When you tap Create sale without a network, the full sale is stored here.
            </p>
            <Link href="/sales/new" className="mt-4 inline-block">
              <Button>New sale</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/40">
                  {['Customer', 'GPS / files', 'Saved', 'Status', 'Action'].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((draft) => (
                  <tr
                    key={draft.localId}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium">{draft.label || 'Untitled sale'}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.values.payment_type === 'installment' ? 'PAYGO' : 'Full payment'}
                        {draft.values.new_customer.city
                          ? ` · ${draft.values.new_customer.city}`
                          : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      Photo {draft.sitePhoto ? 'saved' : 'missing'}
                      {draft.siteGps?.locked ? ' · GPS locked' : ''}
                      {draft.documents.length
                        ? ` · ${draft.documents.length} KYC file${draft.documents.length === 1 ? '' : 's'}`
                        : ''}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {formatDate(new Date(draft.updatedAt))}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          draft.status === 'failed'
                            ? 'inline-flex rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                            : 'inline-flex rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200'
                        }
                      >
                        {statusLabel(draft)}
                      </span>
                      {draft.syncError && (
                        <p className="mt-1 max-w-xs text-xs text-destructive">{draft.syncError}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/sales/drafts/${draft.localId}`}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Pencil className="size-3" />
                            Edit
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={!isOnline || isSyncing || busyId === draft.localId}
                          onClick={() => void handleSyncOne(draft.localId)}
                        >
                          {busyId === draft.localId ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          Sync
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleDelete(draft)}
                        >
                          <Trash2 className="size-3" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
