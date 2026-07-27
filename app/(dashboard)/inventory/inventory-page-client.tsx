'use client'

import { useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import type { InventoryMovement, Product } from '@/lib/types/crm'
import { cn } from '@/lib/utils'

function InventoryPageContent({
  products,
  movements,
}: {
  products: Product[]
  movements: InventoryMovement[]
}) {
  const searchParams = useSearchParams()
  const updatedId = searchParams.get('updated')

  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')

  const stats = useMemo(() => {
    const inStock = products.filter((p) => p.stock > 0).length
    const lowStock = products.filter((p) => p.stock > 0 && p.stock < 10).length
    const totalValue = products.reduce((sum, p) => sum + p.cost * p.stock, 0)
    return {
      total_products: products.length,
      in_stock: inStock,
      low_stock: lowStock,
      total_inventory_value: totalValue,
    }
  }, [products])

  const filteredProducts = useMemo(() => {
    if (filter === 'low') return products.filter((p) => p.stock > 0 && p.stock < 10)
    if (filter === 'out') return products.filter((p) => p.stock === 0)
    return products
  }, [products, filter])

  const recentMovements = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]))
    return [...movements]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 15)
      .map((m) => ({
        ...m,
        productName: productMap.get(m.product_id)?.name || m.product_id,
        unit: productMap.get(m.product_id)?.unit || 'pcs',
      }))
  }, [movements, products])

  const filterButtons = [
    { key: 'all' as const, label: 'All Products' },
    { key: 'low' as const, label: 'Low Stock' },
    { key: 'out' as const, label: 'Out of Stock' },
  ]

  const typeStyles = {
    in: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    out: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    adjustment: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  }

  return (
    <PageShell>
      <PageHeader
        title="Inventory Management"
        description="Monitor stock levels and record inventory movements"
        actions={
          <Link href="/products/new">
            <Button className="gap-2">
              <Plus className="size-4" />
              Add product
            </Button>
          </Link>
        }
      />

      {updatedId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Stock updated for product <span className="font-semibold">{updatedId}</span>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Products', value: stats.total_products },
          {
            label: 'In Stock',
            value: stats.in_stock,
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Low Stock',
            value: stats.low_stock,
            className: 'text-amber-700 dark:text-amber-400',
          },
          { label: 'Inventory Value', value: formatCurrency(stats.total_inventory_value) },
        ].map((stat) => (
          <div key={stat.label} className="surface-panel p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={`mt-1 font-display text-2xl font-semibold tabular-nums ${stat.className || ''}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Panel>
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setFilter(btn.key)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                filter === btn.key
                  ? 'border border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                  : 'border border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel padded={false} title="Stock levels">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                {['Product', 'Category', 'Stock', 'Unit Cost', 'Stock Value', 'Action'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        i >= 2 && i <= 4 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.slice(0, 40).map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-4">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                  </td>
                  <td className="px-5 py-4 text-sm">{product.category}</td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums">
                    {product.stock}{' '}
                    <span className="text-muted-foreground">{product.unit}</span>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatCurrency(product.cost)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums">
                    {formatCurrency(product.cost * product.stock)}
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/products/${product.id}/edit`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ArrowUpDown className="size-3" />
                        Edit stock
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredProducts.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No products match this filter</p>
            <p className="mt-1 text-sm text-muted-foreground">Try selecting a different stock level</p>
          </div>
        )}
      </Panel>

      <Panel padded={false} title="Recent movements" description="Latest stock in, out, and adjustments">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40">
                {['Date', 'Product', 'Type', 'Qty', 'Reference', 'Notes'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                      i === 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentMovements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-4 text-sm">{formatDate(movement.date)}</td>
                  <td className="px-5 py-4 text-sm font-medium">{movement.productName}</td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                        typeStyles[movement.type]
                      )}
                    >
                      {movement.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {movement.quantity} {movement.unit}
                  </td>
                  <td className="px-5 py-4 text-sm">{movement.reference}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{movement.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recentMovements.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No movements yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Record a stock movement to get started</p>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}

export function InventoryPageClient({
  products,
  movements,
}: {
  products: Product[]
  movements: InventoryMovement[]
}) {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
        </PageShell>
      }
    >
      <InventoryPageContent products={products} movements={movements} />
    </Suspense>
  )
}
