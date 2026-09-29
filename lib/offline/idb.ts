export const OFFLINE_DB_NAME = 'sorapps-offline'
export const OFFLINE_DB_VERSION = 5
export const CUSTOMER_DRAFTS_STORE = 'customer-drafts'
export const SALE_DRAFTS_STORE = 'sale-drafts'
export const UNLOCK_POOL_STORE = 'unlock-pool'
export const SOLD_SERIALS_STORE = 'sold-serials'
export const UNIT_PHOTOS_STORE = 'unit-photos'
export const DRAFTS_CHANGED_EVENT = 'sorapps-offline-drafts-changed'
export const UNLOCK_POOL_CHANGED_EVENT = 'sorapps-unlock-pool-changed'

export function createLocalId(prefix = 'draft') {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}_${rand}`
}

export function requestToPromise<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export function openOfflineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'))
      return
    }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CUSTOMER_DRAFTS_STORE)) {
        db.createObjectStore(CUSTOMER_DRAFTS_STORE, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(SALE_DRAFTS_STORE)) {
        db.createObjectStore(SALE_DRAFTS_STORE, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(UNLOCK_POOL_STORE)) {
        db.createObjectStore(UNLOCK_POOL_STORE, { keyPath: 'serial_key' })
      }
      if (!db.objectStoreNames.contains(SOLD_SERIALS_STORE)) {
        db.createObjectStore(SOLD_SERIALS_STORE, { keyPath: 'serial_key' })
      }
      if (!db.objectStoreNames.contains(UNIT_PHOTOS_STORE)) {
        db.createObjectStore(UNIT_PHOTOS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open offline database'))
  })
}

export function notifyDraftsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT))
}

export function subscribeToDraftsChanged(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(DRAFTS_CHANGED_EVENT, onChange)
  return () => window.removeEventListener(DRAFTS_CHANGED_EVENT, onChange)
}

export function notifyUnlockPoolChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(UNLOCK_POOL_CHANGED_EVENT))
}

export function subscribeToUnlockPoolChanged(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(UNLOCK_POOL_CHANGED_EVENT, onChange)
  return () => window.removeEventListener(UNLOCK_POOL_CHANGED_EVENT, onChange)
}
