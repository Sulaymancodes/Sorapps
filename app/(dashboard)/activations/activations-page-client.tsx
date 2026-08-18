'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchField } from '@/components/common/SearchField'
import {
  resendActivationSmsAction,
  sendActivationSmsAction,
} from '@/app/actions/activations'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'

type CustomerOption = { id: string; name: string; phone: string; city: string }
type SaleOption = {
  id: string
  customer_id: string
  date: string
  total_amount: number
  status: string
}
type DeviceOption = {
  id: string
  customer_id: string
  sale_id: string
  serial_number: string
  product_name: string
}
type ActivationRow = {
  id: string
  code: string
  phone: string
  customer_id: string
  customer_name: string
  sale_id?: string
  warranty_id?: string
  device_serial: string
  message_body: string
  status: string
  validity_days: number
  expires_at: string
  provider_message_id?: string
  error_message?: string
  sent_at?: string
  created_at: string
}

function statusClass(status: string) {
  switch (status) {
    case 'sent':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'failed':
      return 'bg-red-500/15 text-red-700 dark:text-red-300'
    case 'pending':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function ActivationsPageClient({
  customers,
  sales,
  devices,
  activations,
  smsConfigured,
}: {
  customers: CustomerOption[]
  sales: SaleOption[]
  devices: DeviceOption[]
  activations: ActivationRow[]
  smsConfigured: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [saleId, setSaleId] = useState('')
  const [warrantyId, setWarrantyId] = useState('')
  const [deviceSerial, setDeviceSerial] = useState('')
  const [phone, setPhone] = useState('')
  const [validityDays, setValidityDays] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  const customerSales = useMemo(
    () =>
      sales
        .filter((s) => s.customer_id === customerId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sales, customerId]
  )

  const beneficiarySale = customerSales[0] ?? null

  const beneficiaryDevice = useMemo(() => {
    if (!customerId) return null
    const linked = devices.filter((d) => {
      if (d.customer_id !== customerId) return false
      if (beneficiarySale) return d.sale_id === beneficiarySale.id
      return true
    })
    return linked.find((d) => d.serial_number.trim()) || linked[0] || null
  }, [devices, customerId, beneficiarySale])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activations
    return activations.filter(
      (a) =>
        a.customer_name.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.code.includes(q) ||
        a.device_serial.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.sale_id || '').toLowerCase().includes(q)
    )
  }, [activations, search])

  function onCustomerChange(id: string) {
    setCustomerId(id)
    setError(null)
    setSuccess(null)

    if (!id) {
      setSaleId('')
      setWarrantyId('')
      setDeviceSerial('')
      setPhone('')
      return
    }

    const customer = customers.find((c) => c.id === id)
    setPhone(customer?.phone || '')

    const sale =
      sales
        .filter((s) => s.customer_id === id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    setSaleId(sale?.id || '')

    const linked = devices.filter((d) => {
      if (d.customer_id !== id) return false
      if (sale) return d.sale_id === sale.id
      return true
    })
    const device = linked.find((d) => d.serial_number.trim()) || linked[0] || null
    setWarrantyId(device?.id || '')
    setDeviceSerial(device?.serial_number || '')
  }

  function handleSend() {
    setError(null)
    setSuccess(null)
    if (!customerId) {
      setError('Select a customer')
      return
    }

    const resolvedSaleId = saleId || beneficiarySale?.id || undefined
    const resolvedWarrantyId = warrantyId || beneficiaryDevice?.id || undefined
    const resolvedSerial =
      deviceSerial.trim() || beneficiaryDevice?.serial_number || undefined

    startTransition(async () => {
      const result = await sendActivationSmsAction({
        customer_id: customerId,
        sale_id: resolvedSaleId,
        warranty_id: resolvedWarrantyId,
        device_serial: resolvedSerial,
        phone: phone || undefined,
        validity_days: validityDays,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      setSuccess(
        `Activation code sent to ${result.data.phone}. Code expires ${formatDate(
          new Date(result.data.expires_at)
        )}.`
      )
      router.refresh()
    })
  }

  function handleResend(id: string) {
    setError(null)
    setSuccess(null)
    setResendingId(id)
    startTransition(async () => {
      const result = await resendActivationSmsAction(id)
      setResendingId(null)
      if (!result.success) {
        setError(result.error)
        return
      }
      setSuccess(`New activation code resent to ${result.data.phone}.`)
      router.refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Device Activations"
        description="Generate activation codes and send confirmation SMS to beneficiaries via BulkSMS Nigeria"
      />

      {!smsConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          BULK_SMS_TOKEN is not set. Add it in .env.local / Vercel env vars before sending live
          SMS.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <Panel title="Send activation SMS" description="Creates a code and texts the customer">
          <div className="space-y-4">
            <div>
              <Label htmlFor="customer">Customer / beneficiary</Label>
              <Select
                id="customer"
                value={customerId}
                onChange={(e) => onCustomerChange(e.target.value)}
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </Select>
            </div>

            {customerId && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Populated from this beneficiary
                </p>
                <div className="grid gap-2 text-sm">
                  <div className="rounded-lg bg-background/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sale
                    </p>
                    <p className="mt-0.5 font-medium">
                      {beneficiarySale
                        ? `${beneficiarySale.id} · ${formatCurrency(beneficiarySale.total_amount)} · ${formatDate(new Date(beneficiarySale.date))}`
                        : 'No sale on record for this customer'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-background/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Device / warranty
                    </p>
                    <p className="mt-0.5 font-medium">
                      {beneficiaryDevice
                        ? `${beneficiaryDevice.product_name}${
                            beneficiaryDevice.serial_number
                              ? ` · ${beneficiaryDevice.serial_number}`
                              : ''
                          }`
                        : 'No device/warranty on record'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="serial">Device serial</Label>
              <Input
                id="serial"
                value={deviceSerial}
                onChange={(e) => setDeviceSerial(e.target.value)}
                placeholder={
                  customerId ? 'Filled from beneficiary warranty' : 'Select a customer first'
                }
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone (SMS destination)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0701… or 234701…"
              />
            </div>

            <div>
              <Label htmlFor="validity">Validity (days)</Label>
              <Input
                id="validity"
                type="number"
                min={1}
                max={365}
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value) || 30)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Default 30 days. PAYGO amount-based validity will plug in here next.
              </p>
            </div>

            <Button
              className="w-full gap-2"
              disabled={pending || !customerId}
              onClick={handleSend}
            >
              <Send className="size-4" />
              {pending ? 'Sending…' : 'Generate & send SMS'}
            </Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Activation history" description="Codes generated and SMS delivery status">
            <SearchField
              placeholder="Search by customer, phone, code, serial…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Panel>

          <Panel padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/70 bg-secondary/40">
                    {['Customer', 'Code', 'Phone', 'Device', 'Status', 'Sent', 'Action'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{row.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{row.id}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold tracking-wider">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 text-sm">{row.phone}</td>
                      <td className="px-4 py-3 text-sm">
                        {row.device_serial || '—'}
                        {row.sale_id && (
                          <p className="text-xs text-muted-foreground">{row.sale_id}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                            statusClass(row.status)
                          )}
                        >
                          {row.status}
                        </span>
                        {row.error_message && (
                          <p className="mt-1 max-w-[180px] truncate text-xs text-destructive">
                            {row.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.sent_at ? formatDateTime(new Date(row.sent_at)) : '—'}
                        <p>Expires {formatDate(new Date(row.expires_at))}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={pending && resendingId === row.id}
                          onClick={() => handleResend(row.id)}
                        >
                          <RefreshCw className="size-3" />
                          {resendingId === row.id ? 'Resending…' : 'Resend'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-6 py-16 text-center">
                <MessageSquare className="mx-auto mb-3 size-10 text-muted-foreground" />
                <p className="font-medium">No activation SMS yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send your first activation code from the form
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
