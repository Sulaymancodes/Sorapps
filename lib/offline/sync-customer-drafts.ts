import {
  createCustomerAction,
  updateCustomerAction,
} from '@/app/actions/customers'
import {
  deleteCustomerDraft,
  listCustomerDrafts,
  updateCustomerDraft,
  type CustomerDraft,
} from '@/lib/offline/customer-drafts'
import { isBrowserOnline, isLikelyNetworkError } from '@/lib/offline/network'
import {
  formatDuplicateMatch,
  identityDuplicates,
  scanDraftDuplicates,
} from '@/lib/offline/check-draft-duplicates'

export type CustomerDraftSyncReport = {
  attempted: number
  synced: number
  failed: number
  skipped: number
  skippedOffline: boolean
  errors: Array<{ localId: string; name: string; error: string }>
}

function emptyReport(partial?: Partial<CustomerDraftSyncReport>): CustomerDraftSyncReport {
  return {
    attempted: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    skippedOffline: false,
    errors: [],
    ...partial,
  }
}

async function syncOneDraft(draft: CustomerDraft) {
  await updateCustomerDraft(draft.localId, { status: 'syncing', syncError: null })

  const payload = draft.payload as Parameters<typeof createCustomerAction>[0]
  const scan = await scanDraftDuplicates({
    name: payload.name,
    phone: payload.phone || payload.guardian_phone,
    nin: payload.nin,
    bvn: payload.bvn,
    city: payload.city,
    state: payload.state,
    lga: payload.lga,
    address: [
      payload.address_building_features,
      payload.address_street,
      payload.address_landmark,
    ]
      .map((part) => (part || '').trim())
      .filter(Boolean)
      .join(' | '),
    exclude_id: draft.mode === 'edit' ? draft.remoteId : undefined,
  })

  const identityHits = identityDuplicates(scan)
  if (identityHits.length) {
    const message = formatDuplicateMatch(identityHits[0])
    await updateCustomerDraft(draft.localId, { status: 'failed', syncError: message })
    return { ok: false as const, error: message }
  }

  const result =
    draft.mode === 'edit' && draft.remoteId
      ? await updateCustomerAction(draft.remoteId, payload)
      : await createCustomerAction(payload)

  if (!result.success) {
    await updateCustomerDraft(draft.localId, {
      status: 'failed',
      syncError: result.error,
    })
    return { ok: false as const, error: result.error }
  }

  await deleteCustomerDraft(draft.localId)
  return { ok: true as const }
}

export async function syncCustomerDraft(localId: string): Promise<CustomerDraftSyncReport> {
  if (!isBrowserOnline()) {
    return emptyReport({ skippedOffline: true })
  }

  const draft = (await listCustomerDrafts()).find((row) => row.localId === localId)
  if (!draft) return emptyReport()

  try {
    const result = await syncOneDraft(draft)
    if (result.ok) {
      return emptyReport({ attempted: 1, synced: 1 })
    }
    return emptyReport({
      attempted: 1,
      failed: 1,
      errors: [{ localId: draft.localId, name: draft.payload.name, error: result.error }],
    })
  } catch (error) {
    const message = isLikelyNetworkError(error)
      ? 'No network — will retry when you are back online'
      : error instanceof Error
        ? error.message
        : 'Failed to sync draft'
    await updateCustomerDraft(draft.localId, {
      status: isLikelyNetworkError(error) ? 'pending' : 'failed',
      syncError: message,
    })
    return emptyReport({
      attempted: 1,
      failed: 1,
      skippedOffline: isLikelyNetworkError(error),
      errors: [{ localId: draft.localId, name: draft.payload.name, error: message }],
    })
  }
}

export async function syncAllCustomerDrafts(options?: {
  includeFailed?: boolean
}): Promise<CustomerDraftSyncReport> {
  if (!isBrowserOnline()) {
    return emptyReport({ skippedOffline: true })
  }

  const includeFailed = options?.includeFailed ?? true
  const drafts = (await listCustomerDrafts()).filter((draft) => {
    if (draft.status === 'syncing') return false
    if (draft.status === 'failed' && !includeFailed) return false
    return true
  })
  const report = emptyReport({ attempted: drafts.length })

  for (const draft of drafts) {
    try {
      const result = await syncOneDraft(draft)
      if (result.ok) {
        report.synced += 1
      } else {
        report.failed += 1
        report.errors.push({
          localId: draft.localId,
          name: draft.payload.name,
          error: result.error,
        })
      }
    } catch (error) {
      const network = isLikelyNetworkError(error)
      const message = network
        ? 'No network — will retry when you are back online'
        : error instanceof Error
          ? error.message
          : 'Failed to sync draft'
      await updateCustomerDraft(draft.localId, {
        status: network ? 'pending' : 'failed',
        syncError: message,
      })
      report.failed += 1
      report.errors.push({
        localId: draft.localId,
        name: draft.payload.name,
        error: message,
      })
      if (network) {
        report.skippedOffline = true
        break
      }
    }
  }

  return report
}
