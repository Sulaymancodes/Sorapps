'use client'

import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { PageShell } from '@/components/common/PageShell'
import { Button } from '@/components/ui/button'
import { isBrowserOnline } from '@/lib/offline/network'

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const offline = !isBrowserOnline()

  return (
    <PageShell>
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <WifiOff className="size-7" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">
          {offline ? 'This page is not on the device yet' : 'This page could not be loaded'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {offline
            ? 'Pages you open while online are saved for offline use. Sales and customers can still be captured as drafts.'
            : 'The live CRM data source is unreachable. You can keep working from drafts and forms saved on this device.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/sales/new"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Add sale
          </Link>
          <Link
            href="/sales/drafts"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Open drafts
          </Link>
          <Link
            href="/customers/new"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Add customer
          </Link>
          {!offline && (
            <Button variant="ghost" onClick={() => reset()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  )
}
