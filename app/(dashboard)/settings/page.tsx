import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listAppUsers } from '@/lib/services/users'
import { SettingsPageClient } from './settings-page-client'

export default async function SettingsPage() {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    const users = access.isAdmin ? await listAppUsers() : []

    return (
      <SettingsPageClient
        isAdmin={access.isAdmin}
        currentUserId={session.user.id}
        users={users.map((u) => ({
          ...u,
          created_at: u.created_at.toISOString(),
        }))}
      />
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return <SettingsPageClient isAdmin={false} currentUserId="" users={[]} />
  }
}
