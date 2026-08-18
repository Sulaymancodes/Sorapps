import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

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
  if (session.user.role !== 'admin') {
    throw new Error('Admin access required')
  }
  return session
}
