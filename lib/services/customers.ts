import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, sales } from '@/lib/db/schema'
import type { Customer, CustomerInput } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

function mapCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    state: row.state,
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

export async function createCustomer(input: CustomerInput): Promise<Customer> {
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
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state,
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
  const [row] = await db
    .update(customers)
    .set({
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state,
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
      `Cannot delete ${existing.name} — they have ${count} sale${count === 1 ? '' : 's'}. Remove related sales first.`
    )
  }

  await db.delete(customers).where(eq(customers.id, id))
  return { deleted: true }
}
