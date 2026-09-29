'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancelRef.current()
    }

    const main = document.querySelector('main')
    const previous = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
      main: main instanceof HTMLElement ? main.style.overflow : '',
    }

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    if (main instanceof HTMLElement) main.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = previous.html
      document.body.style.overflow = previous.body
      if (main instanceof HTMLElement) main.style.overflow = previous.main
    }
  }, [open, pending])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-none bg-black/55 p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[2px] md:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!pending) onCancel()
      }}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <div>
              <h2 id="confirm-modal-title" className="font-display text-lg font-semibold">
                {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
