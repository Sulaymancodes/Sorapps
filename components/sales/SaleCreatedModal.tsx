'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SaleCreatedModal({
  saleId,
  invoiceId,
}: {
  saleId: string
  invoiceId?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    setOpen(true)
  }, [saleId])

  function dismiss() {
    setOpen(false)
    router.replace('/sales')
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-created-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
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

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={dismiss}>Continue</Button>
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
        </div>
      </div>
    </div>
  )
}
