import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listCustomers } from '@/lib/services/customers'
import { listSales, listPaymentSchedules } from '@/lib/services/sales'
import { listWarranties } from '@/lib/services/warranties'
import { listActivations } from '@/lib/services/activations'
import { getPaygoBaseValidityDays } from '@/lib/paygo/validity'
import { matchesAgentTerritory } from '@/lib/utils/territory'
import { ActivationsPageClient } from './activations-page-client'

function EmptyActivations() {
  return (
    <ActivationsPageClient
      customers={[]}
      sales={[]}
      devices={[]}
      activations={[]}
      smsConfigured={false}
      baseValidityDays={getPaygoBaseValidityDays()}
    />
  )
}

export default async function ActivationsPage() {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    const [customers, sales, warranties, activations, schedules] = await Promise.all([
      listCustomers(),
      listSales(),
      listWarranties(),
      listActivations(100),
      listPaymentSchedules(),
    ])

    const scopedCustomers = customers.filter((c) =>
      matchesAgentTerritory({ state: c.state, lga: c.lga }, access)
    )
    const customerIds = new Set(scopedCustomers.map((c) => c.id))
    const scopedSales = sales.filter((s) => customerIds.has(s.customer_id))
    const scopedWarranties = warranties.filter((w) => customerIds.has(w.customer_id))
    const scopedActivations = activations.filter((a) => customerIds.has(a.customer_id))
    const scheduleBySale = new Map(schedules.map((s) => [s.sale_id, s]))

    return (
      <ActivationsPageClient
        customers={scopedCustomers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone || c.guardian_phone,
          city: c.city,
          is_minor: c.is_minor,
          guardian_phone: c.guardian_phone,
        }))}
        sales={scopedSales.map((s) => {
          const schedule = scheduleBySale.get(s.id)
          const next = schedule?.installments.find((i) => i.status !== 'paid')
          const outstanding = Math.max(0, s.total_amount - s.amount_paid)
          const expected = next
            ? Math.max(1, next.amount - (next.paid_amount || 0))
            : Math.max(
                1,
                schedule?.installments[0]?.amount || outstanding || s.total_amount
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
        devices={scopedWarranties.map((w) => ({
          id: w.id,
          customer_id: w.customer_id,
          sale_id: w.sale_id,
          serial_number: w.serial_number,
          product_name: w.product_name,
        }))}
        activations={scopedActivations.map((a) => ({
          ...a,
          expires_at: a.expires_at.toISOString(),
          sent_at: a.sent_at?.toISOString(),
          created_at: a.created_at.toISOString(),
        }))}
        smsConfigured={Boolean(process.env.BULK_SMS_TOKEN)}
        baseValidityDays={getPaygoBaseValidityDays()}
      />
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return <EmptyActivations />
  }
}
