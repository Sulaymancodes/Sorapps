'use client'

import { useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, CreditCard, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/common/Panel'
import { CustomerPicker } from '@/components/forms/CustomerPicker'
import { INSTALLMENT_WEEK_OPTIONS, VAT_RATE } from '@/lib/constants/options'
import { createSaleAction } from '@/app/actions/sales'
import { formatCurrency } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'
import type { Customer, PaymentType, Product } from '@/lib/types/crm'

type SaleFormValues = {
  customer_id: string
  payment_type: PaymentType
  installment_weeks: number
  discount_percent: number
  transport_cost: number
  notes: string
  items: { product_id: string; quantity: number }[]
}

export function SaleForm({
  customers,
  products,
}: {
  customers: Customer[]
  products: Product[]
}) {
  const router = useRouter()

  const inStockProducts = useMemo(
    () => products.filter((p) => p.stock > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    defaultValues: {
      customer_id: '',
      payment_type: 'full',
      installment_weeks: 4,
      discount_percent: 0,
      transport_cost: 0,
      notes: '',
      items: [{ product_id: '', quantity: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const paymentType = useWatch({ control, name: 'payment_type' })
  const installmentWeeks = useWatch({ control, name: 'installment_weeks' })
  const customerId = useWatch({ control, name: 'customer_id' })
  const watchedItems = useWatch({ control, name: 'items' })
  const discountPercent = useWatch({ control, name: 'discount_percent' }) || 0
  const transportCost = useWatch({ control, name: 'transport_cost' }) || 0

  const totals = useMemo(() => {
    const subtotal = (watchedItems || []).reduce((sum, line) => {
      const product = products.find((p) => p.id === line.product_id)
      const qty = Number(line.quantity) || 0
      return sum + (product?.price || 0) * qty
    }, 0)
    const discountAmount = (subtotal * Number(discountPercent || 0)) / 100
    const afterDiscount = subtotal - discountAmount
    const vat = Math.round(afterDiscount * VAT_RATE)
    const transport = Math.max(0, Number(transportCost) || 0)
    const total = Math.round(afterDiscount + vat + transport)
    return { subtotal, discountAmount, vat, transport, total }
  }, [watchedItems, discountPercent, transportCost, products])

  const onSubmit = async (values: SaleFormValues) => {
    if (!values.customer_id) {
      setError('customer_id', { message: 'Select a customer' })
      return
    }
    if (!values.items.some((item) => item.product_id && item.quantity > 0)) {
      setError('items', { message: 'Add at least one product line' })
      return
    }
    if (values.payment_type === 'installment' && !values.installment_weeks) {
      setError('installment_weeks', { message: 'Choose how many weeks' })
      return
    }

    if (customers.length === 0) {
      setError('customer_id', { message: 'Add a customer before creating a sale' })
      return
    }
    if (inStockProducts.length === 0) {
      setError('items', { message: 'Add products with stock before creating a sale' })
      return
    }

    const qtyByProduct = new Map<string, number>()
    values.items
      .filter((item) => item.product_id)
      .forEach((item) => {
        const qty = Number(item.quantity) || 1
        qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + qty)
      })

    for (const [productId, qty] of qtyByProduct) {
      const product = products.find((p) => p.id === productId)
      if (product && product.stock < qty) {
        setError('items', {
          message: `Not enough stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
        })
        return
      }
    }

    const result = await createSaleAction({
      customer_id: values.customer_id,
      payment_type: values.payment_type,
      installment_weeks:
        values.payment_type === 'installment'
          ? (Number(values.installment_weeks) as 4 | 6 | 8 | 12)
          : undefined,
      discount_percent: Number(values.discount_percent) || 0,
      transport_cost: Number(values.transport_cost) || 0,
      notes: values.notes || '',
      items: values.items
        .filter((item) => item.product_id)
        .map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 1,
        })),
    })

    if (!result.success) {
      setError('items', { message: result.error })
      return
    }

    router.push(`/sales?created=${result.data.sale.id}&invoice=${result.data.invoice.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Customer & payment" description="Choose who is buying and how they will pay">
        <div className="space-y-5">
          <div>
            <Label>Customer</Label>
            <div className="mt-1.5">
              <CustomerPicker
                customers={customers}
                value={customerId || ''}
                onChange={(id) =>
                  setValue('customer_id', id, { shouldValidate: true, shouldDirty: true })
                }
                error={errors.customer_id?.message}
              />
            </div>
            <input type="hidden" {...register('customer_id')} />
          </div>

          <div>
            <Label>Payment type</Label>
            <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setValue('payment_type', 'full', { shouldValidate: true })}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  paymentType === 'full'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <CreditCard className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Full payment</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Customer pays the full invoice amount at once
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setValue('payment_type', 'installment', { shouldValidate: true })}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  paymentType === 'installment'
                    ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                    : 'border-border/80 hover:border-accent/40'
                )}
              >
                <CalendarClock className="mt-0.5 size-5 text-accent" />
                <div>
                  <p className="font-medium">Installment</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Spread payment across weekly timelines with reminders
                  </p>
                </div>
              </button>
            </div>
            <input type="hidden" {...register('payment_type')} />
          </div>

          {paymentType === 'installment' && (
            <div className="max-w-xs">
              <Label htmlFor="installment_weeks">Installment weeks</Label>
              <Select
                id="installment_weeks"
                {...register('installment_weeks', { valueAsNumber: true })}
              >
                {INSTALLMENT_WEEK_OPTIONS.map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {weeks} weeks
                  </option>
                ))}
              </Select>
              {errors.installment_weeks && (
                <p className="mt-1 text-xs text-destructive">{errors.installment_weeks.message}</p>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Products"
        description="Stock is subtracted automatically when this sale is saved"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => append({ product_id: '', quantity: 1 })}
          >
            <Plus className="size-3.5" />
            Add line
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 md:grid-cols-[1fr_120px_auto]"
            >
              <div>
                <Label htmlFor={`items.${index}.product_id`}>Product</Label>
                <Select id={`items.${index}.product_id`} {...register(`items.${index}.product_id`)}>
                  <option value="">Select product…</option>
                  {inStockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {formatCurrency(product.price)} (stock {product.stock}{' '}
                      {product.unit})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`items.${index}.quantity`}>Qty</Label>
                <Input
                  id={`items.${index}.quantity`}
                  type="number"
                  min={1}
                  {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => fields.length > 1 && remove(index)}
                disabled={fields.length === 1}
                aria-label="Remove line"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {errors.items && (
            <p className="text-xs text-destructive">
              {errors.items.message || 'Add at least one product line'}
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Charges & notes" description="VAT (7.5%) is calculated automatically">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="discount_percent">Discount (%)</Label>
            <Input
              id="discount_percent"
              type="number"
              min={0}
              max={100}
              step={0.5}
              {...register('discount_percent', { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="transport_cost">Transport cost (₦)</Label>
            <Input
              id="transport_cost"
              type="number"
              min={0}
              step={1000}
              {...register('transport_cost', { valueAsNumber: true })}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes for this sale…"
              {...register('notes')}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Invoice preview" description="An invoice is created automatically when you save">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Subtotal', value: formatCurrency(totals.subtotal) },
            { label: 'Discount', value: formatCurrency(totals.discountAmount) },
            { label: 'VAT (7.5%)', value: formatCurrency(totals.vat) },
            { label: 'Transport', value: formatCurrency(totals.transport) },
            { label: 'Total', value: formatCurrency(totals.total), emphasize: true },
          ].map((row) => (
            <div key={row.label} className="rounded-lg bg-secondary/40 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </p>
              <p
                className={cn(
                  'mt-1 font-display text-lg font-semibold tabular-nums',
                  row.emphasize && 'text-primary'
                )}
              >
                {row.value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Saving this sale will generate a matching invoice
          {paymentType === 'installment'
            ? ` and a ${installmentWeeks || 4}-week installment schedule with reminders.`
            : ' with a single full-payment due date.'}{' '}
          Product quantities are subtracted from inventory automatically.
        </p>
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting}>
          Create sale & invoice
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/sales')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
