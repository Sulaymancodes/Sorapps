'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || ''
  const notice = searchParams.get('notice')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message || 'Invalid email or password')
      return
    }

    // Land on home — it routes admin → dashboard, agent → sales
    router.push(next || '/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {notice === 'registration_disabled' && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          Public registration is closed. Ask an admin to create your agent account.
        </p>
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
