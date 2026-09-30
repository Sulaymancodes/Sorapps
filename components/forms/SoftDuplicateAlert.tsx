'use client'

import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DuplicateMatch } from '@/lib/services/customers'

export function SoftDuplicateAlert({
  matches,
  acknowledged,
  onAcknowledgeChange,
  className,
}: {
  matches: DuplicateMatch[]
  acknowledged?: boolean
  onAcknowledgeChange?: (next: boolean) => void
  className?: string
}) {
  if (!matches.length) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">Possible duplicate beneficiary</p>
          <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
            Soft match on name and related details — review before saving. Hard matches (phone,
            NIN, serial) still block save.
          </p>
          <ul className="space-y-2">
            {matches.slice(0, 5).map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-amber-500/25 bg-background/40 px-2.5 py-2 text-xs"
              >
                <p className="font-medium text-foreground">
                  {m.name}
                  {m.score != null ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      score {m.score}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {[m.phone, m.city, m.state, m.lga].filter(Boolean).join(' · ')}
                </p>
                {m.reasons?.length ? (
                  <p className="mt-1 text-amber-800 dark:text-amber-200">
                    {m.reasons.join(' · ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {onAcknowledgeChange && (
            <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 rounded border-amber-600"
                checked={Boolean(acknowledged)}
                onChange={(e) => onAcknowledgeChange(e.target.checked)}
              />
              <span>This is a different person — continue anyway</span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
