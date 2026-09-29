import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, deviceUnlocks, warranties } from '@/lib/db/schema'
import {
  parseDeviceSerials,
  serialLookupKey,
  soldSerialMessage,
  type SoldSerialHit,
} from '@/lib/utils/serial'

export type { SoldSerialHit }

async function loadSoldSerialHits(wanted?: Set<string>): Promise<SoldSerialHit[]> {
  const [warrantyRows, unlockRows] = await Promise.all([
    db
      .select({
        serial: warranties.serialNumber,
        saleId: warranties.saleId,
        customerId: warranties.customerId,
        customerName: customers.name,
      })
      .from(warranties)
      .leftJoin(customers, eq(warranties.customerId, customers.id)),
    db
      .select({
        serial: deviceUnlocks.serialNumber,
        saleId: deviceUnlocks.saleId,
      })
      .from(deviceUnlocks),
  ])

  const hits: SoldSerialHit[] = []
  const seen = new Set<string>()

  function push(hit: SoldSerialHit) {
    const key = serialLookupKey(hit.serial)
    if (!key || seen.has(key)) return
    if (wanted && !wanted.has(key)) return
    seen.add(key)
    hits.push(hit)
  }

  for (const row of warrantyRows) {
    if (!row.serial?.trim()) continue
    push({
      serial: row.serial.trim(),
      sale_id: row.saleId,
      customer_id: row.customerId || '',
      customer_name: row.customerName || 'a previous sale',
    })
  }

  for (const row of unlockRows) {
    if (!row.saleId || !row.serial?.trim()) continue
    push({
      serial: row.serial.trim(),
      sale_id: row.saleId,
      customer_id: '',
      customer_name: 'a previous sale',
    })
  }

  return hits
}

export async function findSoldSerials(serials: string[]): Promise<SoldSerialHit[]> {
  const wanted = new Set(parseDeviceSerials(serials).map(serialLookupKey).filter(Boolean))
  if (!wanted.size) return []
  return loadSoldSerialHits(wanted)
}

export async function listAllSoldSerials(): Promise<SoldSerialHit[]> {
  return loadSoldSerialHits()
}

export async function assertSerialsNotSold(serials: string[]) {
  const parsed = parseDeviceSerials(serials)
  const seen = new Set<string>()
  for (const serial of parsed) {
    const key = serialLookupKey(serial)
    if (!key) throw new Error('Enter a device serial number for every unit')
    if (seen.has(key)) {
      throw new Error(`Serial number is repeated on this sale: ${serial}`)
    }
    seen.add(key)
  }

  const hits = await findSoldSerials(parsed)
  if (hits[0]) throw new Error(soldSerialMessage(hits[0]))
}
