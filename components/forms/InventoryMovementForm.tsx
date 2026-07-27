'use client'

import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/common/Panel'
import { INVENTORY_MOVEMENT_TYPES } from '@/lib/constants/options'
import { useCrmStore } from '@/lib/store/crm-store'
import { InventoryMovement } from '@/data/mockData'
import { formatCurrency } from '@/lib/utils/formatting'

type InventoryFormValues = {
  product_id: string
  type: InventoryMovement['type']
  quantity: number
  reference: string
  notes: string
}

interface InventoryMovementFormProps {
  defaultProductId?: string
}

export function InventoryMovementForm({ defaultProductId = '' }: InventoryMovementFormProps) {
  const router = useRouter()
  const products = useCrmStore((s) => s.products)
  const recordInventoryMovement = useCrmStore((s) => s.recordInventoryMovement)

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  )

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InventoryFormValues>({
    defaultValues: {
      product_id: defaultProductId,
      type: 'in',
      quantity: 1,
      reference: '',
      notes: '',
    },
  })

  const productId = useWatch({ control, name: 'product_id' })
  const type = useWatch({ control, name: 'type' })
  const quantity = Number(useWatch({ control, name: 'quantity' }) || 0)

  const selectedProduct = products.find((p) => p.id === productId)
  const previewStock = useMemo(() => {
    if (!selectedProduct) return null
    if (type === 'in') return selectedProduct.stock + Math.max(0, quantity)
    if (type === 'out') return Math.max(0, selectedProduct.stock - Math.max(0, quantity))
    return Math.max(0, quantity)
  }, [selectedProduct, type, quantity])

  const onSubmit = (values: InventoryFormValues) => {
    if (!values.product_id) {
      setError('product_id', { message: 'Select a product' })
      return
    }
    if (values.type !== 'adjustment' && (!values.quantity || values.quantity <= 0)) {
      setError('quantity', { message: 'Enter a quantity greater than zero' })
      return
    }
    if (values.type === 'adjustment' && values.quantity < 0) {
      setError('quantity', { message: 'Stock cannot be negative' })
      return
    }

    try {
      const { product } = recordInventoryMovement({
        product_id: values.product_id,
        type: values.type,
        quantity: Number(values.quantity) || 0,
        reference: values.reference,
        notes: values.notes,
      })
      router.push(`/inventory?updated=${product.id}`)
    } catch (err) {
      setError('quantity', {
        message: err instanceof Error ? err.message : 'Could not record movement',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Stock movement" description="Record stock in, stock out, or set absolute quantity">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="product_id">Product</Label>
            <Select id="product_id" {...register('product_id')}>
              <option value="">Select product…</option>
              {sortedProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — stock {product.stock} {product.unit}
                </option>
              ))}
            </Select>
            {errors.product_id && (
              <p className="mt-1 text-xs text-destructive">{errors.product_id.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="type">Movement type</Label>
            <Select id="type" {...register('type')}>
              {INVENTORY_MOVEMENT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="quantity">
              {type === 'adjustment' ? 'New stock quantity' : 'Quantity'}
            </Label>
            <Input
              id="quantity"
              type="number"
              min={0}
              step={1}
              {...register('quantity', { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p className="mt-1 text-xs text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              placeholder="PO number, delivery note, etc."
              {...register('reference')}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Optional notes…" {...register('notes')} />
          </div>
        </div>

        {selectedProduct && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-secondary/40 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current stock
              </p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums">
                {selectedProduct.stock} {selectedProduct.unit}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/40 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                After movement
              </p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums text-primary">
                {previewStock} {selectedProduct.unit}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/40 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Stock value after
              </p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums">
                {formatCurrency(selectedProduct.cost * (previewStock || 0))}
              </p>
            </div>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting}>
          Record movement
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/inventory')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
