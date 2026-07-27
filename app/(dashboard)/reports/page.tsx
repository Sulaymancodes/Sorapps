import {
  getInventoryValueByCategory,
  getOverallStats,
  getPaymentStatusSeries,
  getRevenueSeries,
  getSalesBreakdown,
  getTopCustomersByRevenue,
  getTopProductsByRevenue,
} from '@/lib/services/analytics'
import { ReportsPageClient } from './reports-page-client'

export default async function ReportsPage() {
  const [
    stats,
    revenueData,
    salesBreakdown,
    paymentTrend,
    inventoryValue,
    topProducts,
    topCustomers,
  ] = await Promise.all([
    getOverallStats(),
    getRevenueSeries(12),
    getSalesBreakdown(),
    getPaymentStatusSeries(12),
    getInventoryValueByCategory(),
    getTopProductsByRevenue(10),
    getTopCustomersByRevenue(10),
  ])

  return (
    <ReportsPageClient
      data={{
        stats,
        revenueData,
        salesByStatus: salesBreakdown.by_status,
        paymentTypeData: salesBreakdown.by_payment_type,
        paymentTrend,
        inventoryValue,
        topProducts,
        topCustomers,
      }}
    />
  )
}
