import {
  SOLD_SERIALS_STORE,
  UNLOCK_POOL_STORE,
  notifyUnlockPoolChanged,
  openOfflineDb,
  requestToPromise,
  txDone,
} from '@/lib/offline/idb'
import { parseDeviceSerials, serialLookupKey, soldSerialMessage, type SoldSerialHit } from '@/lib/utils/serial'

export type CachedUnlock = {
  serial_key: string
  id: string
  serial_number: string
  kind: 'partial' | 'full'
  day_token: string
  pin: string
  source: 'unlock' | 'activation'
  created_at: string
  reserved_by_draft_id?: string | null
}

export type CachedSoldSerial = SoldSerialHit & {
  serial_key: string
}

export type UnlockPoolSnapshot = {
  available: Array<{
    id: string
    serial_number: string
    kind: 'partial' | 'full'
    day_token: string
    pin: string
    source: 'unlock' | 'activation'
    created_at: string
  }>
  sold: SoldSerialHit[]
  synced_at: string
}

const SYNCED_AT_KEY = 'sorapps-unlock-pool-synced-at'

export function loadUnlockPoolSyncedAt() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SYNCED_AT_KEY)
  } catch {
    return null
  }
}

function saveUnlockPoolSyncedAt(value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SYNCED_AT_KEY, value)
  } catch {
    // ignore quota
  }
}

export async function listCachedUnlocks(): Promise<CachedUnlock[]> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(UNLOCK_POOL_STORE, 'readonly')
    const rows = await requestToPromise(tx.objectStore(UNLOCK_POOL_STORE).getAll() as IDBRequest<CachedUnlock[]>)
    await txDone(tx)
    return rows
  } finally {
    db.close()
  }
}

export async function listCachedSoldSerials(): Promise<CachedSoldSerial[]> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SOLD_SERIALS_STORE, 'readonly')
    const rows = await requestToPromise(
      tx.objectStore(SOLD_SERIALS_STORE).getAll() as IDBRequest<CachedSoldSerial[]>
    )
    await txDone(tx)
    return rows
  } finally {
    db.close()
  }
}

export async function findCachedUnlock(serial: string): Promise<CachedUnlock | null> {
  const key = serialLookupKey(serial)
  if (!key) return null
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(UNLOCK_POOL_STORE, 'readonly')
    const row = await requestToPromise(
      tx.objectStore(UNLOCK_POOL_STORE).get(key) as IDBRequest<CachedUnlock | undefined>
    )
    await txDone(tx)
    return row ?? null
  } finally {
    db.close()
  }
}

export async function findCachedSoldSerial(serial: string): Promise<CachedSoldSerial | null> {
  const key = serialLookupKey(serial)
  if (!key) return null
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(SOLD_SERIALS_STORE, 'readonly')
    const row = await requestToPromise(
      tx.objectStore(SOLD_SERIALS_STORE).get(key) as IDBRequest<CachedSoldSerial | undefined>
    )
    await txDone(tx)
    return row ?? null
  } finally {
    db.close()
  }
}

function reservedKeysFromDrafts(
  drafts: Array<{ localId: string; values: { items: Array<{ serial_number?: string }> } }>,
  excludeDraftId?: string
) {
  const reserved = new Map<string, string>()
  for (const draft of drafts) {
    if (excludeDraftId && draft.localId === excludeDraftId) continue
    for (const serial of parseDeviceSerials(draft.values.items.map((item) => item.serial_number || ''))) {
      const key = serialLookupKey(serial)
      if (key && !reserved.has(key)) reserved.set(key, draft.localId)
    }
  }
  return reserved
}

export async function replaceUnlockSnapshot(snapshot: UnlockPoolSnapshot) {
  const { listSaleDrafts } = await import('@/lib/offline/sale-drafts')
  const drafts = await listSaleDrafts()
  const reserved = reservedKeysFromDrafts(drafts)

  const db = await openOfflineDb()
  try {
    const tx = db.transaction([UNLOCK_POOL_STORE, SOLD_SERIALS_STORE], 'readwrite')
    tx.objectStore(UNLOCK_POOL_STORE).clear()
    tx.objectStore(SOLD_SERIALS_STORE).clear()

    for (const row of snapshot.available) {
      const serial_key = serialLookupKey(row.serial_number)
      if (!serial_key) continue
      const record: CachedUnlock = {
        ...row,
        serial_key,
        reserved_by_draft_id: reserved.get(serial_key) || null,
      }
      tx.objectStore(UNLOCK_POOL_STORE).put(record)
    }

    for (const hit of snapshot.sold) {
      const serial_key = serialLookupKey(hit.serial)
      if (!serial_key) continue
      tx.objectStore(SOLD_SERIALS_STORE).put({ ...hit, serial_key })
    }

    await txDone(tx)
  } finally {
    db.close()
  }

  saveUnlockPoolSyncedAt(snapshot.synced_at)
  notifyUnlockPoolChanged()
}

export async function reserveUnlocksForDraft(draftId: string, serials: string[]) {
  const keys = [...new Set(parseDeviceSerials(serials).map(serialLookupKey).filter(Boolean))]
  if (!keys.length) return
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(UNLOCK_POOL_STORE, 'readwrite')
    const store = tx.objectStore(UNLOCK_POOL_STORE)
    for (const key of keys) {
      const row = await requestToPromise(store.get(key) as IDBRequest<CachedUnlock | undefined>)
      if (!row) continue
      store.put({ ...row, reserved_by_draft_id: draftId })
    }
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyUnlockPoolChanged()
}

export async function releaseUnlocksForDraft(draftId: string) {
  const rows = await listCachedUnlocks()
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(UNLOCK_POOL_STORE, 'readwrite')
    const store = tx.objectStore(UNLOCK_POOL_STORE)
    for (const row of rows) {
      if (row.reserved_by_draft_id !== draftId) continue
      store.put({ ...row, reserved_by_draft_id: null })
    }
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyUnlockPoolChanged()
}

export async function consumeUnlocksLocally(serials: string[], saleHint?: Partial<SoldSerialHit>) {
  const parsed = parseDeviceSerials(serials)
  const db = await openOfflineDb()
  try {
    const tx = db.transaction([UNLOCK_POOL_STORE, SOLD_SERIALS_STORE], 'readwrite')
    const pool = tx.objectStore(UNLOCK_POOL_STORE)
    const sold = tx.objectStore(SOLD_SERIALS_STORE)
    for (const serial of parsed) {
      const key = serialLookupKey(serial)
      if (!key) continue
      const existing = await requestToPromise(pool.get(key) as IDBRequest<CachedUnlock | undefined>)
      if (existing) pool.delete(key)
      sold.put({
        serial_key: key,
        serial: existing?.serial_number || serial,
        sale_id: saleHint?.sale_id || '',
        customer_id: saleHint?.customer_id || '',
        customer_name: saleHint?.customer_name || 'this device',
      })
    }
    await txDone(tx)
  } finally {
    db.close()
  }
  notifyUnlockPoolChanged()
}

export type LocalSerialCheck = {
  error?: string
  unlock?: CachedUnlock
}

export async function checkSerialsAgainstLocalPool(
  serials: string[],
  excludeDraftId?: string
): Promise<LocalSerialCheck> {
  const parsed = parseDeviceSerials(serials)
  if (!parsed.length) return {}

  const { listSaleDrafts } = await import('@/lib/offline/sale-drafts')
  const [unlocks, sold, drafts] = await Promise.all([
    listCachedUnlocks(),
    listCachedSoldSerials(),
    listSaleDrafts(),
  ])
  const unlockByKey = new Map(unlocks.map((row) => [row.serial_key, row]))
  const soldByKey = new Map(sold.map((row) => [row.serial_key, row]))
  const reserved = reservedKeysFromDrafts(drafts, excludeDraftId)

  for (const serial of parsed) {
    const key = serialLookupKey(serial)
    if (!key) continue
    const soldHit = soldByKey.get(key)
    if (soldHit) return { error: soldSerialMessage(soldHit) }
    const reservedBy = reserved.get(key)
    if (reservedBy) {
      return { error: `Serial ${serial} is already on another unsynced sale on this device.` }
    }
  }

  const first = parsed[0]
  const unlock = first ? unlockByKey.get(serialLookupKey(first)) : undefined
  return { unlock }
}

export async function pinsForSaleSerials(serials: string[]) {
  const parsed = parseDeviceSerials(serials)
  const pins: Array<{ serial: string; pin: string }> = []
  for (const serial of parsed) {
    const unlock = await findCachedUnlock(serial)
    if (unlock?.pin) pins.push({ serial: unlock.serial_number, pin: unlock.pin })
  }
  return pins
}
