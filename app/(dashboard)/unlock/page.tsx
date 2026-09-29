import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { isBeebeeJumpConfigured } from '@/lib/services/beebeejump'
import { listTeamUnlocks } from '@/lib/services/unlocks'
import { UnlockPageClient } from './unlock-page-client'

export default async function UnlockPage() {
  try {
    const session = await requireSession()
    getSessionAccess(session)
    const history = await listTeamUnlocks()

    return (
      <UnlockPageClient
        beebeeConfigured={isBeebeeJumpConfigured()}
        history={history.map((row) => ({
          id: row.id,
          serial_number: row.serial_number,
          kind: row.kind,
          day_token: row.day_token,
          pin: row.pin,
          source: row.source,
          sale_id: row.sale_id || '',
          created_at: row.created_at.toISOString(),
        }))}
      />
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return <UnlockPageClient history={[]} beebeeConfigured={false} />
  }
}
