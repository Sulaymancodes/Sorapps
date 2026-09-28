export type AppRole = 'admin' | 'agent'

export function normalizeRole(role?: string | null): AppRole {
  if (role === 'admin') return 'admin'
  // Legacy "staff" maps to agent
  return 'agent'
}

export function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === 'admin'
}

export function isAgentRole(role?: string | null): boolean {
  return normalizeRole(role) === 'agent'
}

/** Routes agents may open. Everything else redirects to /sales. */
export const AGENT_ALLOWED_PREFIXES = [
  '/sales',
  '/customers',
  '/activations',
  '/unlock',
  '/calendar',
  '/settings',
  '/~offline',
] as const

export function isAgentAllowedPath(pathname: string): boolean {
  return AGENT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function roleLabel(role?: string | null): string {
  return isAdminRole(role) ? 'Admin' : 'Agent'
}
