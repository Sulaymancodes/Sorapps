import { listCustomers } from '@/lib/services/customers'
import { listSales } from '@/lib/services/sales'
import { listWarranties } from '@/lib/services/warranties'
import { listActivations } from '@/lib/services/activations'
import { ActivationsPageClient } from './activations-page-client'

export default async function ActivationsPage() {
  const [customers, sales, warranties, activations] = await Promise.all([
    listCustomers(),
    listSales(),
    listWarranties(),
    listActivations(100),
  ])

  return (
    <ActivationsPageClient
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        city: c.city,
      }))}
      sales={sales.map((s) => ({
        id: s.id,
        customer_id: s.customer_id,
        date: s.date.toISOString(),
        total_amount: s.total_amount,
        status: s.status,
      }))}
      devices={warranties.map((w) => ({
        id: w.id,
        customer_id: w.customer_id,
        sale_id: w.sale_id,
        serial_number: w.serial_number,
        product_name: w.product_name,
      }))}
      activations={activations.map((a) => ({
        ...a,
        expires_at: a.expires_at.toISOString(),
        sent_at: a.sent_at?.toISOString(),
        created_at: a.created_at.toISOString(),
      }))}
      smsConfigured={Boolean(process.env.BULK_SMS_TOKEN)}
    />
  )
}
