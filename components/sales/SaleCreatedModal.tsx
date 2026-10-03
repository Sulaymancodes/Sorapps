'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SaleCreatedModal({
  saleId,
  invoiceId,
  unlockPin,
  showFinanceLinks = true,
}: {
  saleId: string
  invoiceId?: string | null
  unlockPin?: string | null
  showFinanceLinks?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setOpen(true)
  }, [saleId])

  useEffect(() => {
    if (!open) return

    const main = document.querySelector('main')
    const previous = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
      main: main instanceof HTMLElement ? main.style.overflow : '',
    }

    window.scrollTo({ top: 0, left: 0 })
    main?.scrollTo({ top: 0, left: 0 })

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    if (main instanceof HTMLElement) main.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previous.html
      document.body.style.overflow = previous.body
      if (main instanceof HTMLElement) main.style.overflow = previous.main
    }
  }, [open, saleId])

  function dismiss() {
    setOpen(false)
    router.replace('/sales')
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-none bg-black/55 p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[2px] md:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-created-title"
      onClick={dismiss}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h2 id="sale-created-title" className="font-display text-lg font-semibold">
                Sale created successfully
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{saleId}</span>
                {invoiceId ? (
                  <>
                    {' '}
                    · Invoice <span className="font-medium text-foreground">{invoiceId}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Inventory was updated automatically
          {invoiceId ? ', and the invoice is ready.' : '.'}
        </p>
        {unlockPin ? (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Your unlock PIN is</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-primary">
              {unlockPin}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter this PIN on the unit. It is also saved on the sale.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={dismiss}>Continue</Button>
          {showFinanceLinks ? (
            <>
          <Link
            href="/invoices"
            onClick={dismiss}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            View invoices
          </Link>
          <Link
            href="/payments"
            onClick={dismiss}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Record payment
          </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
