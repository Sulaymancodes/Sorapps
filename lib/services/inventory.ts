import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryMovements } from '@/lib/db/schema'
import type { InventoryMovement } from '@/lib/types/crm'

export async function listInventoryMovements(): Promise<InventoryMovement[]> {
  const rows = await db
    .select()
    .from(inventoryMovements)
    .orderBy(desc(inventoryMovements.date))
    .limit(100)

  return rows.map((row) => ({
    id: row.id,
    product_id: row.productId,
    type: row.type as InventoryMovement['type'],
    quantity: row.quantity,
    reference: row.reference,
    date: row.date,
    notes: row.notes,
  }))
}
