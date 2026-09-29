import {
  loadCachedDashboardUser,
  offlineRoutesForUser,
  PUBLIC_OFFLINE_ROUTES,
  requestAppShellCache,
} from '@/lib/offline/app-shell'
import { isBrowserOnline } from '@/lib/offline/network'
import { refreshOrgSettingsCache } from '@/lib/offline/org-settings'
import { refreshUnlockPoolSnapshot } from '@/lib/offline/sync-unlock-pool'
import type { CustomerDraftSyncReport } from '@/lib/offline/sync-customer-drafts'

export type DeviceSyncProgress = {
  percent: number
  label: string
}

export const DEVICE_SYNCED_KEY = 'sorapps-device-synced'

export function markDeviceSynced() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVICE_SYNCED_KEY, new Date().toISOString())
  } catch {
    // ignore
  }
}

export type DeviceSyncOutcome = {
  ok: boolean
  offline: boolean
  poolOk: boolean
  poolAvailable: number
  poolSold: number
  draftsSynced: number
  draftsFailed: number
  title: string
  message: string
}

const EMPTY_DRAFTS: CustomerDraftSyncReport = {
  attempted: 0,
  synced: 0,
  failed: 0,
  skipped: 0,
  skippedOffline: false,
  errors: [],
}

function completionCopy(input: {
  poolOk: boolean
  poolAvailable: number
  poolSold: number
  draftsSynced: number
  draftsFailed: number
}): Pick<DeviceSyncOutcome, 'ok' | 'title' | 'message'> {
  const pinLine =
    input.poolAvailable === 1
      ? '1 unused device PIN is saved on this phone'
      : `${input.poolAvailable} unused device PINs are saved on this phone`
  const soldLine =
    input.poolSold === 1
      ? 'and 1 sold serial is cached so you will not reuse it.'
      : `and ${input.poolSold} sold serials are cached so you will not reuse them.`

  if (input.poolOk && input.draftsFailed === 0) {
    const draftLine =
      input.draftsSynced === 0
        ? 'No drafts were waiting to send.'
        : input.draftsSynced === 1
          ? '1 draft from this phone was sent up as well.'
          : `${input.draftsSynced} drafts from this phone were sent up as well.`
    return {
      ok: true,
      title: "You're all set",
      message: `${pinLine}, ${soldLine} ${draftLine} Take your time — even if the network drops later, this phone already has what you need.`,
    }
  }

  if (input.poolOk) {
    return {
      ok: true,
      title: 'This phone is ready',
      message: `${pinLine}, ${soldLine} A few drafts still need a look when you have a moment. Nothing here is overdue.`,
    }
  }

  return {
    ok: false,
    title: "Sync didn't finish",
    message:
      'Try again when you have a signal. There is no rush — you can keep working and tap Sync whenever you are ready.',
  }
}

async function easeWhile<T>(
  from: number,
  to: number,
  label: string,
  work: Promise<T>,
  onProgress: (progress: DeviceSyncProgress) => void
): Promise<T> {
  onProgress({ percent: from, label })
  const span = Math.max(1, to - from)
  const started = Date.now()
  const timer = window.setInterval(() => {
    const t = Math.min(0.9, (Date.now() - started) / 7000)
    onProgress({ percent: Math.round(from + span * t), label })
  }, 180)
  try {
    return await work
  } finally {
    window.clearInterval(timer)
    onProgress({ percent: to, label })
  }
}

export async function syncThisDevice(options: {
  onProgress: (progress: DeviceSyncProgress) => void
  syncDrafts: () => Promise<CustomerDraftSyncReport>
}): Promise<DeviceSyncOutcome> {
  const { onProgress, syncDrafts } = options

  if (!isBrowserOnline()) {
    return {
      ok: false,
      offline: true,
      poolOk: false,
      poolAvailable: 0,
      poolSold: 0,
      draftsSynced: 0,
      draftsFailed: 0,
      title: 'Connect once to copy data onto this phone',
      message:
        'After a short Sync while online, unused device PINs stay on this phone. Then you can work at your own pace in the field.',
    }
  }

  onProgress({ percent: 4, label: 'Connecting…' })
  await refreshOrgSettingsCache()

  const pool = await easeWhile(
    8,
    42,
    'Saving unused device PINs on this phone…',
    refreshUnlockPoolSnapshot(),
    onProgress
  )

  const user = loadCachedDashboardUser()
  await easeWhile(
    46,
    72,
    'Saving the pages you use every day…',
    requestAppShellCache(
      [...offlineRoutesForUser({ role: user?.role }), ...PUBLIC_OFFLINE_ROUTES],
      { waitUntilDone: true, timeoutMs: 8000 }
    ),
    onProgress
  )

  let drafts = EMPTY_DRAFTS
  try {
    drafts = await easeWhile(
      76,
      94,
      'Sending drafts from this phone…',
      syncDrafts(),
      onProgress
    )
  } catch {
    drafts = { ...EMPTY_DRAFTS, failed: 1 }
  }

  onProgress({ percent: 100, label: 'Wrapping up…' })

  const copy = completionCopy({
    poolOk: pool.ok,
    poolAvailable: pool.available,
    poolSold: pool.sold,
    draftsSynced: drafts.synced,
    draftsFailed: drafts.failed,
  })

  return {
    ok: copy.ok,
    offline: false,
    poolOk: pool.ok,
    poolAvailable: pool.available,
    poolSold: pool.sold,
    draftsSynced: drafts.synced,
    draftsFailed: drafts.failed,
    title: copy.title,
    message: copy.message,
  }
}
