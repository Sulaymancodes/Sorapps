const STORAGE_KEY = 'sorapps-reminder-reads-v1'

export type ReminderReadMap = Record<string, string> // id -> ISO timestamp

export function loadReminderReads(): ReminderReadMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ReminderReadMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveReminderReads(map: ReminderReadMap) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function markRemindersRead(ids: string[], existing?: ReminderReadMap): ReminderReadMap {
  const next = { ...(existing ?? loadReminderReads()) }
  const now = new Date().toISOString()
  for (const id of ids) {
    if (id) next[id] = now
  }
  saveReminderReads(next)
  return next
}

export function isReminderRead(id: string, reads: ReminderReadMap) {
  return Boolean(reads[id])
}
