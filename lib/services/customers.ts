import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activationCodes, customers, sales, warranties } from '@/lib/db/schema'
import type { Customer, CustomerInput } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'
import { normalizeNigerianPhone } from '@/lib/sms/bulksms'
import {
  formatSoftReason,
  scoreSoftDuplicate,
} from '@/lib/utils/duplicate-match'

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeNin(value: string) {
  return digitsOnly(value)
}

function normalizeBvn(value: string) {
  return digitsOnly(value)
}

function isCompletePhone(value: string) {
  const d = digitsOnly(value)
  if (d.startsWith('234')) return d.length === 13
  return d.length === 11 && d.startsWith('0')
}

/** SMS / contact phone — beneficiary first, then guardian */
export function customerContactPhone(customer: Pick<Customer, 'phone' | 'guardian_phone'>): string {
  return customer.phone?.trim() || customer.guardian_phone?.trim() || ''
}

function assertContactRules(input: CustomerInput) {
  const isMinor = Boolean(input.is_minor)
  const phone = (input.phone || '').trim()
  const guardianPhone = (input.guardian_phone || '').trim()
  const guardianName = (input.guardian_name || '').trim()
  const guardianRel = (input.guardian_relationship || '').trim()

  if (isMinor) {
    if (!guardianName) throw new Error('Enter the parent/guardian name for a minor beneficiary')
    if (!isCompletePhone(guardianPhone)) {
      throw new Error('Enter a valid parent/guardian phone number')
    }
    if (!guardianRel) throw new Error('Select the parent/guardian relationship')
    if (phone && !isCompletePhone(phone)) {
      throw new Error('Beneficiary phone is incomplete — clear it or enter a full number')
    }
  } else {
    if (!isCompletePhone(phone)) {
      throw new Error('Enter a valid beneficiary phone number')
    }
  }

  const nokPhone = (input.next_of_kin_phone || '').trim()
  if (nokPhone && !isCompletePhone(nokPhone)) {
    throw new Error('Next-of-kin phone is incomplete')
  }
  if ((input.next_of_kin_name || '').trim() && !nokPhone && !guardianPhone && !phone) {
    throw new Error('Provide a next-of-kin phone or another contact number')
  }
}

function mapCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    nin: row.nin || '',
    bvn: row.bvn || '',
    address: row.address,
    city: row.city,
    state: row.state,
    lga: row.lga || '',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    gps_captured_at: row.gpsCapturedAt ?? null,
    gps_locked: row.gpsLocked,
    gps_out_of_area: row.gpsOutOfArea,
    photo_url: row.photoUrl || '',
    business_type: row.businessType,
    credit_limit: row.creditLimit,
    total_purchases: row.totalPurchases,
    outstanding_balance: row.outstandingBalance,
    created_at: row.createdAt,
    avatar: row.avatar ?? undefined,
    is_minor: row.isMinor,
    guardian_name: row.guardianName || '',
    guardian_phone: row.guardianPhone || '',
    guardian_relationship: row.guardianRelationship || '',
    next_of_kin_name: row.nextOfKinName || '',
    next_of_kin_phone: row.nextOfKinPhone || '',
    next_of_kin_relationship: row.nextOfKinRelationship || '',
  }
}

export async function listCustomers(): Promise<Customer[]> {
  const rows = await db.select().from(customers).orderBy(desc(customers.createdAt))
  return rows.map(mapCustomer)
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  return rows[0] ? mapCustomer(rows[0]) : null
}

export type DuplicateField =
  | 'phone'
  | 'nin'
  | 'bvn'
  | 'name'
  | 'serial'
  | 'beneficiary_id'
  | 'composite'

export type DuplicateSeverity = 'hard' | 'soft'

export type DuplicateMatch = {
  id: string
  name: string
  phone: string
  nin: string
  bvn: string
  city: string
  state: string
  lga?: string
  reasons?: string[]
  score?: number
  severity?: DuplicateSeverity
  matched_fields?: DuplicateField[]
}

export type DuplicateScanInput = {
  name?: string
  phone?: string
  nin?: string
  bvn?: string
  city?: string
  state?: string
  lga?: string
  address?: string
  /** Existing customer / beneficiary id if known */
  beneficiary_id?: string
  /** Device serial(s) to check — comma-separated or array */
  serial?: string | string[]
  exclude_id?: string
}

export type DuplicateScanResult = {
  hard: DuplicateMatch[]
  soft: DuplicateMatch[]
  /** Back-compat grouping for field-level hard hits */
  by_field: { field: DuplicateField; matches: DuplicateMatch[] }[]
}

function toMatch(c: Customer, extra?: Partial<DuplicateMatch>): DuplicateMatch {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone || c.guardian_phone,
    nin: c.nin,
    bvn: c.bvn,
    city: c.city,
    state: c.state,
    lga: c.lga,
    ...extra,
  }
}

function parseSerials(serial?: string | string[]): string[] {
  if (!serial) return []
  const raw = Array.isArray(serial) ? serial.join(',') : serial
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Full beneficiary duplicate scan:
 * - Hard: exact phone / NIN / BVN / serial / beneficiary id
 * - Soft: fuzzy name (+ geo/address reinforcement)
 */
export async function scanBeneficiaryDuplicates(
  input: DuplicateScanInput
): Promise<DuplicateScanResult> {
  const all = await listCustomers()
  const exclude = input.exclude_id
  const candidates = all.filter((c) => c.id !== exclude)

  const phone = input.phone?.trim()
    ? normalizeNigerianPhone(input.phone) || digitsOnly(input.phone)
    : ''
  const nin = input.nin?.trim() ? normalizeNin(input.nin) : ''
  const bvn = input.bvn?.trim() ? normalizeBvn(input.bvn) : ''
  const beneficiaryId = input.beneficiary_id?.trim() || ''
  const serials = parseSerials(input.serial).map((s) => s.toLowerCase())

  const hardById = new Map<string, DuplicateMatch>()
  const softById = new Map<string, DuplicateMatch>()
  const byField = new Map<DuplicateField, DuplicateMatch[]>()

  const pushHard = (field: DuplicateField, c: Customer, reason: string) => {
    const existing = hardById.get(c.id)
    if (existing) {
      existing.reasons = [...new Set([...(existing.reasons || []), reason])]
      existing.matched_fields = [
        ...new Set([...(existing.matched_fields || []), field]),
      ] as DuplicateField[]
      existing.score = Math.max(existing.score || 0, 100)
    } else {
      hardById.set(
        c.id,
        toMatch(c, {
          severity: 'hard',
          reasons: [reason],
          score: 100,
          matched_fields: [field],
        })
      )
    }
    const list = byField.get(field) || []
    if (!list.some((m) => m.id === c.id)) {
      list.push(toMatch(c, { severity: 'hard', reasons: [reason], score: 100 }))
      byField.set(field, list)
    }
  }

  if (beneficiaryId) {
    for (const c of candidates) {
      if (c.id === beneficiaryId) {
        pushHard('beneficiary_id', c, 'Exact beneficiary ID')
      }
    }
  }

  if (phone) {
    for (const c of candidates) {
      const phones = [c.phone, c.guardian_phone, c.next_of_kin_phone]
        .map((p) => normalizeNigerianPhone(p) || digitsOnly(p))
        .filter(Boolean)
      if (phones.includes(phone)) {
        pushHard('phone', c, 'Exact phone match')
      }
    }
  }

  if (nin) {
    for (const c of candidates) {
      if (c.nin && normalizeNin(c.nin) === nin) {
        pushHard('nin', c, 'Exact NIN match')
      }
    }
  }

  if (bvn) {
    for (const c of candidates) {
      if (c.bvn && normalizeBvn(c.bvn) === bvn) {
        pushHard('bvn', c, 'Exact BVN match')
      }
    }
  }

  if (serials.length) {
    const warrantyRows = await db
      .select({
        serialNumber: warranties.serialNumber,
        customerId: warranties.customerId,
      })
      .from(warranties)
    const customerById = new Map(candidates.map((c) => [c.id, c]))
    for (const w of warrantyRows) {
      const serial = (w.serialNumber || '').trim().toLowerCase()
      if (!serial || !serials.includes(serial)) continue
      const c = customerById.get(w.customerId)
      if (c) pushHard('serial', c, `Device serial already registered (${w.serialNumber})`)
    }
  }

  const name = input.name?.trim() || ''
  if (name.length >= 3) {
    for (const c of candidates) {
      if (hardById.has(c.id)) continue // already a hard hit
      const soft = scoreSoftDuplicate({
        name,
        city: input.city,
        state: input.state,
        lga: input.lga,
        address: input.address,
        candidate: {
          name: c.name,
          city: c.city,
          state: c.state,
          lga: c.lga,
          address: c.address,
        },
      })
      if (!soft) continue
      const reasons = soft.reasons.map(formatSoftReason)
      softById.set(
        c.id,
        toMatch(c, {
          severity: 'soft',
          reasons,
          score: soft.score,
          matched_fields: ['name', ...(soft.reasons.length > 1 ? (['composite'] as DuplicateField[]) : [])],
        })
      )
      const list = byField.get('name') || []
      if (!list.some((m) => m.id === c.id)) {
        list.push(
          toMatch(c, {
            severity: 'soft',
            reasons,
            score: soft.score,
            matched_fields: ['name'],
          })
        )
        byField.set('name', list)
      }
    }
  }

  const soft = [...softById.values()].sort((a, b) => (b.score || 0) - (a.score || 0))
  const hard = [...hardById.values()]

  return {
    hard,
    soft,
    by_field: [...byField.entries()].map(([field, matches]) => ({ field, matches })),
  }
}

/** Hard-only field hits (phone / NIN / BVN) — used by create/update guards. */
export async function findCustomerDuplicates(input: {
  phone?: string
  nin?: string
  bvn?: string
  exclude_id?: string
}): Promise<{ field: DuplicateField; matches: DuplicateMatch[] }[]> {
  const scan = await scanBeneficiaryDuplicates(input)
  return scan.by_field.filter((d) =>
    (['phone', 'nin', 'bvn'] as DuplicateField[]).includes(d.field)
  )
}

async function assertNoDuplicates(input: CustomerInput, excludeId?: string) {
  const phones = [input.phone, input.guardian_phone, input.next_of_kin_phone].filter(
    (p) => p?.trim()
  )
  const seen = new Set<string>()
  for (const p of phones) {
    const duplicates = await findCustomerDuplicates({
      phone: p,
      nin: seen.size === 0 ? input.nin : undefined,
      bvn: seen.size === 0 ? input.bvn : undefined,
      exclude_id: excludeId,
    })
    seen.add(p!)
    if (duplicates.length) {
      const parts = duplicates.map((d) => {
        const names = d.matches.map((m) => `${m.name} (${m.id})`).join(', ')
        return `${d.field.toUpperCase()} already used by ${names}`
      })
      throw new Error(`Duplicate customer detected: ${parts.join('; ')}`)
    }
  }

  if (!phones.length) {
    const duplicates = await findCustomerDuplicates({
      nin: input.nin,
      bvn: input.bvn,
      exclude_id: excludeId,
    })
    if (duplicates.length) {
      const parts = duplicates.map((d) => {
        const names = d.matches.map((m) => `${m.name} (${m.id})`).join(', ')
        return `${d.field.toUpperCase()} already used by ${names}`
      })
      throw new Error(`Duplicate customer detected: ${parts.join('; ')}`)
    }
  }
}

function customerValues(input: CustomerInput) {
  return {
    name: input.name.trim(),
    email: (input.email || '').trim(),
    phone: (input.phone || '').trim(),
    nin: normalizeNin(input.nin || ''),
    bvn: normalizeBvn(input.bvn || ''),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state,
    lga: (input.lga || '').trim(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    gpsCapturedAt: input.gps_captured_at ? new Date(input.gps_captured_at) : null,
    gpsLocked: Boolean(input.gps_locked),
    gpsOutOfArea: Boolean(input.gps_out_of_area),
    photoUrl: (input.photo_url || '').trim(),
    businessType: input.business_type,
    creditLimit: Math.max(0, Math.round(input.credit_limit)),
    isMinor: Boolean(input.is_minor),
    guardianName: (input.guardian_name || '').trim(),
    guardianPhone: (input.guardian_phone || '').trim(),
    guardianRelationship: (input.guardian_relationship || '').trim(),
    nextOfKinName: (input.next_of_kin_name || '').trim(),
    nextOfKinPhone: (input.next_of_kin_phone || '').trim(),
    nextOfKinRelationship: (input.next_of_kin_relationship || '').trim(),
  }
}

type DbExecutor = Pick<typeof db, 'select' | 'insert'>

export async function createCustomer(
  input: CustomerInput,
  executor: DbExecutor = db
): Promise<Customer> {
  assertContactRules(input)
  await assertNoDuplicates(input)

  const existing = await executor.select({ id: customers.id }).from(customers)
  const id = nextId(
    'CUST',
    existing.map((r) => r.id),
    4
  )

  const [row] = await executor
    .insert(customers)
    .values({
      id,
      ...customerValues(input),
      totalPurchases: 0,
      outstandingBalance: 0,
    })
    .returning()

  return mapCustomer(row)
}

export async function updateCustomer(
  id: string,
  input: CustomerInput
): Promise<Customer | null> {
  assertContactRules(input)
  await assertNoDuplicates(input, id)

  const [row] = await db
    .update(customers)
    .set(customerValues(input))
    .where(eq(customers.id, id))
    .returning()

  return row ? mapCustomer(row) : null
}

export async function deleteCustomer(id: string): Promise<{ deleted: boolean }> {
  const existing = await getCustomer(id)
  if (!existing) {
    throw new Error('Customer not found')
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .where(eq(sales.customerId, id))

  if (count > 0) {
    throw new Error(
      `Cannot delete ${existing.name} — they have ${count} sale${count === 1 ? '' : 's'}. Delete those sales first, then try again.`
    )
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(activationCodes).where(eq(activationCodes.customerId, id))
      await tx.delete(warranties).where(eq(warranties.customerId, id))
      await tx.delete(customers).where(eq(customers.id, id))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/foreign key|violates foreign key|Failed query: delete from "customers"/i.test(message)) {
      throw new Error(
        `Cannot delete ${existing.name} — related records still exist (sales, invoices, activations, or warranties). Delete related sales first.`
      )
    }
    throw error instanceof Error ? error : new Error('Failed to delete customer')
  }

  return { deleted: true }
}
