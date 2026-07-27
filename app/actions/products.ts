'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import { createProduct, updateProduct } from '@/lib/services/products'
import type { Product } from '@/lib/types/crm'

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string(),
  category: z.string().min(1, 'Category is required'),
  brand: z.string().min(1, 'Brand is required'),
  description: z.string(),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  unit: z.string().min(1),
})

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createProductAction(
  input: z.infer<typeof productSchema>
): Promise<ActionResult<Product>> {
  await requireSession()
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const product = await createProduct(parsed.data)
    revalidatePath('/products')
    revalidatePath('/inventory')
    revalidatePath('/sales')
    revalidatePath('/dashboard')
    return { success: true, data: product }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create product',
    }
  }
}

export async function updateProductAction(
  id: string,
  input: z.infer<typeof productSchema>
): Promise<ActionResult<Product>> {
  await requireSession()
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const product = await updateProduct(id, parsed.data)
    if (!product) return { success: false, error: 'Product not found' }
    revalidatePath('/products')
    revalidatePath(`/products/${id}/edit`)
    revalidatePath('/inventory')
    revalidatePath('/sales')
    revalidatePath('/dashboard')
    return { success: true, data: product }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product',
    }
  }
}
