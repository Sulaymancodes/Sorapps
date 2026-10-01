'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'No matches',
  error,
  id,
  disabled = false,
  onQueryChange,
}: {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  error?: string
  id?: string
  disabled?: boolean
  /** Fires as the user types (for remote option loading). */
  onQueryChange?: (query: string) => void
}) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = value || null

  const filtered = useMemo(() => {
    // Remote search: parent owns matching — don't re-filter labels locally
    if (onQueryChange) return [...options]
    const q = query.trim().toLowerCase()
    if (!q) return [...options]
    return options.filter((option) => option.toLowerCase().includes(q))
  }, [options, query, onQueryChange])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    onQueryChange?.(query)
  }, [query, open, onQueryChange])

  function selectOption(option: string) {
    onChange(option)
    setQuery('')
    setOpen(false)
  }

  function clearSelection() {
    onChange('')
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      selectOption(filtered[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', disabled && 'pointer-events-none opacity-70')}>
      {selected && !open ? (
        <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
          <p className="min-w-0 flex-1 truncate text-sm">{selected}</p>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(true)
                  setQuery('')
                  requestAnimationFrame(() => inputRef.current?.focus())
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Change selection"
              >
                <ChevronsUpDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            id={id}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => {
              if (!disabled) setOpen(true)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              error && 'border-destructive',
              disabled && 'cursor-not-allowed'
            )}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
          />
        </div>
      )}

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="relative z-20 mt-1.5 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {filtered.map((option, index) => {
                const active = index === activeIndex
                const isSelected = option === value
                return (
                  <li key={option} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/70'
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                    >
                      <span className="min-w-0 flex-1 truncate">{option}</span>
                      {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
