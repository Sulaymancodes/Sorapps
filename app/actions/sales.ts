'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import { createSale } from '@/lib/services/sales'
import type { Invoice, PaymentSchedule, Sale } from '@/lib/types/crm'

const saleSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  payment_type: z.enum(['full', 'installment']),
  installment_weeks: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]).optional(),
  discount_percent: z.coerce.number().min(0).max(100),
  transport_cost: z.coerce.number().min(0),
  notes: z.string(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity: z.coerce.number().int().min(1),
      })
    )
    .min(1, 'Add at least one product'),
})

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createSaleAction(
  input: z.infer<typeof saleSchema>
): Promise<ActionResult<{ sale: Sale; invoice: Invoice; schedule: PaymentSchedule }>> {
  await requireSession()
  const parsed = saleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const result = await createSale(parsed.data)
    revalidatePath('/sales')
    revalidatePath('/customers')
    revalidatePath('/products')
    revalidatePath('/inventory')
    revalidatePath('/invoices')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/warranty')
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create sale',
    }
  }
}
