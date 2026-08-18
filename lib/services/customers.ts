import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activationCodes, customers, sales, warranties } from '@/lib/db/schema'
import type { Customer, CustomerInput } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'
import { normalizeNigerianPhone } from '@/lib/sms/bulksms'

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeNin(value: string) {
  return digitsOnly(value)
}

function normalizeBvn(value: string) {
  return digitsOnly(value)
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

export type DuplicateField = 'phone' | 'nin' | 'bvn'

export type DuplicateMatch = {
  id: string
  name: string
  phone: string
  nin: string
  bvn: string
  city: string
  state: string
}

export async function findCustomerDuplicates(input: {
  phone?: string
  nin?: string
  bvn?: string
  exclude_id?: string
}): Promise<{ field: DuplicateField; matches: DuplicateMatch[] }[]> {
  const results: { field: DuplicateField; matches: DuplicateMatch[] }[] = []
  const all = await listCustomers()
  const exclude = input.exclude_id

  const phone = input.phone?.trim()
    ? normalizeNigerianPhone(input.phone) || digitsOnly(input.phone)
    : ''
  const nin = input.nin?.trim() ? normalizeNin(input.nin) : ''
  const bvn = input.bvn?.trim() ? normalizeBvn(input.bvn) : ''

  if (phone) {
    const matches = all
      .filter((c) => c.id !== exclude)
      .filter((c) => {
        const existing = normalizeNigerianPhone(c.phone) || digitsOnly(c.phone)
        return existing === phone
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        nin: c.nin,
        bvn: c.bvn,
        city: c.city,
        state: c.state,
      }))
    if (matches.length) results.push({ field: 'phone', matches })
  }

  if (nin) {
    const matches = all
      .filter((c) => c.id !== exclude && c.nin && normalizeNin(c.nin) === nin)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        nin: c.nin,
        bvn: c.bvn,
        city: c.city,
        state: c.state,
      }))
    if (matches.length) results.push({ field: 'nin', matches })
  }

  if (bvn) {
    const matches = all
      .filter((c) => c.id !== exclude && c.bvn && normalizeBvn(c.bvn) === bvn)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        nin: c.nin,
        bvn: c.bvn,
        city: c.city,
        state: c.state,
      }))
    if (matches.length) results.push({ field: 'bvn', matches })
  }

  return results
}

async function assertNoDuplicates(input: CustomerInput, excludeId?: string) {
  const duplicates = await findCustomerDuplicates({
    phone: input.phone,
    nin: input.nin,
    bvn: input.bvn,
    exclude_id: excludeId,
  })
  if (!duplicates.length) return

  const parts = duplicates.map((d) => {
    const names = d.matches.map((m) => `${m.name} (${m.id})`).join(', ')
    return `${d.field.toUpperCase()} already used by ${names}`
  })
  throw new Error(`Duplicate customer detected: ${parts.join('; ')}`)
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  await assertNoDuplicates(input)

  const existing = await db.select({ id: customers.id }).from(customers)
  const id = nextId(
    'CUST',
    existing.map((r) => r.id),
    4
  )

  const [row] = await db
    .insert(customers)
    .values({
      id,
      name: input.name.trim(),
      email: (input.email || '').trim(),
      phone: input.phone.trim(),
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
  await assertNoDuplicates(input, id)

  const [row] = await db
    .update(customers)
    .set({
      name: input.name.trim(),
      email: (input.email || '').trim(),
      phone: input.phone.trim(),
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
    })
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
      // Activation codes keep customer_id after sale delete (sale_id becomes null)
      await tx.delete(activationCodes).where(eq(activationCodes.customerId, id))
      // Safety: remove any orphan warranties still tied to the customer
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
