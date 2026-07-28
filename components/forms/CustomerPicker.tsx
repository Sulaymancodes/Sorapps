'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer } from '@/lib/types/crm'

export function CustomerPicker({
  customers,
  value,
  onChange,
  error,
}: {
  customers: Customer[]
  value: string
  onChange: (customerId: string) => void
  error?: string
}) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = useMemo(
    () => customers.find((c) => c.id === value) ?? null,
    [customers, value]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    )
  }, [customers, query])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  function selectCustomer(customer: Customer) {
    onChange(customer.id)
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
      selectCustomer(filtered[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {selected && !open ? (
        <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {selected.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {selected.name} — {selected.city}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setQuery('')
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Change customer"
          >
            <ChevronsUpDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear customer"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search by name, email, phone, or city…"
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              error && 'border-destructive'
            )}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
          />
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl"
        >
          {customers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No customers yet — add one first
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.map((customer, index) => {
                const active = index === activeIndex
                const isSelected = customer.id === value
                return (
                  <li key={customer.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-muted' : 'hover:bg-muted/70'
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCustomer(customer)}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {customer.name[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{customer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {customer.city}, {customer.state} · {customer.phone}
                        </span>
                      </span>
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
