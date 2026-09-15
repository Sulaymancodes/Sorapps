'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionAccess, requireAdmin, requireSession } from '@/lib/auth-server'
import { createCustomerDocuments } from '@/lib/services/documents'
import { getCustomer } from '@/lib/services/customers'
import { createSale, deleteSale } from '@/lib/services/sales'
import { assertAgentTerritory } from '@/lib/utils/territory'
import type { DocumentUploadInput, Invoice, PaymentSchedule, Sale } from '@/lib/types/crm'

const customerInputSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email().or(z.literal('')).optional(),
    phone: z.string().optional().default(''),
    nin: z.string().optional(),
    bvn: z.string().optional(),
    address: z.string().optional().default(''),
    address_house_number: z.string().optional().default(''),
    address_building_features: z.string().min(1, 'Building features required'),
    address_street: z.string().min(1, 'Street / identifying features required'),
    address_landmark: z.string().min(1, 'Nearest landmark required'),
    city: z.string().min(1),
    state: z.string().min(1),
    lga: z.string().optional(),
    business_type: z.string().optional().default('Household'),
    gender: z.string().min(1, 'Select gender'),
    customer_category: z.string().min(1, 'Select customer category'),
    customer_type: z.string().min(1, 'Select customer type'),
    alternate_phone: z.string().optional().default(''),
    credit_limit: z.coerce.number().min(0).default(0),
    is_minor: z.boolean().optional().default(false),
    guardian_name: z.string().optional().default(''),
    guardian_phone: z.string().optional().default(''),
    guardian_relationship: z.string().optional().default(''),
    next_of_kin_name: z.string().optional().default(''),
    next_of_kin_phone: z.string().optional().default(''),
    next_of_kin_relationship: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.is_minor) {
      if (!(data.guardian_name || '').trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Parent/guardian name is required for minors',
          path: ['guardian_name'],
        })
      }
      if ((data.guardian_phone || '').trim().length < 10) {
        ctx.addIssue({
          code: 'custom',
          message: 'Parent/guardian phone is required for minors',
          path: ['guardian_phone'],
        })
      }
    } else if ((data.phone || '').trim().length < 10) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phone is required',
        path: ['phone'],
      })
    }
  })

const documentSchema = z.object({
  file_url: z.string().url(),
  file_name: z.string().min(1),
  content_type: z.string().min(1),
  storage_key: z.string().optional(),
  doc_type: z.enum(['kyc', 'sales_form', 'other']),
  page_number: z.number().int().positive().optional(),
})

const saleSchema = z
  .object({
    customer_id: z.string().optional(),
    new_customer: customerInputSchema.optional(),
    payment_type: z.enum(['full', 'installment']),
    payment_method: z.enum(['bank_transfer', 'cash', 'cheque', 'card']).default('cash'),
    installment_weeks: z.coerce.number().int().positive().optional(),
    installment_interval_days: z.coerce.number().int().min(1).max(365).optional(),
    plan_end_date: z.string().optional(),
    discount_percent: z.coerce.number().min(0).max(100),
    transport_cost: z.coerce.number().min(0),
    notes: z.string(),
    dares_type_of_payment: z.string().min(1, 'Select type of payment'),
    dares_payment_plan: z.string().min(1, 'Select payment plan'),
    retail_cost_ngn: z.coerce.number().min(0).optional(),
    cost_to_end_user_ngn: z.coerce.number().min(1, 'Enter cost to end user'),
    downpayment_amount_ngn: z.coerce.number().min(0).optional().default(0),
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
      deployment_area_id: z.string().nullable().optional(),
      deployment_area_name: z.string().nullable().optional(),
      subsidy_level: z.string().nullable().optional(),
      out_of_area_reason: z.string().nullable().optional(),
    }),
    site_photo_url: z.string().url('Upload a site photo'),
    documents: z.array(documentSchema).optional(),
  })
  .refine((data) => Boolean(data.customer_id?.trim() || data.new_customer), {
    message: 'Select or create a customer',
    path: ['customer_id'],
  })
  .refine(
    (data) =>
      data.payment_type !== 'installment' ||
      (data.installment_interval_days != null && Boolean(data.plan_end_date?.trim())),
    {
      message: 'Choose payment interval and plan end date for installment sales',
      path: ['plan_end_date'],
    }
  )

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createSaleAction(
  input: z.infer<typeof saleSchema>
): Promise<ActionResult<{ sale: Sale; invoice: Invoice; schedule: PaymentSchedule }>> {
  const session = await requireSession()
  const parsed = saleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const access = getSessionAccess(session)
    if (parsed.data.new_customer) {
      assertAgentTerritory(
        { state: parsed.data.new_customer.state, lga: parsed.data.new_customer.lga },
        access
      )
    } else if (parsed.data.customer_id) {
      const existing = await getCustomer(parsed.data.customer_id)
      if (!existing) return { success: false, error: 'Customer not found' }
      assertAgentTerritory({ state: existing.state, lga: existing.lga }, access)
    }

    const { documents, ...saleData } = parsed.data
    const result = await createSale({
      ...saleData,
      customer_id: parsed.data.customer_id || undefined,
      created_by_user_id: session.user.id,
      new_customer: parsed.data.new_customer
        ? {
            ...parsed.data.new_customer,
            email: parsed.data.new_customer.email || '',
            phone: parsed.data.new_customer.phone || '',
            credit_limit: parsed.data.new_customer.credit_limit ?? 0,
          }
        : undefined,
    })

    if (documents?.length) {
      await createCustomerDocuments({
        customer_id: result.sale.customer_id,
        sale_id: result.sale.id,
        documents: documents as DocumentUploadInput[],
        uploaded_by_user_id: session.user.id,
      })
    }

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
  await requireAdmin()
  if (!id?.trim()) return { success: false, error: 'Sale id is required' }
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
    revalidatePath('/activations')
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete sale',
    }
  }
}
