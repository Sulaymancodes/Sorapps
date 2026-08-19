import {
  getPaymentStats,
  listOutstandingSaleOptions,
  listPaymentsPage,
} from '@/lib/services/payments'
import { PaymentsPageClient } from './payments-page-client'

export default async function PaymentsPage() {
  const [stats, paymentsPage, collectionQueue, outstandingForSelect] = await Promise.all([
    getPaymentStats(),
    listPaymentsPage({ page: 1, page_size: 25 }),
    listOutstandingSaleOptions({ urgency: 'actionable', limit: 40 }),
    listOutstandingSaleOptions({ urgency: 'all', limit: 100 }),
  ])

  return (
    <PaymentsPageClient
      stats={stats}
      initialPayments={paymentsPage}
      collectionQueue={collectionQueue}
      outstandingSales={outstandingForSelect}
      smsConfigured={Boolean(process.env.BULK_SMS_TOKEN)}
      baseValidityDays={Number(process.env.PAYGO_BASE_VALIDITY_DAYS || 30)}
    />
  )
}
