'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import {
  findCachedAppPath,
  hardNavigate,
  homePathForUser,
  isSameOriginAppPath,
  loadCachedDashboardUser,
  persistSessionUser,
  requestAppShellCache,
  offlineRoutesForUser,
  PUBLIC_OFFLINE_ROUTES,
  type CachedDashboardUser,
} from '@/lib/offline/app-shell'
import { isBrowserOnline } from '@/lib/offline/network'

function destinationFor(user: CachedDashboardUser | null, next: string) {
  if (next && isSameOriginAppPath(next)) return next
  return homePathForUser(user)
}

async function openSavedWorkspace(user: CachedDashboardUser, next: string) {
  persistSessionUser(user)
  const dest = await findCachedAppPath(destinationFor(user, next))
  hardNavigate(dest || '/~offline', true)
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || ''
  const notice = searchParams.get('notice')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [savedUser, setSavedUser] = useState<CachedDashboardUser | null>(null)

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const cached = loadCachedDashboardUser()
      const online = isBrowserOnline()

      let sessionFailed = false
      if (online) {
        try {
          const { data } = await Promise.race([
            authClient.getSession(),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('session-timeout')), 4000)
            }),
          ])
          if (cancelled) return
          if (data?.user) {
            const sessionUser = {
              name: data.user.name,
              email: data.user.email,
              role: (data.user as { role?: string | null }).role,
              image: data.user.image,
              assignedState: (data.user as { assignedState?: string | null }).assignedState,
              assignedLga: (data.user as { assignedLga?: string | null }).assignedLga,
            }
            persistSessionUser(sessionUser)
            void requestAppShellCache([
              ...offlineRoutesForUser(sessionUser),
              ...PUBLIC_OFFLINE_ROUTES,
            ])
            hardNavigate(destinationFor(sessionUser, next), true)
            return
          }
        } catch {
          sessionFailed = true
        }
      }

      if (cancelled) return

      if (cached && (!online || sessionFailed || !isBrowserOnline())) {
        setRestoring(true)
        await openSavedWorkspace(cached, next)
        return
      }

      setSavedUser(cached)
      if (cached?.email && !email) setEmail(cached.email)
      setRestoring(false)
    }

    void restore()
    return () => {
      cancelled = true
    }
    // Intentionally run once on mount for this login URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function continueSavedSession() {
    const cached = savedUser || loadCachedDashboardUser()
    if (!cached) return
    setError(null)
    setLoading(true)
    await openSavedWorkspace(cached, next)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const cached = loadCachedDashboardUser()
    if (!isBrowserOnline()) {
      if (cached && cached.email.toLowerCase() === email.trim().toLowerCase()) {
        await openSavedWorkspace(cached, next)
        return
      }
      setLoading(false)
      setError(
        cached
          ? `This device is saved for ${cached.email}. Use that account, or sign in once while online to switch.`
          : 'Sign in once while online so this device can open Sorapps without a connection.'
      )
      return
    }

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })

    if (signInError) {
      setLoading(false)
      setError(signInError.message || 'Invalid email or password')
      return
    }

    const { data } = await authClient.getSession()
    const sessionUser = data?.user
      ? {
          name: data.user.name,
          email: data.user.email,
          role: (data.user as { role?: string | null }).role,
          image: data.user.image,
          assignedState: (data.user as { assignedState?: string | null }).assignedState,
          assignedLga: (data.user as { assignedLga?: string | null }).assignedLga,
        }
      : null
    if (sessionUser) persistSessionUser(sessionUser)
    void requestAppShellCache([
      ...offlineRoutesForUser(sessionUser),
      ...PUBLIC_OFFLINE_ROUTES,
    ])
    hardNavigate(destinationFor(sessionUser, next), true)
  }

  if (restoring) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        Opening your saved workspace…
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {notice === 'registration_disabled' && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          Public registration is closed. Ask an admin to create your agent account.
        </p>
      )}
      {savedUser && (
        <div className="rounded-lg border border-border bg-secondary/40 px-3 py-3">
          <p className="text-sm text-muted-foreground">
            This device already has a session for{' '}
            <span className="font-medium text-foreground">{savedUser.name}</span>.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-10 w-full"
            disabled={loading}
            onClick={() => void continueSavedSession()}
          >
            Continue as {savedUser.name}
          </Button>
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="mt-1.5 h-11 rounded-lg border-border/80"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mt-1.5 h-11 rounded-lg border-border/80"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="h-11 w-full gap-2 text-sm">
        {loading && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  )
}
