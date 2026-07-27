import { listProducts } from '@/lib/services/products'
import { ProductsPageClient } from './products-page-client'

export default async function ProductsPage() {
  const products = await listProducts()
  return <ProductsPageClient products={products} />
}
