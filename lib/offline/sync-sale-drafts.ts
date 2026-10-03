import { checkSoldSerialsAction, createSaleAction } from '@/app/actions/sales'
import {
  deleteSaleDraft,
  listSaleDrafts,
  updateSaleDraft,
  type SaleDraft,
} from '@/lib/offline/sale-drafts'
import { isBrowserOnline, isLikelyNetworkError } from '@/lib/offline/network'
import { uploadPendingDocuments, uploadSitePhotoFile } from '@/lib/offline/upload-blobs'
import type { CustomerDraftSyncReport } from '@/lib/offline/sync-customer-drafts'
import {
  formatDuplicateMatch,
  identityDuplicates,
  saleItemSerials,
  scanDraftDuplicates,
  serialDuplicates,
} from '@/lib/offline/check-draft-duplicates'
import { soldSerialMessage } from '@/lib/utils/serial'
import { consumeUnlocksLocally } from '@/lib/offline/unlock-pool'
import { refreshUnlockPoolSnapshot } from '@/lib/offline/sync-unlock-pool'

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

function draftLabel(draft: SaleDraft) {
  return draft.label || draft.values.new_customer.name || 'Untitled sale'
}

async function syncOneSaleDraft(draft: SaleDraft) {
  await updateSaleDraft(draft.localId, { status: 'syncing', syncError: null })

  const values = draft.values
  const nc = values.new_customer
  const serials = saleItemSerials(values.items)
  const scan = await scanDraftDuplicates({
    name: values.customer_mode === 'new' ? nc.name : undefined,
    phone:
      values.customer_mode === 'new' ? nc.phone || nc.guardian_phone : undefined,
    nin: values.customer_mode === 'new' ? nc.nin : undefined,
    bvn: values.customer_mode === 'new' ? nc.bvn : undefined,
    city: values.customer_mode === 'new' ? nc.city : undefined,
    state: values.customer_mode === 'new' ? nc.state : undefined,
    lga: values.customer_mode === 'new' ? nc.lga : undefined,
    address:
      values.customer_mode === 'new'
        ? [nc.address_building_features, nc.address_street, nc.address_landmark]
            .map((part) => (part || '').trim())
            .filter(Boolean)
            .join(' | ')
        : undefined,
    serial: serials,
    exclude_id: values.customer_mode === 'existing' ? values.customer_id : undefined,
  })

  const serialHits = serialDuplicates(scan)
  const identityHits = identityDuplicates(scan)
  const blockingHit = serialHits[0] || (values.customer_mode === 'new' ? identityHits[0] : undefined)
  if (blockingHit) {
    const message = formatDuplicateMatch(blockingHit)
    await updateSaleDraft(draft.localId, { status: 'failed', syncError: message })
    return { ok: false as const, error: message }
  }

  const sold = await checkSoldSerialsAction(serials)
  if (!sold.success) {
    await updateSaleDraft(draft.localId, { status: 'failed', syncError: sold.error })
    return { ok: false as const, error: sold.error }
  }
  if (sold.data.hits[0]) {
    const message = soldSerialMessage(sold.data.hits[0])
    await updateSaleDraft(draft.localId, { status: 'failed', syncError: message })
    return { ok: false as const, error: message }
  }

  const customerId =
    values.customer_mode === 'existing' ? values.customer_id : undefined
  const newCustomer =
    values.customer_mode === 'new'
      ? {
          name: nc.name.trim(),
          email: nc.email.trim(),
          phone: nc.phone.trim(),
          alternate_phone: '',
          nin: nc.nin,
          bvn: nc.bvn,
          address: '',
          address_house_number: nc.address_house_number.trim(),
          address_building_features: nc.address_building_features.trim(),
          address_street: nc.address_street.trim(),
          address_landmark: nc.address_landmark.trim(),
          city: nc.city.trim(),
          state: nc.state.trim(),
          lga: nc.lga.trim(),
          business_type: nc.customer_type || nc.business_type,
          gender: nc.gender.trim(),
          customer_category: nc.customer_category.trim(),
          customer_type: nc.customer_type.trim(),
          credit_limit: 0,
          is_minor: Boolean(nc.is_minor),
          guardian_name: nc.guardian_name.trim(),
          guardian_phone: nc.guardian_phone.trim(),
          guardian_relationship: nc.guardian_relationship.trim(),
          next_of_kin_name: nc.next_of_kin_name.trim(),
          next_of_kin_phone: nc.next_of_kin_phone.trim(),
          next_of_kin_relationship: nc.next_of_kin_relationship.trim(),
        }
      : undefined

  const sitePhotoUrl = await uploadSitePhotoFile(draft.sitePhoto)
  const documents = await uploadPendingDocuments(draft.documents)
  const gps = draft.siteGps
  const costToEndUser = Number(values.cost_to_end_user_ngn) || 0
  const downpayment = costToEndUser

  const result = await createSaleAction({
    customer_id: customerId,
    new_customer: newCustomer,
    payment_type: 'full',
    payment_method: values.payment_method,
    installment_interval_days: undefined,
    plan_end_date: undefined,
    discount_percent: 0,
    transport_cost: 0,
    notes: '',
    dares_type_of_payment: values.dares_type_of_payment.trim(),
    dares_payment_plan: values.dares_payment_plan.trim(),
    retail_cost_ngn: Number(values.retail_cost_ngn) || 0,
    cost_to_end_user_ngn: costToEndUser,
    downpayment_amount_ngn: downpayment,
    items: values.items
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity) || 1,
        serial_number: item.serial_number.trim(),
      })),
    site_gps: {
      latitude: gps.latitude,
      longitude: gps.longitude,
      captured_at: gps.captured_at,
      locked: true as const,
      out_of_area: gps.out_of_area,
      deployment_area_id: gps.deployment_area_id ?? null,
      deployment_area_name: gps.deployment_area_name ?? null,
      subsidy_level: gps.subsidy_level ?? null,
      out_of_area_reason: gps.out_of_area_reason ?? null,
    },
    site_photo_url: sitePhotoUrl,
    documents: documents.length ? documents : undefined,
    unlock_pin: values.unlock_pin?.trim() || undefined,
  })

  if (!result.success) {
    await updateSaleDraft(draft.localId, { status: 'failed', syncError: result.error })
    return { ok: false as const, error: result.error }
  }

  await deleteSaleDraft(draft.localId)
  await consumeUnlocksLocally(serials, {
    sale_id: result.data.sale.id,
    customer_id: result.data.sale.customer_id,
    customer_name: draft.label,
  })
  void refreshUnlockPoolSnapshot()
  return { ok: true as const }
}

export async function syncSaleDraft(localId: string): Promise<CustomerDraftSyncReport> {
  if (!isBrowserOnline()) return emptyReport({ skippedOffline: true })
  const draft = (await listSaleDrafts()).find((row) => row.localId === localId)
  if (!draft) return emptyReport()

  try {
    const result = await syncOneSaleDraft(draft)
    if (result.ok) return emptyReport({ attempted: 1, synced: 1 })
    return emptyReport({
      attempted: 1,
      failed: 1,
      errors: [{ localId: draft.localId, name: draftLabel(draft), error: result.error }],
    })
  } catch (error) {
    const network = isLikelyNetworkError(error)
    const message = network
      ? 'No network — will retry when you are back online'
      : error instanceof Error
        ? error.message
        : 'Failed to sync sale draft'
    await updateSaleDraft(draft.localId, {
      status: network ? 'pending' : 'failed',
      syncError: message,
    })
    return emptyReport({
      attempted: 1,
      failed: 1,
      skippedOffline: network,
      errors: [{ localId: draft.localId, name: draftLabel(draft), error: message }],
    })
  }
}

export async function syncAllSaleDrafts(options?: {
  includeFailed?: boolean
}): Promise<CustomerDraftSyncReport> {
  if (!isBrowserOnline()) return emptyReport({ skippedOffline: true })

  const includeFailed = options?.includeFailed ?? true
  const drafts = (await listSaleDrafts()).filter((draft) => {
    if (draft.status === 'syncing') return false
    if (draft.status === 'failed' && !includeFailed) return false
    return true
  })
  const report = emptyReport({ attempted: drafts.length })

  for (const draft of drafts) {
    try {
      const result = await syncOneSaleDraft(draft)
      if (result.ok) {
        report.synced += 1
      } else {
        report.failed += 1
        report.errors.push({
          localId: draft.localId,
          name: draftLabel(draft),
          error: result.error,
        })
      }
    } catch (error) {
      const network = isLikelyNetworkError(error)
      const message = network
        ? 'No network — will retry when you are back online'
        : error instanceof Error
          ? error.message
          : 'Failed to sync sale draft'
      await updateSaleDraft(draft.localId, {
        status: network ? 'pending' : 'failed',
        syncError: message,
      })
      report.failed += 1
      report.errors.push({
        localId: draft.localId,
        name: draftLabel(draft),
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
