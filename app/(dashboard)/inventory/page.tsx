import { listInventoryMovements } from '@/lib/services/inventory'
import { listProducts } from '@/lib/services/products'
import { InventoryPageClient } from './inventory-page-client'

export default async function InventoryPage() {
  const [products, movements] = await Promise.all([
    listProducts(),
    listInventoryMovements(),
  ])
  return <InventoryPageClient products={products} movements={movements} />
}
