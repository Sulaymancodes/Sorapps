'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteCustomerDraft,
  listCustomerDrafts,
  pendingDraftCount,
  subscribeToDraftsChanged,
  type CustomerDraft,
} from '@/lib/offline/customer-drafts'
import {
  deleteSaleDraft,
  listSaleDrafts,
  type SaleDraft,
} from '@/lib/offline/sale-drafts'
import { isBrowserOnline, subscribeToNetworkStatus } from '@/lib/offline/network'
import {
  syncAllCustomerDrafts,
  syncCustomerDraft,
  type CustomerDraftSyncReport,
} from '@/lib/offline/sync-customer-drafts'
import { syncAllSaleDrafts, syncSaleDraft } from '@/lib/offline/sync-sale-drafts'
import { refreshUnlockPoolSnapshot } from '@/lib/offline/sync-unlock-pool'
import { syncThisDevice, markDeviceSynced } from '@/lib/offline/sync-device'
import { releaseUnlocksForDraft } from '@/lib/offline/unlock-pool'
import {
  DeviceSyncOverlay,
  type DeviceSyncView,
} from '@/components/offline/DeviceSyncOverlay'

function mergeReports(
  a: CustomerDraftSyncReport,
  b: CustomerDraftSyncReport
): CustomerDraftSyncReport {
  return {
    attempted: a.attempted + b.attempted,
    synced: a.synced + b.synced,
    failed: a.failed + b.failed,
    skipped: (a.skipped || 0) + (b.skipped || 0),
    skippedOffline: a.skippedOffline || b.skippedOffline,
    errors: [...a.errors, ...b.errors],
  }
}

const emptyDraftReport = (): CustomerDraftSyncReport => ({
  attempted: 0,
  synced: 0,
  failed: 0,
  skipped: 0,
  skippedOffline: false,
  errors: [],
})

const idleDeviceSync = (): DeviceSyncView => ({
  phase: 'idle',
  percent: 0,
  label: '',
})

type OfflineSyncContextValue = {
  ready: boolean
  isOnline: boolean
  isSyncing: boolean
  drafts: CustomerDraft[]
  customerDrafts: CustomerDraft[]
  saleDrafts: SaleDraft[]
  pendingCount: number
  lastReport: CustomerDraftSyncReport | null
  notice: string | null
  deviceSync: DeviceSyncView
  refreshDrafts: () => Promise<void>
  syncNow: (options?: { includeFailed?: boolean }) => Promise<CustomerDraftSyncReport>
  syncDevice: () => Promise<void>
  dismissDeviceSync: () => void
  syncDraft: (localId: string) => Promise<CustomerDraftSyncReport>
  removeDraft: (localId: string) => Promise<void>
  removeSaleDraft: (localId: string) => Promise<void>
  syncOneSale: (localId: string) => Promise<CustomerDraftSyncReport>
  dismissNotice: () => void
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null)

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [drafts, setDrafts] = useState<CustomerDraft[]>([])
  const [saleDrafts, setSaleDrafts] = useState<SaleDraft[]>([])
  const [lastReport, setLastReport] = useState<CustomerDraftSyncReport | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deviceSync, setDeviceSync] = useState<DeviceSyncView>(idleDeviceSync)
  const syncingRef = useRef(false)
  const deviceSyncingRef = useRef(false)
  const noticeTimer = useRef<number | null>(null)

  const refreshDrafts = useCallback(async () => {
    try {
      const [customerRows, saleRows] = await Promise.all([
        listCustomerDrafts(),
        listSaleDrafts(),
      ])
      setDrafts(customerRows)
      setSaleDrafts(saleRows)
    } catch {
      setDrafts([])
      setSaleDrafts([])
    } finally {
      setReady(true)
    }
  }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 7000)
  }, [])

  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNotice(null)
  }, [])

  const runSync = useCallback(
    async (
      fn: () => Promise<CustomerDraftSyncReport>,
      options?: { silent?: boolean }
    ) => {
      if (syncingRef.current) {
        return lastReport ?? emptyDraftReport()
      }
      syncingRef.current = true
      setIsSyncing(true)
      try {
        const report = await fn()
        setLastReport(report)
        await refreshDrafts()
        if (report.synced > 0) {
          router.refresh()
          if (!deviceSyncingRef.current) void refreshUnlockPoolSnapshot()
        }
        if (options?.silent) return report
        if (report.skippedOffline && report.attempted === 0) {
          return report
        }
        if (report.synced > 0 && report.failed === 0) {
          showNotice(
            report.synced === 1
              ? 'Synced 1 draft'
              : `Synced ${report.synced} drafts`
          )
        } else if (report.synced > 0 && report.failed > 0) {
          showNotice(`Synced ${report.synced}, ${report.failed} still need attention`)
        } else if (report.failed > 0 && !report.skippedOffline) {
          showNotice(report.errors[0]?.error || 'Some drafts could not be synced')
        }
        return report
      } finally {
        syncingRef.current = false
        setIsSyncing(false)
      }
    },
    [lastReport, refreshDrafts, router, showNotice]
  )

  const syncNow = useCallback(
    (options?: { includeFailed?: boolean; silent?: boolean }) => {
      if (deviceSyncingRef.current && !options?.silent) {
        return Promise.resolve(lastReport ?? emptyDraftReport())
      }
      return runSync(
        async () => {
          const includeFailed = options?.includeFailed ?? true
          const sales = await syncAllSaleDrafts({ includeFailed })
          const customers = await syncAllCustomerDrafts({ includeFailed })
          return mergeReports(sales, customers)
        },
        { silent: options?.silent }
      )
    },
    [lastReport, runSync]
  )
  const syncNowRef = useRef(syncNow)
  syncNowRef.current = syncNow

  const dismissDeviceSync = useCallback(() => {
    setDeviceSync(idleDeviceSync())
  }, [])

  const syncDevice = useCallback(async () => {
    if (deviceSyncingRef.current) return
    deviceSyncingRef.current = true
    setDeviceSync({
      phase: 'running',
      percent: 2,
      label: 'Starting…',
    })
    try {
      while (syncingRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 120))
      }
      const outcome = await syncThisDevice({
        onProgress: (progress) => {
          setDeviceSync({
            phase: 'running',
            percent: progress.percent,
            label: progress.label,
          })
        },
        syncDrafts: () => syncNow({ includeFailed: true, silent: true }),
      })
      if (outcome.draftsSynced > 0) router.refresh()
      await refreshDrafts()
      if (outcome.ok) markDeviceSynced()
      setDeviceSync({
        phase: outcome.offline ? 'offline' : outcome.ok ? 'done' : 'error',
        percent: 100,
        label: '',
        title: outcome.title,
        message: outcome.message,
      })
    } catch {
      setDeviceSync({
        phase: 'error',
        percent: 100,
        label: '',
        title: "Sync didn't finish",
        message:
          'Try again when you have a moment. Nothing is overdue — this phone can wait until you are ready.',
      })
    } finally {
      deviceSyncingRef.current = false
    }
  }, [refreshDrafts, router, syncNow])

  const syncDraft = useCallback(
    (localId: string) => runSync(() => syncCustomerDraft(localId)),
    [runSync]
  )

  const syncOneSale = useCallback(
    (localId: string) => runSync(() => syncSaleDraft(localId)),
    [runSync]
  )

  const removeDraft = useCallback(
    async (localId: string) => {
      await deleteCustomerDraft(localId)
      await refreshDrafts()
    },
    [refreshDrafts]
  )

  const removeSaleDraftById = useCallback(
    async (localId: string) => {
      await releaseUnlocksForDraft(localId)
      await deleteSaleDraft(localId)
      await refreshDrafts()
    },
    [refreshDrafts]
  )

  useEffect(() => {
    setIsOnline(isBrowserOnline())
    void refreshDrafts()
    if (isBrowserOnline()) void refreshUnlockPoolSnapshot()
    const unsubNet = subscribeToNetworkStatus((online) => {
      setIsOnline(online)
      if (online) void refreshUnlockPoolSnapshot()
    })
    const unsubDrafts = subscribeToDraftsChanged(() => {
      void refreshDrafts()
    })
    return () => {
      unsubNet()
      unsubDrafts()
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [refreshDrafts])

  useEffect(() => {
    if (!ready || !isOnline) return
    const timer = window.setTimeout(() => {
      if (!deviceSyncingRef.current) void syncNowRef.current({ includeFailed: false })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [ready, isOnline])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && isBrowserOnline() && !deviceSyncingRef.current) {
        void refreshUnlockPoolSnapshot()
        void syncNowRef.current({ includeFailed: false })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const pendingCount =
    pendingDraftCount(drafts) + saleDrafts.filter((d) => d.status !== 'syncing').length

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      ready,
      isOnline,
      isSyncing,
      drafts,
      customerDrafts: drafts,
      saleDrafts,
      pendingCount,
      lastReport,
      notice,
      deviceSync,
      refreshDrafts,
      syncNow,
      syncDevice,
      dismissDeviceSync,
      syncDraft,
      removeDraft,
      removeSaleDraft: removeSaleDraftById,
      syncOneSale,
      dismissNotice,
    }),
    [
      drafts,
      saleDrafts,
      isOnline,
      isSyncing,
      lastReport,
      notice,
      deviceSync,
      pendingCount,
      ready,
      refreshDrafts,
      removeDraft,
      removeSaleDraftById,
      syncDraft,
      syncNow,
      syncDevice,
      dismissDeviceSync,
      syncOneSale,
      dismissNotice,
    ]
  )

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
      <DeviceSyncOverlay state={deviceSync} onDismiss={dismissDeviceSync} />
    </OfflineSyncContext.Provider>
  )
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext)
  if (!ctx) {
    throw new Error('useOfflineSync must be used within OfflineSyncProvider')
  }
  return ctx
}

export function useOfflineSyncOptional() {
  return useContext(OfflineSyncContext)
}
