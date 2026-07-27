'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/common/Panel'
import {
  PRODUCT_BRANDS,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from '@/lib/constants/options'
import {
  createProductAction,
  updateProductAction,
} from '@/app/actions/products'
import type { Product, ProductInput } from '@/lib/types/crm'
import { formatCurrency } from '@/lib/utils/formatting'

type ProductFormValues = ProductInput

interface ProductFormProps {
  product?: Product
  mode?: 'create' | 'edit'
}

export function ProductForm({ product, mode = 'create' }: ProductFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    defaultValues: {
      name: product?.name || '',
      sku: product?.sku || '',
      category: product?.category || '',
      brand: product?.brand || '',
      description: product?.description || '',
      price: product?.price || 0,
      cost: product?.cost || 0,
      stock: product?.stock ?? 0,
      unit: product?.unit || 'pcs',
    },
  })

  const price = Number(watch('price')) || 0
  const cost = Number(watch('cost')) || 0
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0

  const onSubmit = async (values: ProductFormValues) => {
    setFormError(null)
    if (!values.name.trim()) {
      setError('name', { message: 'Enter a product name' })
      return
    }
    if (!values.category.trim()) {
      setError('category', { message: 'Enter a category' })
      return
    }
    if (!values.brand.trim()) {
      setError('brand', { message: 'Enter a brand' })
      return
    }
    if (Number(values.price) < 0 || Number(values.cost) < 0) {
      setError('price', { message: 'Price and cost cannot be negative' })
      return
    }

    const payload: ProductInput = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category.trim(),
      brand: values.brand.trim(),
      description: values.description.trim(),
      price: Number(values.price) || 0,
      cost: Number(values.cost) || 0,
      stock: Math.max(0, Math.floor(Number(values.stock) || 0)),
      unit: values.unit,
    }

    const result =
      mode === 'edit' && product
        ? await updateProductAction(product.id, payload)
        : await createProductAction(payload)

    if (!result.success) {
      if (result.error.toLowerCase().includes('sku')) {
        setError('sku', { message: result.error })
      } else {
        setFormError(result.error)
      }
      return
    }

    if (mode === 'edit') {
      router.push('/products')
    } else {
      router.push(`/products?created=${result.data.id}`)
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Product details" description="Catalog information for this item">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" placeholder="e.g. SunPower 550W Mono Panel" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              placeholder={mode === 'create' ? 'Leave blank to auto-generate' : 'SKU code'}
              {...register('sku')}
            />
            {errors.sku && <p className="mt-1 text-xs text-destructive">{errors.sku.message}</p>}
          </div>

          <div>
            <Label htmlFor="unit">Unit</Label>
            <Select id="unit" {...register('unit')}>
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              list="product-categories"
              placeholder="e.g. Solar Panels"
              {...register('category')}
            />
            <datalist id="product-categories">
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {errors.category && (
              <p className="mt-1 text-xs text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              list="product-brands"
              placeholder="e.g. SunPower"
              {...register('brand')}
            />
            <datalist id="product-brands">
              {PRODUCT_BRANDS.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>
            {errors.brand && (
              <p className="mt-1 text-xs text-destructive">{errors.brand.message}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional product description…"
              {...register('description')}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Pricing & stock" description="Cost, selling price, and opening quantity">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="cost">Cost (₦)</Label>
            <Input
              id="cost"
              type="number"
              min={0}
              step={1000}
              {...register('cost', { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="price">Selling price (₦)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={1000}
              {...register('price', { valueAsNumber: true })}
            />
            {errors.price && <p className="mt-1 text-xs text-destructive">{errors.price.message}</p>}
          </div>
          <div>
            <Label htmlFor="stock">
              {mode === 'edit' ? 'Current stock' : 'Opening stock'}
            </Label>
            <Input
              id="stock"
              type="number"
              min={0}
              step={1}
              {...register('stock', { valueAsNumber: true })}
            />
            {mode === 'edit' && (
              <p className="mt-1 text-xs text-muted-foreground">
                Prefer Inventory → Stock movement for day-to-day changes
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-secondary/40 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Margin
            </p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums">
              {margin.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg bg-secondary/40 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Unit profit
            </p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums">
              {formatCurrency(Math.max(0, price - cost))}
            </p>
          </div>
        </div>
      </Panel>

      {formError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {mode === 'edit' ? 'Save changes' : 'Create product'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/products')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
