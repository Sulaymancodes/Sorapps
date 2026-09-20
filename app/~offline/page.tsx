'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, WifiOff } from 'lucide-react'
import { DashboardOfflineShell } from '@/components/offline/DashboardOfflineShell'
import {
  OfflineFieldHome,
  type OfflineFieldView,
} from '@/components/offline/OfflineFieldHome'
import {
  findCachedAppPath,
  hardNavigate,
  homePathForUser,
  loadCachedDashboardUser,
} from '@/lib/offline/app-shell'
import { isBrowserOnline } from '@/lib/offline/network'

function parseView(value: string | null): OfflineFieldView {
  if (value === 'sale' || value === 'customer' || value === 'drafts') return value
  return 'home'
}

function OfflinePageInner() {
  const searchParams = useSearchParams()
  const view = parseView(searchParams.get('view'))
  const [status, setStatus] = useState<'checking' | 'workspace' | 'signed-out'>('checking')

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const user = loadCachedDashboardUser()
      const online = isBrowserOnline()

      if (online && view === 'home') {
        const dest = user
          ? (await findCachedAppPath(homePathForUser(user))) || homePathForUser(user)
          : '/login'
        if (!cancelled) hardNavigate(dest, true)
        return
      }

      if (cancelled) return
      setStatus(user ? 'workspace' : 'signed-out')
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [view])

  if (status === 'checking') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Opening your saved workspace…</p>
      </main>
    )
  }

  if (status === 'signed-out') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <WifiOff className="size-8" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          Sign in once while online
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          After one successful sign-in, this phone keeps your session and field pages so you can add
          sales and customers without internet.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Open login
        </Link>
      </main>
    )
  }

  const user = loadCachedDashboardUser()
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
          After one successful sign-in, this phone keeps your session and field pages so you can add
          sales and customers without internet.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Open login
        </Link>
      </main>
    )
  }

  return (
    <DashboardOfflineShell>
      <OfflineFieldHome view={view} user={user} />
    </DashboardOfflineShell>
  )
}

export default function OfflinePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
          Opening your saved workspace…
        </main>
      }
    >
      <OfflinePageInner />
    </Suspense>
  )
}
