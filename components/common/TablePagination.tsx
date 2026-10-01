'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const TABLE_PAGE_SIZE = 25

export function usePagedList<T>(
  items: readonly T[],
  resetKey: string | number,
  pageSize = TABLE_PAGE_SIZE
) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const current = Math.min(Math.max(1, page), totalPages)
  const paged = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize]
  )

  return { page: current, setPage, paged, total, totalPages, pageSize }
}

export function TablePagination({
  page,
  total,
  pageSize = TABLE_PAGE_SIZE,
  onPageChange,
}: {
  page: number
  total: number
  pageSize?: number
  onPageChange: (page: number) => void
}) {
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
      <p className="text-xs text-muted-foreground">
        {from}–{to} of {total.toLocaleString()}
      </p>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
