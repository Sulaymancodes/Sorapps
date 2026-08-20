import type { SessionUserAccess } from '@/lib/auth-server'

function norm(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

export function matchesAgentTerritory(
  location: { state?: string | null; lga?: string | null },
  access: Pick<SessionUserAccess, 'isAgent' | 'assignedState' | 'assignedLga'>
): boolean {
  if (!access.isAgent) return true
  if (access.assignedState && norm(location.state) !== norm(access.assignedState)) {
    return false
  }
  if (access.assignedLga && norm(location.lga) !== norm(access.assignedLga)) {
    return false
  }
  return true
}

export function assertAgentTerritory(
  location: { state?: string | null; lga?: string | null },
  access: Pick<SessionUserAccess, 'isAgent' | 'assignedState' | 'assignedLga'>
) {
  if (!matchesAgentTerritory(location, access)) {
    throw new Error(
      `Agents can only work in ${access.assignedLga}, ${access.assignedState}`
    )
  }
}
