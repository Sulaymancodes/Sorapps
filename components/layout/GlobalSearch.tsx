'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Receipt, Search, ShoppingCart, Users, Loader2 } from 'lucide-react'
import { SearchField } from '@/components/common/SearchField'
import { searchCrmAction } from '@/app/actions/search'
import type { SearchResult, SearchResultType } from '@/lib/services/search'
import { cn } from '@/lib/utils'

const typeMeta: Record<
  SearchResultType,
  { label: string; icon: typeof Users }
> = {
  customer: { label: 'Customer', icon: Users },
  product: { label: 'Product', icon: Package },
  invoice: { label: 'Invoice', icon: Receipt },
  sale: { label: 'Sale', icon: ShoppingCart },
}

export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter()
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 1) {
      setResults([])
      setOpen(false)
      return
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const next = await searchCrmAction(trimmed)
        setResults(next)
        setOpen(true)
        setActiveIndex(0)
      })
    }, 220)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function goTo(result: SearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(result.href)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      goTo(results[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full max-w-md', className)}>
      <div className="relative">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim() && results.length > 0) setOpen(true)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search customers, invoices, products…"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
        />
        {pending && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl"
        >
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {pending ? 'Searching…' : `No results for “${query.trim()}”`}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((result, index) => {
                const meta = typeMeta[result.type]
                const Icon = meta.icon
                const active = index === activeIndex
                return (
                  <li key={`${result.type}-${result.id}`} role="option" aria-selected={active}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/70'
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => goTo(result)}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{result.title}</span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {meta.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </span>
                      <Search className="mt-1 size-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
