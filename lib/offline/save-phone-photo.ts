import {
  UNIT_PHOTOS_STORE,
  createLocalId,
  openOfflineDb,
  requestToPromise,
  txDone,
} from '@/lib/offline/idb'
import { downloadBlob } from '@/lib/utils/export'

const MAX_STORED_PHOTOS = 100

export type SavedUnitPhoto = {
  id: string
  file_name: string
  content_type: string
  blob: Blob
  captured_at: string
}

function photoFileName(file: File) {
  const ext =
    file.name.split('.').pop()?.toLowerCase() ||
    (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `unit-photo-${stamp}.${ext}`
}

function isAndroid() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

function isAndroidWebView() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent) && /; wv\)/.test(navigator.userAgent)
}

function todayFolder() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function putPhotoInIndexedDb(file: File, fileName: string) {
  const db = await openOfflineDb()
  try {
    const write = db.transaction(UNIT_PHOTOS_STORE, 'readwrite')
    const store = write.objectStore(UNIT_PHOTOS_STORE)
    const row: SavedUnitPhoto = {
      id: createLocalId('photo'),
      file_name: fileName,
      content_type: file.type || 'image/jpeg',
      blob: file,
      captured_at: new Date().toISOString(),
    }
    store.put(row)
    await txDone(write)

    const read = db.transaction(UNIT_PHOTOS_STORE, 'readonly')
    const all = await requestToPromise(
      read.objectStore(UNIT_PHOTOS_STORE).getAll() as IDBRequest<SavedUnitPhoto[]>
    )
    await txDone(read)
    if (all.length <= MAX_STORED_PHOTOS) return

    const extra = [...all]
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
      .slice(0, all.length - MAX_STORED_PHOTOS)
    const prune = db.transaction(UNIT_PHOTOS_STORE, 'readwrite')
    const pruneStore = prune.objectStore(UNIT_PHOTOS_STORE)
    for (const item of extra) pruneStore.delete(item.id)
    await txDone(prune)
  } finally {
    db.close()
  }
}

/** Keep a copy on this phone: IndexedDB, plus Downloads on Android browsers. */
export async function savePhotoOnThisPhone(file: File) {
  const fileName = photoFileName(file)
  try {
    await putPhotoInIndexedDb(file, fileName)
  } catch {
    // still try a download even if storage is full
  }

  // Native Android already writes to Pictures/Sorapps/<date>/. Don't duplicate into Downloads.
  if (!isAndroid() || isAndroidWebView()) return fileName
  try {
    downloadBlob(`${todayFolder()}-${fileName}`, file)
  } catch {
    // ignore — IndexedDB copy is enough
  }
  return fileName
}
