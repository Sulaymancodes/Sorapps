import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'

/** Public registration is disabled — admins create agents from Settings. */
export default async function SignupPage() {
  const session = await getSession()
  if (session) {
    redirect(session.user.role === 'admin' ? '/dashboard' : '/sales')
  }
  redirect('/login?notice=registration_disabled')
}
