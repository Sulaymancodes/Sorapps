'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { AgentRouteGuard } from '@/components/layout/AgentRouteGuard'
import { loadCachedDashboardUser } from '@/lib/offline/app-shell'
import { isAgentRole } from '@/lib/roles'

export function DashboardOfflineShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(() => loadCachedDashboardUser())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(loadCachedDashboardUser())
    setReady(true)
  }, [])

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading saved session…
      </main>
    )
  }

  if (!user) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <WifiOff className="size-8" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          Sign in once while online
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          After one successful sign-in, this phone keeps your session so you can add sales and
          customers without internet.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Go to login
        </Link>
      </main>
    )
  }

  return (
    <DashboardShell user={user} reminders={[]}>
      <AgentRouteGuard isAgent={isAgentRole(user.role)}>{children}</AgentRouteGuard>
    </DashboardShell>
  )
}
