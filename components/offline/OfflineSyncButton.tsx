'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOfflineSync } from '@/components/offline/offline-sync-context'
import { DEVICE_SYNCED_KEY } from '@/lib/offline/sync-device'
import { cn } from '@/lib/utils'

export function OfflineSyncButton() {
  const { isOnline, deviceSync, syncDevice } = useOfflineSync()
  const busy = deviceSync.phase === 'running'
  const [needsFirstSync, setNeedsFirstSync] = useState(false)

  useEffect(() => {
    try {
      setNeedsFirstSync(!window.localStorage.getItem(DEVICE_SYNCED_KEY))
    } catch {
      setNeedsFirstSync(false)
    }
  }, [deviceSync.phase])

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'relative gap-1.5 px-2.5',
        !isOnline && 'text-muted-foreground',
        needsFirstSync && !busy && 'ring-2 ring-primary/35'
      )}
      aria-label={isOnline ? 'Sync this phone' : 'Offline — connect to sync this phone'}
      disabled={busy}
      onClick={() => void syncDevice()}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isOnline ? (
        <RefreshCw className="size-3.5" />
      ) : (
        <WifiOff className="size-3.5" />
      )}
      <span>Sync</span>
    </Button>
  )
}

export function DeviceSyncEntryCard() {
  const { isOnline, deviceSync, pendingCount, syncDevice } = useOfflineSync()
  const busy = deviceSync.phase === 'running'

  return (
    <button
      type="button"
      onClick={() => void syncDevice()}
      disabled={busy}
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-left hover:bg-primary/10 disabled:opacity-70"
    >
      <RefreshCw className={cn('size-5 text-primary', busy && 'animate-spin')} />
      <p className="mt-3 font-medium">Sync this phone</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {isOnline
          ? 'Copy unused device PINs and pages onto this phone. Tap any time — there is no rush.'
          : 'Connect once to copy data onto this phone, then work at your own pace.'}
        {pendingCount > 0
          ? ` ${pendingCount} draft${pendingCount === 1 ? '' : 's'} waiting to go up.`
          : ''}
      </p>
    </button>
  )
}
