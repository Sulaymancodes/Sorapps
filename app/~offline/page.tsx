import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <WifiOff className="size-8" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">You’re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Sorapps needs an internet connection for live CRM data. Reconnect to continue, or reopen
        pages you already visited.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Try dashboard
        </Link>
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          Go to login
        </Link>
      </div>
    </main>
  )
}
