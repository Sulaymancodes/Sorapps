'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, WifiOff } from 'lucide-react'
import {
  findCachedAppPath,
  hardNavigate,
  homePathForUser,
  loadCachedDashboardUser,
} from '@/lib/offline/app-shell'

export default function OfflinePage() {
  const [status, setStatus] = useState<'checking' | 'ready'>('checking')

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const user = loadCachedDashboardUser()
      if (user) {
        const dest = await findCachedAppPath(homePathForUser(user))
        if (cancelled) return
        if (dest) {
          hardNavigate(dest, true)
          return
        }
      }
      if (!cancelled) setStatus('ready')
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Opening your saved workspace…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <WifiOff className="size-8" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">You’re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Sign in once while online so this device can save your session and pages. After that you
        can open Sorapps and keep working without a connection.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Open login
        </Link>
        <Link
          href="/sales/new"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          Add sale
        </Link>
      </div>
    </main>
  )
}
