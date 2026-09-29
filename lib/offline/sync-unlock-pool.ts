import { getUnlockPoolAction } from '@/app/actions/unlocks'
import { isBrowserOnline } from '@/lib/offline/network'
import { replaceUnlockSnapshot } from '@/lib/offline/unlock-pool'

export type UnlockPoolRefreshResult = {
  ok: boolean
  available: number
  sold: number
}

export async function refreshUnlockPoolSnapshot(): Promise<UnlockPoolRefreshResult> {
  if (!isBrowserOnline()) return { ok: false, available: 0, sold: 0 }
  try {
    const result = await getUnlockPoolAction()
    if (!result.success) return { ok: false, available: 0, sold: 0 }
    await replaceUnlockSnapshot(result.data)
    return {
      ok: true,
      available: result.data.available.length,
      sold: result.data.sold.length,
    }
  } catch {
    return { ok: false, available: 0, sold: 0 }
  }
}
