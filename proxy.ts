import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const AUTH_COOKIE_NAMES = [
  'better-auth.session_token',
  'better-auth.session_data',
  '__Secure-better-auth.session_token',
  '__Secure-better-auth.session_data',
]

function clearAuthCookies(response: NextResponse) {
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionCookie = getSessionCookie(request)

  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/invoices') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/products') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/warranty') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/settings')

  // Cookie presence is optimistic only — do NOT bounce /login|/signup → /dashboard
  // based on a cookie alone (stale cookies cause an infinite 307 loop).
  if (isProtected && !sessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return clearAuthCookies(NextResponse.redirect(loginUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/customers/:path*',
    '/sales/:path*',
    '/invoices/:path*',
    '/payments/:path*',
    '/products/:path*',
    '/inventory/:path*',
    '/warranty/:path*',
    '/reports/:path*',
    '/calendar/:path*',
    '/settings/:path*',
  ],
}
