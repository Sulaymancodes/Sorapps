import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  children: ReactNode
  className?: string
  title?: string
  description?: string
  action?: ReactNode
  padded?: boolean
}

export function Panel({
  children,
  className,
  title,
  description,
  action,
  padded = true,
}: PanelProps) {
  return (
    <section className={cn('surface-panel overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  )
}
