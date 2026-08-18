'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireSession } from '@/lib/auth-server'
import { createSale, deleteSale } from '@/lib/services/sales'
import type { Invoice, PaymentSchedule, Sale } from '@/lib/types/crm'

const customerInputSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().min(10),
  nin: z.string().optional(),
  bvn: z.string().optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  lga: z.string().optional(),
  business_type: z.string().min(1),
  credit_limit: z.coerce.number().min(0).default(0),
})

const saleSchema = z
  .object({
    customer_id: z.string().optional(),
    new_customer: customerInputSchema.optional(),
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
          serial_number: z.string().min(1, 'Serial number is required'),
        })
      )
      .min(1, 'Add at least one product'),
    site_gps: z.object({
      latitude: z.number().finite(),
      longitude: z.number().finite(),
      captured_at: z.string().min(1),
      locked: z.literal(true),
      out_of_area: z.boolean(),
    }),
    site_photo_url: z.string().url('Upload a site photo'),
  })
  .refine((data) => Boolean(data.customer_id?.trim() || data.new_customer), {
    message: 'Select or create a customer',
    path: ['customer_id'],
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
    const result = await createSale({
      ...parsed.data,
      customer_id: parsed.data.customer_id || undefined,
      new_customer: parsed.data.new_customer
        ? {
            ...parsed.data.new_customer,
            email: parsed.data.new_customer.email || '',
            credit_limit: parsed.data.new_customer.credit_limit ?? 0,
          }
        : undefined,
    })
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

export async function deleteSaleAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Admin access required',
    }
  }

  if (!id?.trim()) {
    return { success: false, error: 'Sale id is required' }
  }

  try {
    await deleteSale(id)
    revalidatePath('/sales')
    revalidatePath('/customers')
    revalidatePath('/products')
    revalidatePath('/inventory')
    revalidatePath('/invoices')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/warranty')
    revalidatePath('/reports')
    revalidatePath('/calendar')
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete sale',
    }
  }
}
