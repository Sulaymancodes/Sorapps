import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminRole, isAgentAllowedPath, isAgentRole, normalizeRole } from '@/lib/roles'

export function isNextRedirect(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

export async function requireSession() {
  const session = await getSession()
  if (!session) {
    try {
      const store = await cookies()
      for (const cookie of store.getAll()) {
        if (cookie.name.includes('better-auth')) {
          store.delete(cookie.name)
        }
      }
    } catch {
      // Cookie mutation may be blocked during render; proxy also clears on redirect.
    }
    redirect('/login')
  }
  return session
}

export async function requireAdmin() {
  const session = await requireSession()
  if (!isAdminRole(session.user.role)) {
    throw new Error('Admin access required')
  }
  return session
}

export type SessionUserAccess = {
  id: string
  role: ReturnType<typeof normalizeRole>
  isAdmin: boolean
  isAgent: boolean
  assignedState: string
  assignedLga: string
  phone: string
}

export function getSessionAccess(
  session: Awaited<ReturnType<typeof requireSession>>
): SessionUserAccess {
  const role = normalizeRole(session.user.role)
  return {
    id: session.user.id,
    role,
    isAdmin: role === 'admin',
    isAgent: role === 'agent',
    assignedState: (session.user as { assignedState?: string }).assignedState || '',
    assignedLga: (session.user as { assignedLga?: string }).assignedLga || '',
    phone: (session.user as { phone?: string }).phone || '',
  }
}

/** Redirect agents away from admin-only sections. */
export async function enforceAgentRouteAccess(pathname: string) {
  const session = await requireSession()
  const access = getSessionAccess(session)
  if (access.isAgent && !isAgentAllowedPath(pathname)) {
    redirect('/sales')
  }
  return { session, access }
}

export { isAdminRole, isAgentRole }
