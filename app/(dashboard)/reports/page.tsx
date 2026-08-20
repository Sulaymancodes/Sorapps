import {
  getOddyseaReport,
  parseOddyseaFilters,
} from '@/lib/services/oddysea'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { APPROVED_DEPLOYMENT_AREAS } from '@/lib/constants/deployment-areas'
import { ReportsPageClient } from './reports-page-client'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseOddyseaFilters(params)
  const report = await getOddyseaReport(filters)

  return (
    <ReportsPageClient
      report={report}
      options={{
        states: [...NIGERIAN_STATES],
        deployment_areas: APPROVED_DEPLOYMENT_AREAS.map((a) => ({
          id: a.id,
          name: a.name,
          state: a.state,
        })),
      }}
    />
  )
}
