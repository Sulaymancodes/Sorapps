import {
  getDashboardStats,
  getPaymentStatusSeries,
  getRevenueSeries,
  getTopCustomersByRevenue,
  getTopProductsByRevenue,
} from '@/lib/services/analytics'
import { DashboardPageClient } from './dashboard-page-client'

export default async function DashboardPage() {
  const [stats, revenueData, paymentData, topProducts, topCustomers] = await Promise.all([
    getDashboardStats(),
    getRevenueSeries(12),
    getPaymentStatusSeries(12),
    getTopProductsByRevenue(10),
    getTopCustomersByRevenue(10),
  ])

  return (
    <DashboardPageClient
      data={{
        stats,
        revenueData,
        paymentData,
        topProducts,
        topCustomers,
      }}
    />
  )
}
