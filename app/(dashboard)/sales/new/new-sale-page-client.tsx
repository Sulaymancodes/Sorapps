'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { SaleForm } from '@/components/forms/SaleForm'
import { Button } from '@/components/ui/button'
import { loadCachedDashboardUser } from '@/lib/offline/app-shell'
import { isAgentRole } from '@/lib/roles'
import type { Customer, Product } from '@/lib/types/crm'

const CATALOG_KEY = 'sorapps-offline-sale-catalog'

type ForcedGeo = { state: string; lga: string }

type CachedCatalog = {
  customers: Customer[]
  products: Product[]
  forcedGeo: ForcedGeo | null
}

function reviveCustomers(customers: Customer[]) {
  return customers.map((customer) => ({
    ...customer,
    created_at: customer.created_at ? new Date(customer.created_at) : new Date(),
    gps_captured_at: customer.gps_captured_at ? new Date(customer.gps_captured_at) : null,
  }))
}

function loadCatalog(): CachedCatalog | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedCatalog
    if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.products)) return null
    return {
      customers: reviveCustomers(parsed.customers),
      products: parsed.products,
      forcedGeo: parsed.forcedGeo ?? null,
    }
  } catch {
    return null
  }
}

function saveCatalog(catalog: CachedCatalog) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog))
  } catch {
    // ignore quota
  }
}

function geoFromSession(): ForcedGeo | null {
  const user = loadCachedDashboardUser()
  if (!user || !isAgentRole(user.role) || !user.assignedState || !user.assignedLga) return null
  return { state: user.assignedState, lga: user.assignedLga }
}

export function NewSalePageClient({
  customers,
  products,
  forcedGeo,
  isAdmin,
  onBack,
}: {
  customers: Customer[]
  products: Product[]
  forcedGeo: ForcedGeo | null
  isAdmin: boolean
  onBack?: () => void
}) {
  const [catalog, setCatalog] = useState<CachedCatalog>({ customers, products, forcedGeo })

  useEffect(() => {
    if (customers.length > 0 || products.length > 0) {
      const next = { customers, products, forcedGeo }
      saveCatalog(next)
      setCatalog(next)
      return
    }
    const cached = loadCatalog()
    if (cached) {
      setCatalog({
        ...cached,
        forcedGeo: forcedGeo ?? cached.forcedGeo ?? geoFromSession(),
      })
    } else {
      setCatalog({ customers, products, forcedGeo: forcedGeo ?? geoFromSession() })
    }
  }, [customers, products, forcedGeo])

  const hasStock = catalog.products.some((product) => product.stock > 0)
  const geo = catalog.forcedGeo

  return (
    <PageShell>
      <PageHeader
        title={geo ? 'Add sale' : 'New sale'}
        description={
          geo
            ? `Territory locked to ${geo.lga}, ${geo.state}`
            : 'Create a sale — invoice and payment schedule are generated automatically'
        }
        actions={
          onBack ? (
            <Button type="button" variant="outline" className="gap-2" onClick={onBack}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : (
            <Link href="/sales">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </Link>
          )
        }
      />
      {!hasStock ? (
        <div className="rounded-xl border border-border/70 bg-card p-6 text-sm">
          <p className="font-medium">Before you can create a sale</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              {isAdmin ? (
                <Link href="/products/new" className="text-primary hover:underline">
                  Add a product with stock
                </Link>
              ) : (
                'Ask an admin to add product stock, or open this page once while online so products are saved on this device.'
              )}
            </li>
          </ul>
        </div>
      ) : null}
      <SaleForm customers={catalog.customers} products={catalog.products} forcedGeo={geo} showMoney={isAdmin} />
    </PageShell>
  )
}
