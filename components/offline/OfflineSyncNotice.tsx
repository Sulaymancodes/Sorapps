'use client'

import { CheckCircle2, X } from 'lucide-react'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'

export function OfflineSyncNotice() {
  const offline = useOfflineSyncOptional()
  if (!offline?.notice) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-emerald-300/50 bg-emerald-50 px-4 py-2 text-xs text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100 sm:px-6">
      <span className="inline-flex items-center gap-2">
        <CheckCircle2 className="size-3.5 shrink-0" />
        {offline.notice}
      </span>
      <button
        type="button"
        onClick={offline.dismissNotice}
        className="rounded p-0.5 text-current/70 hover:text-current"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
