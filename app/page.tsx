import { redirect } from 'next/navigation'
import { getSession, getSessionAccess } from '@/lib/auth-server'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const access = getSessionAccess(session)
  redirect(access.isAdmin ? '/dashboard' : '/sales')
}
