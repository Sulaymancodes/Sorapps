import { products, Product } from '@/data/mockData'

export async function getProducts(filters?: {
  search?: string
  category?: string
  brand?: string
  inStock?: boolean
}): Promise<Product[]> {
  let result = [...products]

  if (filters?.search) {
    const search = filters.search.toLowerCase()
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search)
    )
  }

  if (filters?.category) {
    result = result.filter((p) => p.category === filters.category)
  }

  if (filters?.brand) {
    result = result.filter((p) => p.brand === filters.brand)
  }

  if (filters?.inStock) {
    result = result.filter((p) => p.stock > 0)
  }

  return result
}

export async function getProductById(id: string): Promise<Product | null> {
  return products.find((p) => p.id === id) || null
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  return products.filter((p) => p.category === category)
}

export async function getProductCategories(): Promise<string[]> {
  return Array.from(new Set(products.map((p) => p.category)))
}

export async function getProductBrands(): Promise<string[]> {
  return Array.from(new Set(products.map((p) => p.brand)))
}

export async function getTopProducts(limit: number = 10): Promise<Product[]> {
  return [...products]
    .sort((a, b) => (b.price - b.cost) * b.stock - (a.price - a.cost) * a.stock)
    .slice(0, limit)
}

export async function getProductStats() {
  const inStock = products.filter((p) => p.stock > 0)
  const lowStock = products.filter((p) => p.stock > 0 && p.stock < 10)

  return {
    total_products: products.length,
    in_stock: inStock.length,
    out_of_stock: products.filter((p) => p.stock === 0).length,
    low_stock: lowStock.length,
    total_inventory_value: products.reduce((sum, p) => sum + p.cost * p.stock, 0),
  }
}
