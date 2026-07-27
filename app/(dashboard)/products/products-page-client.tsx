'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, AlertTriangle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { formatCurrency } from '@/lib/utils/formatting'
import type { Product } from '@/lib/types/crm'

export function ProductsPageClient({ products }: { products: Product[] }) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products]
  )
  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand))).sort(),
    [products]
  )

  const filteredProducts = useMemo(() => {
    let filtered = products
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      )
    }
    if (selectedCategory) filtered = filtered.filter((p) => p.category === selectedCategory)
    if (selectedBrand) filtered = filtered.filter((p) => p.brand === selectedBrand)
    return filtered
  }, [products, search, selectedCategory, selectedBrand])

  const stats = useMemo(
    () => ({
      inStock: filteredProducts.filter((p) => p.stock > 0).length,
      lowStock: filteredProducts.filter((p) => p.stock > 0 && p.stock < 10).length,
      outOfStock: filteredProducts.filter((p) => p.stock === 0).length,
    }),
    [filteredProducts]
  )

  return (
    <PageShell>
      <PageHeader
        title="Products"
        description={
          products.length === 0
            ? 'No products yet — add catalog items before selling'
            : `${filteredProducts.length} products in your catalog`
        }
        actions={
          <Link href="/products/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              Add Product
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: 'In Stock', value: stats.inStock, className: 'text-emerald-700 dark:text-emerald-400' },
          { label: 'Low Stock', value: stats.lowStock, className: 'text-amber-700 dark:text-amber-400' },
          { label: 'Out of Stock', value: stats.outOfStock, className: 'text-red-600 dark:text-red-400' },
        ].map((stat) => (
          <div key={stat.label} className="surface-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${stat.className}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Panel>
        <div className="space-y-4">
          <SearchField
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Category
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Brand
              </label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
              >
                <option value="">All Brands</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                {['Product', 'Category', 'Brand', 'Price', 'Cost', 'Margin', 'Stock', 'Status', 'Action'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        i >= 3 && i <= 6 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const margin =
                  product.price > 0 ? ((product.price - product.cost) / product.price) * 100 : 0
                let stockStatus = 'in-stock'
                if (product.stock === 0) stockStatus = 'out-of-stock'
                else if (product.stock < 10) stockStatus = 'low-stock'

                const statusColors = {
                  'in-stock':
                    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
                  'low-stock': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                  'out-of-stock': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                }

                return (
                  <tr
                    key={product.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm">{product.category}</td>
                    <td className="px-5 py-4 text-sm">{product.brand}</td>
                    <td className="px-5 py-4 text-right font-medium tabular-nums">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(product.cost)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">{margin.toFixed(1)}%</td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-medium tabular-nums">{product.stock}</span>{' '}
                      <span className="text-muted-foreground">{product.unit}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[stockStatus as keyof typeof statusColors]}`}
                      >
                        {stockStatus === 'low-stock' && <AlertTriangle className="mr-1 size-3" />}
                        {stockStatus === 'in-stock' && 'In Stock'}
                        {stockStatus === 'low-stock' && 'Low Stock'}
                        {stockStatus === 'out-of-stock' && 'Out of Stock'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/products/${product.id}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Pencil className="size-3" />
                          Edit
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredProducts.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">
              {products.length === 0 ? 'No products yet' : 'No products found'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {products.length === 0
                ? 'Add products with stock before creating sales'
                : 'Try adjusting your search or filters'}
            </p>
            {products.length === 0 && (
              <Link href="/products/new" className="mt-4 inline-block">
                <Button className="gap-2">
                  <Plus className="size-4" />
                  Add Product
                </Button>
              </Link>
            )}
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
