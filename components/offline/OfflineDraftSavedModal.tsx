'use client'

import Link from 'next/link'
import { CloudOff, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function OfflineDraftSavedModal({
  title = 'No network',
  message = 'This sale was saved as a draft on this device, including customer details, KYC, site photo, and GPS. It will sync automatically when you reconnect, or tap Sync now in the header.',
  draftsHref = '/sales/drafts',
  onClose,
}: {
  title?: string
  message?: string
  draftsHref?: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-draft-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
              <CloudOff className="size-5" />
            </div>
            <div>
              <h2 id="offline-draft-title" className="font-display text-lg font-semibold">
                {title}
              </h2>
              <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                Data saved to draft
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{message}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onClose}>Continue</Button>
          <Link href={draftsHref} className={cn(buttonVariants({ variant: 'outline' }))}>
            View drafts
          </Link>
        </div>
      </div>
    </div>
  )
}
