import { getSessionAccess, isNextRedirect, requireSession } from '@/lib/auth-server'
import { listAppUsers } from '@/lib/services/users'
import { getOrgSettings } from '@/lib/services/org-settings'
import { SettingsPageClient } from './settings-page-client'

export default async function SettingsPage() {
  try {
    const session = await requireSession()
    const access = getSessionAccess(session)
    let orgSettings = { kyc_uploads_required: false }
    let users: Awaited<ReturnType<typeof listAppUsers>> = []
    try {
      const [listed, settings] = await Promise.all([
        access.isAdmin ? listAppUsers() : Promise.resolve([]),
        getOrgSettings(),
      ])
      users = listed
      orgSettings = settings
    } catch {
      if (access.isAdmin) {
        try {
          users = await listAppUsers()
        } catch {
          users = []
        }
      }
    }

    return (
      <SettingsPageClient
        isAdmin={access.isAdmin}
        currentUserId={session.user.id}
        users={users.map((u) => ({
          ...u,
          created_at: u.created_at.toISOString(),
        }))}
        kycUploadsRequired={orgSettings.kyc_uploads_required}
      />
    )
  } catch (error) {
    if (isNextRedirect(error)) throw error
    return (
      <SettingsPageClient
        isAdmin={false}
        currentUserId=""
        users={[]}
        kycUploadsRequired={false}
      />
    )
  }
}
