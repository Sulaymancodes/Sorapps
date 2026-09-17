import type { CustomerInput, DocumentUploadInput } from '@/lib/types/crm'
import {
  CUSTOMER_DRAFTS_STORE,
  createLocalId,
  notifyDraftsChanged,
  openOfflineDb,
  requestToPromise,
  subscribeToDraftsChanged,
  txDone,
} from '@/lib/offline/idb'

export { notifyDraftsChanged, subscribeToDraftsChanged }

export type CustomerDraftStatus = 'pending' | 'syncing' | 'failed'

export type CustomerDraftPayload = CustomerInput & {
  documents?: DocumentUploadInput[]
}

export type CustomerDraft = {
  localId: string
  mode: 'create' | 'edit'
  remoteId?: string
  payload: CustomerDraftPayload
  status: CustomerDraftStatus
  syncError?: string | null
  createdAt: string
  updatedAt: string
}

export async function listCustomerDrafts(): Promise<CustomerDraft[]> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CUSTOMER_DRAFTS_STORE, 'readonly')
    const store = tx.objectStore(CUSTOMER_DRAFTS_STORE)
    const rows = await requestToPromise(store.getAll() as IDBRequest<CustomerDraft[]>)
    await txDone(tx)
    return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    db.close()
  }
}

export async function getCustomerDraft(localId: string): Promise<CustomerDraft | null> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CUSTOMER_DRAFTS_STORE, 'readonly')
    const store = tx.objectStore(CUSTOMER_DRAFTS_STORE)
    const row = await requestToPromise(store.get(localId) as IDBRequest<CustomerDraft | undefined>)
    await txDone(tx)
    return row ?? null
  } finally {
    db.close()
  }
}

export async function upsertCustomerDraft(input: {
  localId?: string
  mode: 'create' | 'edit'
  remoteId?: string
  payload: CustomerDraftPayload
  status?: CustomerDraftStatus
  syncError?: string | null
}): Promise<CustomerDraft> {
  const now = new Date().toISOString()
  const existing = input.localId ? await getCustomerDraft(input.localId) : null
  const draft: CustomerDraft = {
    localId: existing?.localId ?? input.localId ?? createLocalId('customer'),
    mode: input.mode,
    remoteId: input.remoteId ?? existing?.remoteId,
    payload: input.payload,
    status: input.status ?? 'pending',
    syncError: input.syncError ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CUSTOMER_DRAFTS_STORE, 'readwrite')
    tx.objectStore(CUSTOMER_DRAFTS_STORE).put(draft)
    await txDone(tx)
  } finally {
    db.close()
  }

  notifyDraftsChanged()
  return draft
}

export async function updateCustomerDraft(
  localId: string,
  patch: Partial<Pick<CustomerDraft, 'status' | 'syncError' | 'payload' | 'updatedAt'>>
): Promise<CustomerDraft | null> {
  const existing = await getCustomerDraft(localId)
  if (!existing) return null
  const next: CustomerDraft = {
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  }
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CUSTOMER_DRAFTS_STORE, 'readwrite')
    tx.objectStore(CUSTOMER_DRAFTS_STORE).put(next)
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyDraftsChanged()
  return next
}

export async function deleteCustomerDraft(localId: string) {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CUSTOMER_DRAFTS_STORE, 'readwrite')
    tx.objectStore(CUSTOMER_DRAFTS_STORE).delete(localId)
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyDraftsChanged()
}

export function pendingDraftCount(drafts: CustomerDraft[]) {
  return drafts.filter((draft) => draft.status !== 'syncing').length
}
