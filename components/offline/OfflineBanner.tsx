'use client'

import { WifiOff } from 'lucide-react'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'

export function OfflineBanner() {
  const offline = useOfflineSyncOptional()
  if (!offline || offline.isOnline) return null

  return (
    <div className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100 sm:px-6">
      <WifiOff className="size-3.5 shrink-0" />
      <p>
        You are offline. Sales and customers are saved as drafts on this device — including KYC,
        site photo, and GPS — and will sync when the network returns.
      </p>
    </div>
  )
}
