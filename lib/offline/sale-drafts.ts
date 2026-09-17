import type {
  DocumentDocType,
  PaymentType,
  SaleSiteGpsInput,
} from '@/lib/types/crm'
import {
  SALE_DRAFTS_STORE,
  createLocalId,
  notifyDraftsChanged,
  openOfflineDb,
  requestToPromise,
  txDone,
} from '@/lib/offline/idb'

export type DraftStatus = 'pending' | 'syncing' | 'failed'

export type PendingDocument = {
  file_name: string
  content_type: string
  doc_type: DocumentDocType
  page_number?: number
  file_url?: string
  storage_key?: string
  file?: File
}

export type SaleDraftFormValues = {
  customer_mode: 'existing' | 'new'
  customer_id: string
  new_customer: {
    name: string
    email: string
    phone: string
    alternate_phone: string
    nin: string
    bvn: string
    address: string
    address_house_number: string
    address_building_features: string
    address_street: string
    address_landmark: string
    city: string
    state: string
    lga: string
    business_type: string
    gender: string
    customer_category: string
    customer_type: string
    is_minor: boolean
    guardian_name: string
    guardian_phone: string
    guardian_relationship: string
    next_of_kin_name: string
    next_of_kin_phone: string
    next_of_kin_relationship: string
  }
  payment_type: PaymentType
  payment_method: 'bank_transfer' | 'cash' | 'cheque' | 'card'
  installment_interval_days: number
  plan_end_date: string
  discount_percent: number
  transport_cost: number
  notes: string
  dares_type_of_payment: string
  dares_payment_plan: string
  retail_cost_ngn: number
  cost_to_end_user_ngn: number
  downpayment_amount_ngn: number
  items: { product_id: string; quantity: number; serial_number: string }[]
}

export type SaleDraft = {
  localId: string
  label: string
  values: SaleDraftFormValues
  siteGps: SaleSiteGpsInput
  sitePhoto: File
  documents: PendingDocument[]
  status: DraftStatus
  syncError?: string | null
  createdAt: string
  updatedAt: string
}

export async function listSaleDrafts(): Promise<SaleDraft[]> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SALE_DRAFTS_STORE, 'readonly')
    const store = tx.objectStore(SALE_DRAFTS_STORE)
    const rows = await requestToPromise(store.getAll() as IDBRequest<SaleDraft[]>)
    await txDone(tx)
    return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    db.close()
  }
}

export async function getSaleDraft(localId: string): Promise<SaleDraft | null> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SALE_DRAFTS_STORE, 'readonly')
    const store = tx.objectStore(SALE_DRAFTS_STORE)
    const row = await requestToPromise(store.get(localId) as IDBRequest<SaleDraft | undefined>)
    await txDone(tx)
    return row ?? null
  } finally {
    db.close()
  }
}

export async function upsertSaleDraft(input: {
  localId?: string
  label: string
  values: SaleDraftFormValues
  siteGps: SaleSiteGpsInput
  sitePhoto: File
  documents: PendingDocument[]
  status?: DraftStatus
  syncError?: string | null
}): Promise<SaleDraft> {
  const now = new Date().toISOString()
  const existing = input.localId ? await getSaleDraft(input.localId) : null
  const draft: SaleDraft = {
    localId: existing?.localId ?? input.localId ?? createLocalId('sale'),
    label: input.label,
    values: input.values,
    siteGps: input.siteGps,
    sitePhoto: input.sitePhoto,
    documents: input.documents,
    status: input.status ?? 'pending',
    syncError: input.syncError ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SALE_DRAFTS_STORE, 'readwrite')
    tx.objectStore(SALE_DRAFTS_STORE).put(draft)
    await txDone(tx)
  } finally {
    db.close()
  }

  notifyDraftsChanged()
  return draft
}

export async function updateSaleDraft(
  localId: string,
  patch: Partial<Pick<SaleDraft, 'status' | 'syncError' | 'updatedAt'>>
): Promise<SaleDraft | null> {
  const existing = await getSaleDraft(localId)
  if (!existing) return null
  const next: SaleDraft = {
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  }
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SALE_DRAFTS_STORE, 'readwrite')
    tx.objectStore(SALE_DRAFTS_STORE).put(next)
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyDraftsChanged()
  return next
}

export async function deleteSaleDraft(localId: string) {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SALE_DRAFTS_STORE, 'readwrite')
    tx.objectStore(SALE_DRAFTS_STORE).delete(localId)
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyDraftsChanged()
}
