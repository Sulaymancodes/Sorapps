import { listCustomers } from '@/lib/services/customers'
import { listProducts } from '@/lib/services/products'
import { listInvoices, listSales } from '@/lib/services/sales'

export type SearchResultType = 'customer' | 'product' | 'invoice' | 'sale'

export type SearchResult = {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  href: string
}

function matches(query: string, ...values: Array<string | number | null | undefined>) {
  const q = query.toLowerCase().trim()
  if (!q) return false
  return values.some((value) => String(value ?? '').toLowerCase().includes(q))
}

export async function globalSearch(query: string, limit = 12): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 1) return []

  const [customers, products, invoices, sales] = await Promise.all([
    listCustomers(),
    listProducts(),
    listInvoices(),
    listSales(),
  ])

  const customerNames = new Map(customers.map((c) => [c.id, c.name]))
  const results: SearchResult[] = []

  for (const customer of customers) {
    if (
      matches(
        trimmed,
        customer.id,
        customer.name,
        customer.email,
        customer.phone,
        customer.city,
        customer.business_type
      )
    ) {
      results.push({
        id: customer.id,
        type: 'customer',
        title: customer.name,
        subtitle: `${customer.email} · ${customer.phone}`,
        href: `/customers/${customer.id}/edit`,
      })
    }
  }

  for (const product of products) {
    if (
      matches(
        trimmed,
        product.id,
        product.sku,
        product.name,
        product.brand,
        product.category
      )
    ) {
      results.push({
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
        customerName,
        invoice.status
      )
    ) {
      results.push({
        id: invoice.id,
        type: 'invoice',
        title: invoice.invoice_number,
        subtitle: `${customerName} · ${invoice.status.replace(/_/g, ' ')}`,
        href: '/invoices',
      })
    }
  }

  for (const sale of sales) {
    const customerName = customerNames.get(sale.customer_id) || sale.customer_id
    if (matches(trimmed, sale.id, customerName, sale.status, sale.payment_type, sale.notes)) {
      results.push({
        id: sale.id,
        type: 'sale',
        title: sale.id,
        subtitle: `${customerName} · ${sale.status.replace(/_/g, ' ')}`,
        href: '/sales',
      })
    }
  }

  const order: Record<SearchResultType, number> = {
    customer: 0,
    product: 1,
    invoice: 2,
    sale: 3,
  }

  return results.sort((a, b) => order[a.type] - order[b.type]).slice(0, limit)
}
