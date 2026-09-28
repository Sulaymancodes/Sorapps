import { desc, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activationCodes, deviceUnlocks, sales, warranties } from '@/lib/db/schema'
import { fetchBeebeeActivation, toBeebeeDayToken } from '@/lib/services/beebeejump'
import { saveSaleUnlockPin } from '@/lib/services/sales'
import { nextId } from '@/lib/utils/ids'

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

export async function listUnlocksForUser(userId: string, limit = 500): Promise<DeviceUnlockRecord[]> {
  const [unlockRows, activationRows] = await Promise.all([
    db
      .select()
      .from(deviceUnlocks)
      .where(eq(deviceUnlocks.createdByUserId, userId))
      .orderBy(desc(deviceUnlocks.createdAt))
      .limit(limit),
    db
      .select({ activation: activationCodes })
      .from(activationCodes)
      .leftJoin(sales, eq(activationCodes.saleId, sales.id))
      .where(or(eq(activationCodes.createdByUserId, userId), eq(sales.createdByUserId, userId)))
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
  const warranty = warrantyRows.find(
    (row) => row.serialNumber.trim().toLowerCase() === serial.toLowerCase()
  )
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
