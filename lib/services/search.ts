import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'
import { listInvoices, listSales } from '@/lib/services/sales'
import { listWarranties } from '@/lib/services/warranties'

export type SearchResultType = 'customer' | 'product' | 'invoice' | 'sale' | 'device'

export type SearchResult = {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  href: string
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function matches(query: string, ...values: Array<string | number | null | undefined>) {
  const q = query.toLowerCase().trim()
  if (!q) return false
  const qDigits = digitsOnly(q)

  return values.some((value) => {
    const raw = String(value ?? '')
    if (!raw) return false
    if (raw.toLowerCase().includes(q)) return true
    // Allow NIN / BVN / phone lookup without formatting
    if (qDigits.length >= 4) {
      const d = digitsOnly(raw)
      if (d && d.includes(qDigits)) return true
    }
    return false
  })
}

function contactLine(customer: {
  phone: string
  guardian_phone: string
  id: string
  nin: string
  bvn: string
}) {
  const phone = customer.phone || customer.guardian_phone || '—'
  const ids = [
    customer.id,
    customer.nin ? `NIN ${customer.nin}` : '',
    customer.bvn ? `BVN ${customer.bvn}` : '',
  ].filter(Boolean)
  return `${phone} · ${ids.join(' · ')}`
}

export async function globalSearch(query: string, limit = 16): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 1) return []

  const [customers, products, invoices, sales, warranties] = await Promise.all([
    listCustomers(),
    listProducts(),
    listInvoices(),
    listSales(),
    listWarranties(),
  ])

  const customerNames = new Map(customers.map((c) => [c.id, c.name]))
  const results: SearchResult[] = []
  const seen = new Set<string>()

  function push(result: SearchResult) {
    const key = `${result.type}:${result.id}`
    if (seen.has(key)) return
    seen.add(key)
    results.push(result)
  }

  for (const customer of customers) {
    if (
      matches(
        trimmed,
        customer.id,
        customer.name,
        customer.email,
        customer.phone,
        customer.guardian_phone,
        customer.next_of_kin_phone,
        customer.nin,
        customer.bvn,
        customer.city,
        customer.state,
        customer.lga,
        customer.business_type
      )
    ) {
      push({
        id: customer.id,
        type: 'customer',
        title: customer.name,
        subtitle: contactLine(customer),
        href: `/customers/${customer.id}/edit`,
      })
    }
  }

  for (const product of products) {
    if (
      matches(trimmed, product.id, product.sku, product.name, product.brand, product.category)
    ) {
      push({
        id: product.id,
        type: 'product',
        title: product.name,
        subtitle: `${product.sku} · ${product.brand} · ${product.category}`,
        href: `/products/${product.id}/edit`,
      })
    }
  }

  for (const invoice of invoices) {
    const customerName = customerNames.get(invoice.customer_id) || invoice.customer_id
    if (
      matches(
        trimmed,
        invoice.id,
        invoice.invoice_number,
        invoice.sale_id,
        invoice.customer_id,
        customerName,
        invoice.status
      )
    ) {
      push({
        id: invoice.id,
        type: 'invoice',
        title: invoice.invoice_number,
        subtitle: `${customerName} · ${invoice.sale_id} · ${invoice.status.replace(/_/g, ' ')}`,
        href: `/invoices/${encodeURIComponent(invoice.id)}`,
      })
    }
  }

  for (const sale of sales) {
    const customerName = customerNames.get(sale.customer_id) || sale.customer_id
    if (
      matches(
        trimmed,
        sale.id,
        sale.customer_id,
        customerName,
        sale.status,
        sale.payment_type,
        sale.notes
      )
    ) {
      push({
        id: sale.id,
        type: 'sale',
        title: sale.id,
        subtitle: `${customerName} · ${sale.status.replace(/_/g, ' ')}`,
        href: '/sales',
      })
    }
  }

  for (const warranty of warranties) {
    const customerName = warranty.customer_name || customerNames.get(warranty.customer_id) || ''
    if (
      matches(
        trimmed,
        warranty.id,
        warranty.serial_number,
        warranty.sale_id,
        warranty.customer_id,
        customerName,
        warranty.product_name
      )
    ) {
      push({
        id: warranty.id,
        type: 'device',
        title: warranty.serial_number.trim() || warranty.id,
        subtitle: `${warranty.product_name} · ${customerName} · ${warranty.sale_id}`,
        href: '/warranty',
      })

      // Also surface the linked sale when searching by serial
      if (warranty.sale_id && matches(trimmed, warranty.serial_number)) {
        push({
          id: warranty.sale_id,
          type: 'sale',
          title: warranty.sale_id,
          subtitle: `Serial ${warranty.serial_number} · ${customerName}`,
          href: '/sales',
        })
      }
    }
  }

  const order: Record<SearchResultType, number> = {
    customer: 0,
    device: 1,
    sale: 2,
    invoice: 3,
    product: 4,
  }

  return results.sort((a, b) => order[a.type] - order[b.type]).slice(0, limit)
}
