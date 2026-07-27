import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  customers,
  products,
  warranties,
  warrantyClaims,
} from '@/lib/db/schema'
import type {
  CreateWarrantyClaimInput,
  RegisterWarrantyInput,
  UpdateWarrantyClaimInput,
  Warranty,
  WarrantyClaim,
  WarrantyDisplayStatus,
} from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

export type WarrantyWithDetails = Warranty & {
  customer_name: string
  product_name: string
  display_status: WarrantyDisplayStatus
  days_until_expiry: number
  claims: WarrantyClaim[]
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function mapWarranty(row: typeof warranties.$inferSelect): Warranty {
  return {
    id: row.id,
    sale_id: row.saleId,
    product_id: row.productId,
    customer_id: row.customerId,
    serial_number: row.serialNumber,
    warranty_period_months: row.warrantyPeriodMonths,
    start_date: row.startDate,
    expiry_date: row.expiryDate,
    status: row.status as Warranty['status'],
  }
}

function mapClaim(row: typeof warrantyClaims.$inferSelect): WarrantyClaim {
  return {
    id: row.id,
    warranty_id: row.warrantyId,
    claim_date: row.claimDate,
    issue_description: row.issueDescription,
    status: row.status as WarrantyClaim['status'],
    resolution: row.resolution,
  }
}

export function getWarrantyDisplayStatus(
  warranty: Pick<Warranty, 'serial_number' | 'status' | 'expiry_date'>,
  now = new Date()
): { display_status: WarrantyDisplayStatus; days_until_expiry: number } {
  const daysUntilExpiry = Math.floor(
    (warranty.expiry_date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  )

  if (warranty.status === 'claimed') {
    return { display_status: 'Claimed', days_until_expiry: daysUntilExpiry }
  }
  if (!warranty.serial_number.trim()) {
    return { display_status: 'Needs serial', days_until_expiry: daysUntilExpiry }
  }
  if (daysUntilExpiry < 0 || warranty.status === 'expired') {
    return { display_status: 'Expired', days_until_expiry: daysUntilExpiry }
  }
  if (daysUntilExpiry < 90) {
    return { display_status: 'Expiring Soon', days_until_expiry: daysUntilExpiry }
  }
  return { display_status: 'Active', days_until_expiry: daysUntilExpiry }
}

export async function listWarranties(): Promise<WarrantyWithDetails[]> {
  const rows = await db.select().from(warranties).orderBy(desc(warranties.createdAt))
  if (!rows.length) return []

  const warrantyIds = rows.map((r) => r.id)
  const customerIds = Array.from(new Set(rows.map((r) => r.customerId)))
  const productIds = Array.from(new Set(rows.map((r) => r.productId)))

  const [customerRows, productRows, claimRows] = await Promise.all([
    db.select().from(customers).where(inArray(customers.id, customerIds)),
    db.select().from(products).where(inArray(products.id, productIds)),
    db.select().from(warrantyClaims).where(inArray(warrantyClaims.warrantyId, warrantyIds)),
  ])

  const customerMap = new Map(customerRows.map((c) => [c.id, c.name]))
  const productMap = new Map(productRows.map((p) => [p.id, p.name]))
  const claimsByWarranty = new Map<string, WarrantyClaim[]>()
  for (const claim of claimRows) {
    const list = claimsByWarranty.get(claim.warrantyId) ?? []
    list.push(mapClaim(claim))
    claimsByWarranty.set(claim.warrantyId, list)
  }

  const now = new Date()
  return rows.map((row) => {
    const warranty = mapWarranty(row)
    const { display_status, days_until_expiry } = getWarrantyDisplayStatus(warranty, now)
    return {
      ...warranty,
      customer_name: customerMap.get(row.customerId) || 'Customer',
      product_name: productMap.get(row.productId) || row.productId,
      display_status,
      days_until_expiry,
      claims: (claimsByWarranty.get(row.id) ?? []).sort(
        (a, b) => b.claim_date.getTime() - a.claim_date.getTime()
      ),
    }
  })
}

export async function getWarranty(id: string): Promise<WarrantyWithDetails | null> {
  const all = await listWarranties()
  return all.find((w) => w.id === id) ?? null
}

export async function registerWarranty(input: RegisterWarrantyInput): Promise<Warranty> {
  const serial = input.serial_number.trim()
  if (!serial) throw new Error('Serial number is required')

  const [existing] = await db
    .select()
    .from(warranties)
    .where(eq(warranties.id, input.warranty_id))
    .limit(1)
  if (!existing) throw new Error('Warranty not found')

  const startDate = existing.startDate
  const expiryDate = addMonths(startDate, input.warranty_period_months)
  const now = new Date()
  let status: Warranty['status'] = 'active'
  if (expiryDate.getTime() < now.getTime()) status = 'expired'
  if (existing.status === 'claimed') status = 'claimed'

  const [row] = await db
    .update(warranties)
    .set({
      serialNumber: serial,
      warrantyPeriodMonths: input.warranty_period_months,
      expiryDate,
      status,
    })
    .where(eq(warranties.id, input.warranty_id))
    .returning()

  return mapWarranty(row)
}

export async function createWarrantyClaim(
  input: CreateWarrantyClaimInput
): Promise<WarrantyClaim> {
  const description = input.issue_description.trim()
  if (!description) throw new Error('Describe the issue')

  const [warranty] = await db
    .select()
    .from(warranties)
    .where(eq(warranties.id, input.warranty_id))
    .limit(1)
  if (!warranty) throw new Error('Warranty not found')
  if (!warranty.serialNumber.trim()) {
    throw new Error('Register a serial number before opening a claim')
  }

  const existing = await db.select({ id: warrantyClaims.id }).from(warrantyClaims)
  const id = nextId(
    'WCL',
    existing.map((r) => r.id),
    5
  )

  const [claim] = await db
    .insert(warrantyClaims)
    .values({
      id,
      warrantyId: input.warranty_id,
      claimDate: new Date(),
      issueDescription: description,
      status: 'pending',
      resolution: '',
    })
    .returning()

  await db
    .update(warranties)
    .set({ status: 'claimed' })
    .where(eq(warranties.id, input.warranty_id))

  return mapClaim(claim)
}

export async function updateWarrantyClaim(
  input: UpdateWarrantyClaimInput
): Promise<WarrantyClaim> {
  const [existing] = await db
    .select()
    .from(warrantyClaims)
    .where(eq(warrantyClaims.id, input.claim_id))
    .limit(1)
  if (!existing) throw new Error('Claim not found')

  const resolution =
    input.resolution !== undefined ? input.resolution.trim() : existing.resolution

  if (
    (input.status === 'resolved' || input.status === 'rejected') &&
    !resolution
  ) {
    throw new Error('Add a resolution note when resolving or rejecting a claim')
  }

  const [claim] = await db
    .update(warrantyClaims)
    .set({
      status: input.status,
      resolution,
    })
    .where(eq(warrantyClaims.id, input.claim_id))
    .returning()

  // If claim is rejected/resolved with no other open claims, restore warranty status by expiry
  if (input.status === 'resolved' || input.status === 'rejected') {
    const openClaims = await db
      .select()
      .from(warrantyClaims)
      .where(eq(warrantyClaims.warrantyId, existing.warrantyId))

    const stillOpen = openClaims.some(
      (c) => c.id !== claim.id && (c.status === 'pending' || c.status === 'approved')
    )

    if (!stillOpen) {
      const [warranty] = await db
        .select()
        .from(warranties)
        .where(eq(warranties.id, existing.warrantyId))
        .limit(1)
      if (warranty) {
        const nextStatus: Warranty['status'] =
          warranty.expiryDate.getTime() < Date.now() ? 'expired' : 'active'
        await db
          .update(warranties)
          .set({ status: nextStatus })
          .where(eq(warranties.id, warranty.id))
      }
    }
  }

  return mapClaim(claim)
}

export async function listWarrantyIds(): Promise<string[]> {
  const rows = await db.select({ id: warranties.id }).from(warranties)
  return rows.map((r) => r.id)
}
