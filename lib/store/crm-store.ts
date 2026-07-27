import { create } from 'zustand'
import type { InventoryMovement, Product } from '@/lib/types/crm'

export type InventoryMovementInput = {
  product_id: string
  type: InventoryMovement['type']
  quantity: number
  reference: string
  notes: string
}

/** Slim store for modules not yet on Postgres (inventory adjust form only). */
type CrmState = {
  products: Product[]
  inventoryMovements: InventoryMovement[]
  recordInventoryMovement: (
    input: InventoryMovementInput
  ) => { movement: InventoryMovement; product: Product }
}

function nextId(prefix: string, existing: string[], pad: number) {
  const nums = existing
    .map((id) => Number(id.replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(pad, '0')}`
}

export const useCrmStore = create<CrmState>((set, get) => ({
  products: [],
  inventoryMovements: [],

  recordInventoryMovement: (input) => {
    const product = get().products.find((p) => p.id === input.product_id)
    if (!product) throw new Error('Product not found — use Products to manage stock for now')

    const qty = Math.max(0, Math.floor(input.quantity))
    if (input.type !== 'adjustment' && qty <= 0) {
      throw new Error('Quantity must be greater than zero')
    }

    let nextStock = product.stock
    if (input.type === 'in') nextStock = product.stock + qty
    else if (input.type === 'out') {
      if (qty > product.stock) throw new Error('Insufficient stock for this outbound movement')
      nextStock = product.stock - qty
    } else {
      nextStock = qty
    }

    const movement: InventoryMovement = {
      id: nextId('INV_MOV', get().inventoryMovements.map((m) => m.id), 6),
      product_id: product.id,
      type: input.type,
      quantity: qty,
      reference: input.reference.trim() || `REF${Date.now().toString().slice(-6)}`,
      date: new Date(),
      notes: input.notes.trim() || `${input.type} movement`,
    }

    const updatedProduct: Product = { ...product, stock: nextStock }

    set((state) => ({
      inventoryMovements: [movement, ...state.inventoryMovements],
      products: state.products.map((p) => (p.id === product.id ? updatedProduct : p)),
    }))

    return { movement, product: updatedProduct }
  },
}))
