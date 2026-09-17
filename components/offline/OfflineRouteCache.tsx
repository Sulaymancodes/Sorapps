'use client'

import { useEffect } from 'react'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import {
  offlineRoutesForUser,
  PUBLIC_OFFLINE_ROUTES,
  requestAppShellCache,
} from '@/lib/offline/app-shell'
import type { DashboardUser } from '@/components/layout/DashboardShell'

export function OfflineRouteCache({ user }: { user: DashboardUser }) {
  const offline = useOfflineSyncOptional()
  const isOnline = offline?.isOnline ?? true
  const role = user.role

  useEffect(() => {
    if (!isOnline) return
    void requestAppShellCache([
      ...offlineRoutesForUser({ role }),
      ...PUBLIC_OFFLINE_ROUTES,
    ])
  }, [isOnline, role])

  return null
}
