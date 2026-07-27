import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/AuthShell'
import { getSession } from '@/lib/auth-server'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    redirect('/dashboard')
  }

  return (
    <AuthShell
      title="Sorapps"
      subtitle="Sign in to your solar CRM workspace"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted/50" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
