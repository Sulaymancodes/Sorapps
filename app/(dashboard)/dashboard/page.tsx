import {
  getDashboardFilterOptions,
  getManagementDashboard,
  parseDashboardFilters,
} from '@/lib/services/dashboard'
import { DashboardPageClient } from './dashboard-page-client'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseDashboardFilters(params)

  const [data, options] = await Promise.all([
    getManagementDashboard(filters),
    getDashboardFilterOptions(),
  ])

  return <DashboardPageClient data={data} options={options} />
}
