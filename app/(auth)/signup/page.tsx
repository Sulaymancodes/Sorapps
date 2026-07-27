import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { getSession } from '@/lib/auth-server'
import { SignupForm } from './signup-form'

export default async function SignupPage() {
  const session = await getSession()
  if (session) {
    redirect('/dashboard')
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Join your team's Sorapps CRM workspace"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  )
}
