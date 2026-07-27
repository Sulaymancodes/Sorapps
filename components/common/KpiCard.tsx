import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  change?: number
  changeLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel = 'vs last month',
  variant = 'default',
  className,
}: KpiCardProps) {
  const iconTone = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    error: 'bg-red-500/10 text-red-700 dark:text-red-400',
  }

  const isPositive = change !== undefined && change >= 0

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(16,41,29,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,41,29,0.08)]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {change !== undefined && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-xs font-medium',
                isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {Math.abs(change)}% {changeLabel}
            </p>
          )}
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconTone[variant])}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  )
}
