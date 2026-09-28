'use client'

import { useMemo, useState, useTransition } from 'react'
import { FileSpreadsheet, FileText, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import { unlockDeviceAction } from '@/app/actions/unlocks'
import { toDateInputValue, todayInLagos } from '@/lib/paygo/schedule'
import { downloadExcelTable, downloadPdfTable } from '@/lib/utils/export'
import { formatDateTime } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'

const PARTIAL_DAYS = [7, 30, 60, 90, 180, 360] as const

type UnlockRow = {
  id: string
  serial_number: string
  kind: 'partial' | 'full'
  day_token: string
  pin: string
  source: 'unlock' | 'activation'
  created_at: string
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
  const [days, setDays] = useState<(typeof PARTIAL_DAYS)[number]>(30)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<UnlockRow | null>(null)
  const [rows, setRows] = useState(history)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const displayed = useMemo(() => {
    const sn = serial.trim().toLowerCase()
    if (sn) {
      const match = [latest, ...rows].find(
        (row) => row && row.serial_number.trim().toLowerCase() === sn
      )
      return match ?? null
    }
    return latest ?? rows[0] ?? null
  }, [serial, latest, rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const start = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom
    const end = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo

    return rows.filter((row) => {
      const day = lagosDay(row.created_at)
      if (start && day < start) return false
      if (end && day > end) return false
      if (!q) return true
      return [
        row.serial_number,
        row.pin,
        row.kind,
        typeLabel(row),
        row.day_token,
        sourceLabel(row.source),
      ].some((value) => String(value || '').toLowerCase().includes(q))
    })
  }, [rows, search, dateFrom, dateTo])

  const rangeLabel = useMemo(() => {
    if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`
    if (dateFrom) return `from ${dateFrom}`
    if (dateTo) return `through ${dateTo}`
    return 'all dates'
  }, [dateFrom, dateTo])

  function runUnlock(kind: 'partial' | 'full') {
    setError(null)
    startTransition(async () => {
      const result = await unlockDeviceAction({
        serial_number: serial,
        kind,
        validity_days: kind === 'partial' ? days : undefined,
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
        created_at:
          typeof result.data.created_at === 'string'
            ? result.data.created_at
            : result.data.created_at.toISOString(),
      }
      setLatest(row)
      setRows((current) => [row, ...current.filter((item) => item.id !== row.id)])
    })
  }

  function exportExcel() {
    downloadExcelTable(
      exportFilename(dateFrom, dateTo, 'xls'),
      'Device PINs',
      ['When', 'Serial', 'Type', 'Source', 'PIN'],
      exportRows(filteredRows)
    )
  }

  function exportPdf() {
    downloadPdfTable(
      exportFilename(dateFrom, dateTo, 'pdf'),
      'Sorapps device PINs',
      `${filteredRows.length} PIN${filteredRows.length === 1 ? '' : 's'} · ${rangeLabel}`,
      ['When', 'Serial', 'Type', 'Source', 'PIN'],
      exportRows(filteredRows)
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Unlock"
        description="Enter a serial number to unlock a unit. Partial uses a time PIN. Full unlocks the device permanently."
      />

      {!beebeeConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          BeeBeeJump is not configured. Set the live API keys before unlocking a unit.
        </div>
      )}

      {displayed && (
        <Panel title="Device PIN">
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              {sourceLabel(displayed.source)} · {typeLabel(displayed)} · {displayed.serial_number}
            </p>
            <p className="mt-2 break-all font-mono text-3xl font-semibold tracking-[0.18em] text-primary">
              {displayed.pin}
            </p>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Panel title="Unlock a unit" description="No customer form. Serial in, PIN out.">
          <div className="space-y-4">
            <div>
              <Label htmlFor="serial">Serial number</Label>
              <Input
                id="serial"
                value={serial}
                onChange={(event) => setSerial(event.target.value)}
                placeholder="e.g. 01-61-00000001"
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-1.5 font-mono"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Partial period</p>
              <div className="flex flex-wrap gap-2">
                {PARTIAL_DAYS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDays(value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      days === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {value} days
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending || !serial.trim()}
                onClick={() => runUnlock('partial')}
              >
                {pending ? 'Unlocking…' : 'Partial unlock'}
              </Button>
              <Button
                type="button"
                disabled={pending || !serial.trim()}
                onClick={() => runUnlock('full')}
              >
                {pending ? 'Unlocking…' : 'Full unlock'}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Your PIN history" description="Activation and unlock PINs from this account" padded={false}>
          {rows.length > 0 && (
            <div className="space-y-3 border-b border-border/70 px-4 py-3">
              <SearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search serial, PIN, or type"
                aria-label="Search PIN history"
              />
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
                Create a sale or unlock a serial to see the device PIN here.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium">No matching PINs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another serial, PIN, type, or date range.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/70 bg-secondary/40">
                    {['When', 'Serial', 'Type', 'Source', 'PIN'].map((heading) => (
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
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDateTime(new Date(row.created_at))}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{row.serial_number}</td>
                      <td className="px-4 py-3 text-sm">{typeLabel(row)}</td>
                      <td className="px-4 py-3 text-sm">{sourceLabel(row.source)}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold tracking-wide">
                        {row.pin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
