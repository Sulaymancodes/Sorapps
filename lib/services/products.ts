import { desc, eq, ne, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import type { Product, ProductInput } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

function mapProduct(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    brand: row.brand,
    description: row.description,
    model_number: row.modelNumber || '',
    pv_capacity_wp: row.pvCapacityWp || 0,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    unit: row.unit,
    image: row.image ?? undefined,
  }
}

export async function listProducts(): Promise<Product[]> {
  const rows = await db.select().from(products).orderBy(desc(products.createdAt))
  return rows.map(mapProduct)
}

export async function getProduct(id: string): Promise<Product | null> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1)
  return rows[0] ? mapProduct(rows[0]) : null
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const existing = await db.select({ id: products.id, sku: products.sku }).from(products)
  const id = nextId(
    'PROD',
    existing.map((r) => r.id),
    5
  )
  const sku =
    input.sku.trim() || `SKU-${String(Number(id.replace(/\D/g, ''))).padStart(6, '0')}`

  if (existing.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) {
    throw new Error('A product with this SKU already exists')
  }

  const modelNumber = (input.model_number || '').trim() || sku
  const pvCapacityWp = Math.max(0, Math.round(Number(input.pv_capacity_wp) || 0))
  if (!modelNumber) throw new Error('Approved model number is required')
  if (pvCapacityWp <= 0) throw new Error('PV capacity (W) must be greater than 0')

  const now = new Date()
  const [row] = await db
    .insert(products)
    .values({
      id,
      sku,
      name: input.name.trim(),
      category: input.category,
      brand: input.brand,
      description:
        input.description.trim() || `Professional grade ${input.category.toLowerCase()}`,
      modelNumber,
      pvCapacityWp,
      price: Math.max(0, Math.round(input.price)),
      cost: Math.max(0, Math.round(input.cost)),
      stock: Math.max(0, Math.floor(input.stock)),
      unit: input.unit || 'pcs',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return mapProduct(row)
}

export async function updateProduct(
  id: string,
  input: ProductInput
): Promise<Product | null> {
  const sku = input.sku.trim()
  const duplicates = await db
    .select({ id: products.id })
    .from(products)
    .where(and(ne(products.id, id), sql`lower(${products.sku}) = ${sku.toLowerCase()}`))
    .limit(1)

  if (duplicates.length) {
    throw new Error('A product with this SKU already exists')
  }

  const modelNumber = (input.model_number || '').trim() || sku
  const pvCapacityWp = Math.max(0, Math.round(Number(input.pv_capacity_wp) || 0))
  if (!modelNumber) throw new Error('Approved model number is required')
  if (pvCapacityWp <= 0) throw new Error('PV capacity (W) must be greater than 0')

  const [row] = await db
    .update(products)
    .set({
      sku,
      name: input.name.trim(),
      category: input.category,
      brand: input.brand,
      description: input.description.trim(),
      modelNumber,
      pvCapacityWp,
      price: Math.max(0, Math.round(input.price)),
      cost: Math.max(0, Math.round(input.cost)),
      stock: Math.max(0, Math.floor(input.stock)),
      unit: input.unit || 'pcs',
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning()

  return row ? mapProduct(row) : null
}
