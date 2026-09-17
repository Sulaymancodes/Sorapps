import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <AuthShell
      title="Sorapps"
      subtitle="Sign in to your solar CRM workspace"
      footer={
        <span className="text-muted-foreground">
          Accounts are created by an admin — contact your supervisor for access.
        </span>
      }
    >
      <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted/50" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
