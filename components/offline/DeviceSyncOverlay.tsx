'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DeviceSyncPhase = 'idle' | 'running' | 'done' | 'error' | 'offline'

export type DeviceSyncView = {
  phase: DeviceSyncPhase
  percent: number
  label: string
  title?: string
  message?: string
}

function useSmoothPercent(target: number, active: boolean) {
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)

  useEffect(() => {
    if (!active) {
      shownRef.current = 0
      setShown(0)
      return
    }
    let frame = 0
    const step = () => {
      const current = shownRef.current
      const diff = target - current
      if (Math.abs(diff) < 0.35) {
        shownRef.current = target
        setShown(target)
        return
      }
      const next = current + diff * 0.16
      shownRef.current = next
      setShown(next)
      frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [active, target])

  return Math.round(Math.min(100, Math.max(0, shown)))
}

function ProgressRing({ percent, done }: { percent: number; done: boolean }) {
  const size = 148
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative mx-auto size-[148px]" aria-hidden>
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={done ? 'stroke-emerald-500' : 'stroke-primary'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <CheckCircle2 className="size-12 text-emerald-600" />
        ) : (
          <span className="font-display text-3xl font-semibold tabular-nums tracking-tight">
            {percent}
            <span className="text-lg text-muted-foreground">%</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function DeviceSyncOverlay({
  state,
  onDismiss,
}: {
  state: DeviceSyncView
  onDismiss: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const running = state.phase === 'running'
  const percent = useSmoothPercent(running ? state.percent : state.phase === 'idle' ? 0 : 100, running)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (state.phase === 'idle') return

    const main = document.querySelector('main')
    const previous = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
      main: main instanceof HTMLElement ? main.style.overflow : '',
    }

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    if (main instanceof HTMLElement) main.style.overflow = 'hidden'

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !running) onDismiss()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = previous.html
      document.body.style.overflow = previous.body
      if (main instanceof HTMLElement) main.style.overflow = previous.main
    }
  }, [onDismiss, running, state.phase])

  if (!mounted || state.phase === 'idle') return null

  const terminal = state.phase !== 'running'
  const Icon =
    state.phase === 'offline' ? WifiOff : state.phase === 'error' ? RefreshCw : CheckCircle2

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-none bg-black/55 p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[2px] md:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-sync-title"
      aria-busy={running}
      onClick={() => {
        if (!running) onDismiss()
      }}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        {running ? (
          <>
            <ProgressRing percent={percent} done={false} />
            <h2
              id="device-sync-title"
              className="mt-5 text-center font-display text-xl font-semibold tracking-tight"
            >
              Syncing this phone
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">{state.label}</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${percent} percent`}
              />
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This usually takes a moment. You can wait here — there is no rush.
            </p>
          </>
        ) : (
          <>
            <div
              className={cn(
                'mx-auto flex size-16 items-center justify-center rounded-full',
                state.phase === 'done'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : state.phase === 'offline'
                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                    : 'bg-primary/10 text-primary'
              )}
            >
              {state.phase === 'done' ? (
                <CheckCircle2 className="size-8" />
              ) : (
                <Icon className="size-8" />
              )}
            </div>
            {state.phase === 'done' && (
              <p className="mt-3 text-center font-display text-4xl font-semibold tabular-nums tracking-tight">
                100
                <span className="text-xl text-muted-foreground">%</span>
              </p>
            )}
            <h2
              id="device-sync-title"
              className="mt-3 text-center font-display text-xl font-semibold tracking-tight"
            >
              {state.title}
            </h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              {state.message}
            </p>
            {terminal && (
              <Button type="button" className="mt-6 w-full" onClick={onDismiss}>
                Continue
              </Button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
