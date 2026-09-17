import { isAgentRole } from '@/lib/roles'
import { isBrowserOnline } from '@/lib/offline/network'

export const SESSION_CACHE_KEY = 'sorapps-offline-session'

export type CachedDashboardUser = {
  name: string
  email: string
  role?: string | null
  image?: string | null
  assignedState?: string | null
  assignedLga?: string | null
}

const AGENT_ROUTES = [
  '/sales',
  '/sales/new',
  '/sales/drafts',
  '/customers',
  '/customers/new',
  '/customers/drafts',
  '/activations',
  '/calendar',
  '/settings',
]

const ADMIN_ROUTES = [
  '/dashboard',
  '/reports',
  '/invoices',
  '/payments',
  '/products',
  '/inventory',
  '/warranty',
  ...AGENT_ROUTES,
]

export const PUBLIC_OFFLINE_ROUTES = ['/login', '/~offline']

export function offlineRoutesForUser(user?: Pick<CachedDashboardUser, 'role'> | null) {
  return isAgentRole(user?.role) ? AGENT_ROUTES : ADMIN_ROUTES
}

export function homePathForUser(user?: Pick<CachedDashboardUser, 'role'> | null) {
  return isAgentRole(user?.role) ? '/sales' : '/dashboard'
}

export async function findCachedAppPath(preferred?: string | null) {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return preferred || null
  }

  const candidates = [
    preferred,
    '/sales/new',
    '/sales',
    '/customers/new',
    '/customers',
    '/sales/drafts',
    '/dashboard',
    '/calendar',
    '/activations',
    '/settings',
    '/login',
  ].filter((path): path is string => Boolean(path))

  for (const path of [...new Set(candidates)]) {
    const url = new URL(path, window.location.origin).toString()
    const match = await caches.match(url, { ignoreSearch: true })
    if (match?.ok) return path
  }

  return preferred || null
}

export function saveCachedDashboardUser(user: CachedDashboardUser) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user))
  } catch {
    // Quota or private mode — offline shell can still work from cached HTML.
  }
}

export function loadCachedDashboardUser(): CachedDashboardUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedDashboardUser
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.name !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function clearCachedDashboardUser() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    // ignore
  }
}

export function shouldHardNavigate() {
  return !isBrowserOnline()
}

export function hardNavigate(href: string, replace = false) {
  if (typeof window === 'undefined') return
  if (replace) window.location.replace(href)
  else window.location.assign(href)
}

export function isSameOriginAppPath(href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return false
  if (href.startsWith('/api/')) return false
  return true
}

export async function requestAppShellCache(urls: string[]) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!isBrowserOnline()) return
  const unique = [...new Set(urls.filter(Boolean))]
  if (unique.length === 0) return
  try {
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage({ type: 'CACHE_APP_SHELL', urls: unique })
  } catch {
    // Service worker may be disabled in development.
  }
}
