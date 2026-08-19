import { listCustomers } from '@/lib/services/customers'
import { listSales, listPaymentSchedules } from '@/lib/services/sales'
import { listWarranties } from '@/lib/services/warranties'
import { listActivations } from '@/lib/services/activations'
import { getPaygoBaseValidityDays } from '@/lib/paygo/validity'
import { ActivationsPageClient } from './activations-page-client'

export default async function ActivationsPage() {
  const [customers, sales, warranties, activations, schedules] = await Promise.all([
    listCustomers(),
    listSales(),
    listWarranties(),
    listActivations(100),
    listPaymentSchedules(),
  ])

  const scheduleBySale = new Map(schedules.map((s) => [s.sale_id, s]))

  return (
    <ActivationsPageClient
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        city: c.city,
      }))}
      sales={sales.map((s) => {
        const schedule = scheduleBySale.get(s.id)
        const next = schedule?.installments.find((i) => i.status !== 'paid')
        const outstanding = Math.max(0, s.total_amount - s.amount_paid)
        // When fully paid, fall back to the schedule unit (or sale total) so renewals
        // still get a sensible amount→validity baseline — never Math.max(1, 0) → ₦1.
        const expected = next
          ? Math.max(1, next.amount - (next.paid_amount || 0))
          : Math.max(
              1,
              schedule?.installments[0]?.amount ||
                outstanding ||
                s.total_amount
            )
        return {
          id: s.id,
          customer_id: s.customer_id,
          date: s.date.toISOString(),
          total_amount: s.total_amount,
          amount_paid: s.amount_paid,
          outstanding,
          expected_amount: expected,
          status: s.status,
          payment_type: s.payment_type,
        }
      })}
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
      baseValidityDays={getPaygoBaseValidityDays()}
    />
  )
}
