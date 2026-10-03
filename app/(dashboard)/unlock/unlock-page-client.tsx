'use client'

import { useMemo, useState, useTransition } from 'react'
import { FileSpreadsheet, FileText, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SerialBarcodeField } from '@/components/forms/SerialBarcodeField'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { TablePagination, usePagedList } from '@/components/common/TablePagination'
import { resolveUnlockPinAction } from '@/app/actions/unlocks'
import { refreshUnlockPoolSnapshot } from '@/lib/offline/sync-unlock-pool'
import { toDateInputValue, todayInLagos } from '@/lib/paygo/schedule'
import { downloadExcelTable, downloadPdfTable } from '@/lib/utils/export'
import { formatDateTime } from '@/lib/utils/formatting'
import { sameSerialKey } from '@/lib/utils/serial'
import { cn } from '@/lib/utils'

const PARTIAL_DAYS = [7, 30, 60, 90, 180, 360] as const

type UnlockRow = {
  id: string
  serial_number: string
  kind: 'partial' | 'full'
  day_token: string
  pin: string
  source: 'unlock' | 'activation'
  sale_id?: string
  created_at: string
}

function statusLabel(row: Pick<UnlockRow, 'sale_id'>) {
  return row.sale_id ? 'Sold' : 'Available'
}

function typeLabel(row: Pick<UnlockRow, 'kind' | 'day_token'>) {
  return row.kind === 'full' ? 'Full' : row.day_token.replace('Days', ' days')
}

function sourceLabel(source: UnlockRow['source']) {
  return source === 'activation' ? 'Activation' : 'Unlock'
}

function lagosDay(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function exportRows(rows: UnlockRow[]) {
  return rows.map((row) => [
    formatDateTime(new Date(row.created_at)),
    row.serial_number,
    typeLabel(row),
    sourceLabel(row.source),
    statusLabel(row),
    row.pin,
  ])
}

function exportFilename(from: string, to: string, ext: 'xls' | 'pdf') {
  const today = toDateInputValue(todayInLagos())
  const range = from && to ? `${from}-to-${to}` : from || to || today
  return `sorapps-pins-${range}.${ext}`
}

export function UnlockPageClient({
  history,
  beebeeConfigured,
}: {
  history: UnlockRow[]
  beebeeConfigured: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [serial, setSerial] = useState('')
  const [period, setPeriod] = useState<(typeof PARTIAL_DAYS)[number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<UnlockRow | null>(null)
  const [rows, setRows] = useState(history)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const displayed = useMemo(() => {
    const sn = serial.trim()
    if (!sn) return null
    return (
      [latest, ...rows].find((row) => row && sameSerialKey(row.serial_number, sn)) ?? null
    )
  }, [serial, latest, rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const start = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom
    const end = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo

    return rows.filter((row) => {
      const day = lagosDay(row.created_at)
      if (start && day < start) return false
      if (end && day > end) return false
      if (typeFilter === 'full' && row.kind !== 'full') return false
      if (typeFilter === 'partial' && row.kind !== 'partial') return false
      if (typeFilter && typeFilter !== 'full' && typeFilter !== 'partial') {
        if (row.kind !== 'partial' || typeLabel(row) !== typeFilter) return false
      }
      if (statusFilter === 'available' && row.sale_id) return false
      if (statusFilter === 'sold' && !row.sale_id) return false
      if (!q) return true
      return [
        row.serial_number,
        row.pin,
        row.kind,
        typeLabel(row),
        row.day_token,
        sourceLabel(row.source),
        statusLabel(row),
      ].some((value) => String(value || '').toLowerCase().includes(q))
    })
  }, [rows, search, dateFrom, dateTo, typeFilter, statusFilter])

  const { page, setPage, paged: pagedRows, total, totalPages } = usePagedList(
    filteredRows,
    `${search}|${dateFrom}|${dateTo}|${typeFilter}|${statusFilter}`
  )

  const rangeLabel = useMemo(() => {
    if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`
    if (dateFrom) return `from ${dateFrom}`
    if (dateTo) return `through ${dateTo}`
    return 'all dates'
  }, [dateFrom, dateTo])

  function runUnlock() {
    const kind = period ? 'partial' : 'full'
    setError(null)
    startTransition(async () => {
      const result = await resolveUnlockPinAction({
        serial_number: serial,
        kind,
        validity_days: period ?? undefined,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      const row: UnlockRow = {
        id: result.data.id,
        serial_number: result.data.serial_number,
        kind: result.data.kind,
        day_token: result.data.day_token,
        pin: result.data.pin,
        source: result.data.source ?? 'unlock',
        sale_id: result.data.sale_id || '',
        created_at:
          typeof result.data.created_at === 'string'
            ? result.data.created_at
            : result.data.created_at.toISOString(),
      }
      setLatest(row)
      setRows((current) => [row, ...current.filter((item) => item.id !== row.id)])
      setPage(1)
      void refreshUnlockPoolSnapshot()
    })
  }

  function exportExcel() {
    downloadExcelTable(
      exportFilename(dateFrom, dateTo, 'xls'),
      'Device PINs',
      ['When', 'Serial', 'Type', 'Source', 'Status', 'PIN'],
      exportRows(filteredRows)
    )
  }

  function exportPdf() {
    downloadPdfTable(
      exportFilename(dateFrom, dateTo, 'pdf'),
      'Sorapps device PINs',
      `${filteredRows.length} PIN${filteredRows.length === 1 ? '' : 's'} · ${rangeLabel}`,
      ['When', 'Serial', 'Type', 'Source', 'Status', 'PIN'],
      exportRows(filteredRows)
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Unlock"
        description="Enter a serial to get a device PIN. Unused PINs are shared with every agent until that unit is sold."
      />

      {!beebeeConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          BeeBeeJump is not configured. Set the live API keys before unlocking a unit.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Panel title="Unlock a unit" description="No customer form. Serial in, PIN out.">
          <div className="space-y-4">
            <SerialBarcodeField
              id="serial"
              value={serial}
              onChange={setSerial}
              placeholder="e.g. 01-61-00000001"
              inputClassName="font-mono"
            />

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={pending || !serial.trim()}
              onClick={runUnlock}
            >
              {pending ? 'Unlocking…' : period ? `Unlock · ${period} days` : 'Unlock'}
            </Button>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground/55 transition-colors hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
                Limited period
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PARTIAL_DAYS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod((current) => (current === value ? null : value))}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      period === value
                        ? 'border-foreground/30 bg-muted text-foreground'
                        : 'border-transparent text-muted-foreground/80 hover:border-border hover:text-foreground'
                    )}
                  >
                    {value}d
                  </button>
                ))}
              </div>
            </details>

            {displayed ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-4">
                <p className="text-sm text-muted-foreground">
                  PIN for {displayed.serial_number} · {typeLabel(displayed)}
                  {displayed.sale_id ? ' · Sold' : ' · Available'}
                </p>
                <p className="mt-2 break-all font-mono text-3xl font-semibold tracking-[0.18em] text-primary">
                  {displayed.pin}
                </p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Shared PIN pool" description="All agents see unused and sold PINs. Unused PINs download to this phone while you are online." padded={false}>
          {rows.length > 0 && (
            <div className="space-y-3 border-b border-border/70 px-4 py-3">
              <SearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search serial, PIN, or type"
                aria-label="Search PIN history"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pin-type" className="text-xs text-muted-foreground">
                    Unlock type
                  </Label>
                  <select
                    id="pin-type"
                    className="mt-1 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                  >
                    <option value="">All types</option>
                    <option value="full">Full</option>
                    <option value="partial">Partial</option>
                    {PARTIAL_DAYS.map((value) => (
                      <option key={value} value={`${value} days`}>
                        {value} days
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pin-status" className="text-xs text-muted-foreground">
                    Unlock status
                  </Label>
                  <select
                    id="pin-status"
                    className="mt-1 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[9.5rem] flex-1">
                  <Label htmlFor="pin-from" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="pin-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="mt-1 h-10"
                  />
                </div>
                <div className="min-w-[9.5rem] flex-1">
                  <Label htmlFor="pin-to" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <Input
                    id="pin-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="mt-1 h-10"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                    }}
                  >
                    Clear dates
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {filteredRows.length} PIN{filteredRows.length === 1 ? '' : 's'} · {rangeLabel}
                  {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!filteredRows.length}
                    onClick={exportExcel}
                  >
                    <FileSpreadsheet className="size-3.5" />
                    Excel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!filteredRows.length}
                    onClick={exportPdf}
                  >
                    <FileText className="size-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <KeyRound className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="font-medium">No PINs yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Unlock a serial to add it to the shared pool. Every agent can use unused PINs until
                a sale consumes them.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium">No matching PINs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another serial, PIN, type, status, or date range.
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/70 bg-secondary/40">
                    {['When', 'Serial', 'Type', 'Source', 'Status', 'PIN'].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateTime(new Date(row.created_at))}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{row.serial_number}</td>
                      <td className="px-4 py-3 text-sm">{typeLabel(row)}</td>
                      <td className="px-4 py-3 text-sm">{sourceLabel(row.source)}</td>
                      <td className="px-4 py-3 text-sm">
                        {row.sale_id ? (
                          <span className="text-muted-foreground">Sold</span>
                        ) : (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold tracking-wide">
                        {row.pin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > 0 && (
              <TablePagination page={page} total={total} onPageChange={setPage} />
            )}
            </>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
