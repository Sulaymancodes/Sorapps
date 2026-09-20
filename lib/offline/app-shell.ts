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

export function persistSessionUser(user: {
  name?: string | null
  email?: string | null
  role?: string | null
  image?: string | null
  assignedState?: string | null
  assignedLga?: string | null
}) {
  if (!user.email || !user.name) return
  saveCachedDashboardUser({
    name: user.name,
    email: user.email,
    role: user.role,
    image: user.image,
    assignedState: user.assignedState,
    assignedLga: user.assignedLga,
  })
}

export function offlineFallbackPath(pathname: string) {
  if (pathname.startsWith('/sales/new')) return '/~offline#sale'
  if (pathname.startsWith('/customers/new')) return '/~offline#customer'
  if (pathname.includes('/drafts')) return '/~offline#drafts'
  if (pathname === '/~offline' || pathname.startsWith('/login')) return pathname
  return '/~offline'
}

export type OfflineFieldView = 'home' | 'sale' | 'customer' | 'drafts'

export function offlineViewFromLocation(pathname: string, search = '', hash = ''): OfflineFieldView {
  const fromHash = hash.replace(/^#/, '')
  if (fromHash === 'sale' || fromHash === 'customer' || fromHash === 'drafts') return fromHash

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const fromQuery = params.get('view')
  if (fromQuery === 'sale' || fromQuery === 'customer' || fromQuery === 'drafts') return fromQuery

  if (pathname.startsWith('/sales/new')) return 'sale'
  if (pathname.startsWith('/customers/new')) return 'customer'
  if (pathname.includes('/drafts')) return 'drafts'
  return 'home'
}

export function stayOnCachedOfflineShell(pathname: string, search = '', hash = '') {
  if (typeof window === 'undefined') return false
  if (window.location.pathname !== '/~offline') return false

  const view = offlineViewFromLocation(pathname, search, hash)
  const next = view === 'home' ? '' : view
  const current = window.location.hash.replace(/^#/, '')
  if (current === next) return true
  window.location.hash = next
  return true
}

export async function findCachedAppPath(preferred?: string | null) {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return null
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
    '/~offline',
  ].filter((path): path is string => Boolean(path))

  for (const path of [...new Set(candidates)]) {
    const url = new URL(path, window.location.origin).toString()
    const match = await caches.match(url, { ignoreSearch: true })
    if (match?.ok) return path
  }

  return null
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
