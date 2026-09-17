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
  refreshDrafts: () => Promise<void>
  syncNow: (options?: { includeFailed?: boolean }) => Promise<CustomerDraftSyncReport>
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
  const syncingRef = useRef(false)
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
    async (fn: () => Promise<CustomerDraftSyncReport>) => {
      if (syncingRef.current) {
        return (
          lastReport ?? {
            attempted: 0,
            synced: 0,
            failed: 0,
            skipped: 0,
            skippedOffline: false,
            errors: [],
          }
        )
      }
      syncingRef.current = true
      setIsSyncing(true)
      try {
        const report = await fn()
        setLastReport(report)
        await refreshDrafts()
        if (report.synced > 0) {
          router.refresh()
        }
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
    (options?: { includeFailed?: boolean }) =>
      runSync(async () => {
        const includeFailed = options?.includeFailed ?? true
        const sales = await syncAllSaleDrafts({ includeFailed })
        const customers = await syncAllCustomerDrafts({ includeFailed })
        return mergeReports(sales, customers)
      }),
    [runSync]
  )
  const syncNowRef = useRef(syncNow)
  syncNowRef.current = syncNow

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
      await deleteSaleDraft(localId)
      await refreshDrafts()
    },
    [refreshDrafts]
  )

  useEffect(() => {
    setIsOnline(isBrowserOnline())
    void refreshDrafts()
    const unsubNet = subscribeToNetworkStatus((online) => setIsOnline(online))
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
      void syncNowRef.current({ includeFailed: false })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [ready, isOnline])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && isBrowserOnline()) {
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
      refreshDrafts,
      syncNow,
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
      pendingCount,
      ready,
      refreshDrafts,
      removeDraft,
      removeSaleDraftById,
      syncDraft,
      syncNow,
      syncOneSale,
      dismissNotice,
    ]
  )

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>
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
