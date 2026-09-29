import { desc, eq, ilike, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activationCodes, deviceUnlocks, sales, warranties } from '@/lib/db/schema'
import { fetchBeebeeActivation, toBeebeeDayToken } from '@/lib/services/beebeejump'
import { saveSaleUnlockPin } from '@/lib/services/sales'
import { listAllSoldSerials } from '@/lib/services/serials'
import { nextId } from '@/lib/utils/ids'
import { serialLookupKey, sameSerialKey } from '@/lib/utils/serial'

export type DeviceUnlockKind = 'partial' | 'full'
export type DeviceUnlockSource = 'unlock' | 'activation'

export type DeviceUnlockRecord = {
  id: string
  serial_number: string
  kind: DeviceUnlockKind
  day_token: string
  pin: string
  sale_id?: string
  warranty_id?: string
  created_by_user_id: string
  created_at: Date
  source: DeviceUnlockSource
}

function mapRow(row: typeof deviceUnlocks.$inferSelect): DeviceUnlockRecord {
  return {
    id: row.id,
    serial_number: row.serialNumber,
    kind: row.kind === 'full' ? 'full' : 'partial',
    day_token: row.dayToken,
    pin: row.pin,
    sale_id: row.saleId ?? undefined,
    warranty_id: row.warrantyId ?? undefined,
    created_by_user_id: row.createdByUserId,
    created_at: row.createdAt,
    source: 'unlock',
  }
}

function mapActivation(row: typeof activationCodes.$inferSelect): DeviceUnlockRecord | null {
  const pin = row.code?.trim()
  const serial = row.deviceSerial?.trim()
  if (!pin || !serial) return null

  const forever = row.validityDays >= 3650
  return {
    id: row.id,
    serial_number: serial,
    kind: forever ? 'full' : 'partial',
    day_token: toBeebeeDayToken(row.validityDays, forever),
    pin,
    sale_id: row.saleId ?? undefined,
    warranty_id: row.warrantyId ?? undefined,
    created_by_user_id: row.createdByUserId || '',
    created_at: row.createdAt,
    source: 'activation',
  }
}

export async function listUnlocksForUser(_userId: string, limit = 500): Promise<DeviceUnlockRecord[]> {
  return listTeamUnlocks(limit)
}

export async function listTeamUnlocks(limit = 500): Promise<DeviceUnlockRecord[]> {
  const [unlockRows, activationRows] = await Promise.all([
    db.select().from(deviceUnlocks).orderBy(desc(deviceUnlocks.createdAt)).limit(limit),
    db
      .select({ activation: activationCodes })
      .from(activationCodes)
      .orderBy(desc(activationCodes.createdAt))
      .limit(limit),
  ])

  const seen = new Set<string>()
  const merged: DeviceUnlockRecord[] = []

  for (const row of [...unlockRows.map(mapRow), ...activationRows.map((item) => mapActivation(item.activation))]) {
    if (!row) continue
    const key = `${row.serial_number.trim().toLowerCase()}|${row.pin}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(row)
  }

  return merged
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit)
}

export async function listAvailableUnlockPool(): Promise<DeviceUnlockRecord[]> {
  const [rows, sold] = await Promise.all([
    db
      .select()
      .from(deviceUnlocks)
      .where(isNull(deviceUnlocks.saleId))
      .orderBy(desc(deviceUnlocks.createdAt)),
    listAllSoldSerials(),
  ])
  const soldKeys = new Set(sold.map((hit) => serialLookupKey(hit.serial)).filter(Boolean))
  const seen = new Set<string>()
  const pool: DeviceUnlockRecord[] = []

  for (const row of rows) {
    const key = serialLookupKey(row.serialNumber)
    if (!key || seen.has(key) || soldKeys.has(key)) continue
    seen.add(key)
    pool.push(mapRow(row))
  }

  return pool
}

export async function findStoredUnlockForSerial(
  serial: string,
  preferred?: { kind: DeviceUnlockKind; day_token: string }
): Promise<DeviceUnlockRecord | null> {
  const needle = serial.trim()
  if (!needle) return null

  const [unlockRows, activationRows, salePinRows] = await Promise.all([
    db.select().from(deviceUnlocks).orderBy(desc(deviceUnlocks.createdAt)),
    db
      .select()
      .from(activationCodes)
      .where(ilike(activationCodes.deviceSerial, needle))
      .orderBy(desc(activationCodes.createdAt)),
    db
      .select({
        pin: sales.unlockPin,
        saleId: sales.id,
        serialNumber: warranties.serialNumber,
        createdAt: sales.createdAt,
        paymentType: sales.paymentType,
      })
      .from(warranties)
      .innerJoin(sales, eq(warranties.saleId, sales.id))
      .where(ilike(warranties.serialNumber, needle))
      .orderBy(desc(sales.createdAt))
      .limit(20),
  ])

  const candidates: DeviceUnlockRecord[] = []
  const seenPins = new Set<string>()

  function push(row: DeviceUnlockRecord) {
    const key = `${row.serial_number.trim().toLowerCase()}|${row.pin}`
    if (!row.pin || seenPins.has(key) || !sameSerialKey(row.serial_number, needle)) return
    seenPins.add(key)
    candidates.push(row)
  }

  unlockRows.forEach((row) => push(mapRow(row)))
  activationRows.forEach((row) => {
    const mapped = mapActivation(row)
    if (mapped) push(mapped)
  })
  salePinRows.forEach((row) => {
    const pin = row.pin?.trim()
    if (!pin) return
    push({
      id: row.saleId,
      serial_number: row.serialNumber.trim(),
      kind: row.paymentType === 'full' ? 'full' : 'partial',
      day_token: row.paymentType === 'full' ? 'ForeverCode' : '30Days',
      pin,
      sale_id: row.saleId,
      created_by_user_id: '',
      created_at: row.createdAt,
      source: 'activation',
    })
  })

  if (!candidates.length) return null
  candidates.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())

  if (preferred) {
    const exact = candidates.find(
      (row) =>
        row.kind === preferred.kind &&
        (preferred.kind === 'full' || row.day_token === preferred.day_token)
    )
    if (exact) return exact
    const kindMatch = candidates.find((row) => row.kind === preferred.kind)
    if (kindMatch) return kindMatch
  }

  return candidates[0]
}

export async function attachUnlockPinToSale(saleId: string, serial: string, pin: string) {
  const value = pin.trim()
  if (!saleId || !value) return
  await saveSaleUnlockPin(saleId, value)

  const rows = await db.select().from(deviceUnlocks)
  const match = rows.find((row) => sameSerialKey(row.serialNumber, serial) && row.pin.trim() === value)
  if (match && !match.saleId) {
    await db.update(deviceUnlocks).set({ saleId }).where(eq(deviceUnlocks.id, match.id))
  }
}

export async function resolveUnlockPin(input: {
  serial_number: string
  kind: DeviceUnlockKind
  validity_days?: number
  created_by_user_id: string
}): Promise<DeviceUnlockRecord & { reused: boolean }> {
  const serial = input.serial_number.trim()
  if (!serial) throw new Error('Enter a device serial number')

  const forever = input.kind === 'full'
  const dayToken = toBeebeeDayToken(input.validity_days || 30, forever)
  const stored = await findStoredUnlockForSerial(serial, { kind: input.kind, day_token: dayToken })
  if (stored) return { ...stored, reused: true }

  const created = await unlockDevice(input)
  return { ...created, reused: false }
}

export async function unlockDevice(input: {
  serial_number: string
  kind: DeviceUnlockKind
  validity_days?: number
  created_by_user_id: string
}): Promise<DeviceUnlockRecord> {
  const serial = input.serial_number.trim()
  if (!serial) throw new Error('Enter a device serial number')

  const forever = input.kind === 'full'
  const day = toBeebeeDayToken(input.validity_days || 30, forever)
  const beebee = await fetchBeebeeActivation({ sn: serial, day })

  const warrantyRows = await db.select().from(warranties)
  const warranty = warrantyRows.find((row) => sameSerialKey(row.serialNumber, serial))
  if (warranty?.saleId) {
    await saveSaleUnlockPin(warranty.saleId, beebee.pin)
  }

  const existing = await db.select({ id: deviceUnlocks.id }).from(deviceUnlocks)
  const id = nextId(
    'ULK',
    existing.map((row) => row.id),
    5
  )

  const [created] = await db
    .insert(deviceUnlocks)
    .values({
      id,
      serialNumber: beebee.sn || serial,
      kind: forever ? 'full' : 'partial',
      dayToken: beebee.days || day,
      pin: beebee.pin,
      saleId: warranty?.saleId || null,
      warrantyId: warranty?.id || null,
      createdByUserId: input.created_by_user_id,
    })
    .returning()

  return mapRow(created)
}
