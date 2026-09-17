'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CloudOff,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOfflineSync } from '@/components/offline/offline-sync-context'
import { cn } from '@/lib/utils'

export function OfflineSyncButton() {
  const router = useRouter()
  const {
    isOnline,
    isSyncing,
    pendingCount,
    drafts,
    saleDrafts,
    notice,
    lastReport,
    syncNow,
    dismissNotice,
  } = useOfflineSync()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleSync() {
    const report = await syncNow()
    if (report.synced > 0) router.refresh()
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={isOnline ? 'Sync customer drafts' : 'Offline — customer drafts'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {isSyncing ? (
          <Loader2 className="size-5 animate-spin" />
        ) : isOnline ? (
          <RefreshCw className="size-5" />
        ) : (
          <WifiOff className="size-5" />
        )}
        {pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(100vw-2rem,340px)] overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl">
          <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold">Offline drafts</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {isOnline ? (
                  <Wifi className="size-3.5 text-emerald-600" />
                ) : (
                  <WifiOff className="size-3.5 text-amber-600" />
                )}
                {isOnline ? 'Online' : 'Offline'}
                {pendingCount > 0 ? ` · ${pendingCount} waiting` : ' · nothing pending'}
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              className="gap-1"
              disabled={!isOnline || isSyncing || pendingCount === 0}
              onClick={() => void handleSync()}
            >
              {isSyncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Sync now
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {saleDrafts.length === 0 && drafts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No drafts on this device
              </p>
            ) : (
              <>
                {saleDrafts.slice(0, 4).map((draft) => (
                  <Link
                    key={draft.localId}
                    href={`/sales/drafts/${draft.localId}`}
                    onClick={() => setOpen(false)}
                    className="block border-b border-border/50 px-4 py-3 last:border-0 hover:bg-muted/40"
                  >
                    <div className="flex items-start gap-2">
                      <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {draft.label || 'Untitled sale'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Sale draft
                          {draft.siteGps?.locked ? ' · GPS saved' : ''}
                          {draft.documents.length ? ` · ${draft.documents.length} KYC` : ''}
                          {draft.status === 'failed' ? ' · needs attention' : ' · pending sync'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {drafts.slice(0, 4).map((draft) => (
                  <Link
                    key={draft.localId}
                    href={`/customers/drafts/${draft.localId}`}
                    onClick={() => setOpen(false)}
                    className="block border-b border-border/50 px-4 py-3 last:border-0 hover:bg-muted/40"
                  >
                    <div className="flex items-start gap-2">
                      <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {draft.payload.name || 'Untitled customer'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Customer draft
                          {draft.payload.city ? ` · ${draft.payload.city}` : ''}
                          {draft.status === 'failed' ? ' · needs attention' : ' · pending sync'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>

          {(notice || lastReport?.failed) && (
            <div
              className={cn(
                'border-t border-border/70 px-4 py-2 text-xs',
                lastReport && lastReport.failed > 0 && lastReport.synced === 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              )}
            >
              {notice || lastReport?.errors[0]?.error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2">
            <Link
              href="/sales/drafts"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all drafts
            </Link>
            {notice && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={dismissNotice}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
