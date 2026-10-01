'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionAccess, requireAdmin, requireSession } from '@/lib/auth-server'
import { createCustomerDocuments } from '@/lib/services/documents'
import { getCustomer } from '@/lib/services/customers'
import { issueActivationForSale } from '@/lib/services/activations'
import { createSale, deleteSale, getSaleUnlockPin, updateSale } from '@/lib/services/sales'
import { assertSerialsNotSold, findSoldSerials } from '@/lib/services/serials'
import { attachUnlockPinToSale } from '@/lib/services/unlocks'
import { parseDeviceSerials, type SoldSerialHit } from '@/lib/utils/serial'
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
    address_building_features: z.string().optional().default(''),
    address_street: z.string().optional().default(''),
    address_landmark: z.string().optional().default(''),
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
    site_photo_url: z.string().url('Upload a unit photo'),
    documents: z.array(documentSchema).optional(),
    unlock_pin: z.string().trim().min(1).optional(),
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
): Promise<
  ActionResult<{
    sale: Sale
    invoice: Invoice
    schedule: PaymentSchedule
    activation_id?: string
    activation_warning?: string
    unlock_pin?: string
  }>
> {
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

    const serials = parsed.data.items.flatMap((item) =>
      parseDeviceSerials(item.serial_number)
    )
    await assertSerialsNotSold(serials)

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

    let activationId: string | undefined
    let activationWarning: string | undefined
    let unlockPin: string | undefined
    const paidAtSale = result.sale.amount_paid
    const preparedPin = parsed.data.unlock_pin?.trim()
    const firstSerial = parsed.data.items[0]?.serial_number

    if (preparedPin) {
      await attachUnlockPinToSale(result.sale.id, firstSerial || '', preparedPin)
      unlockPin = preparedPin
    }

    if (paidAtSale > 0) {
      try {
        const firstInstallment = result.schedule.installments[0]
        const { activation } = await issueActivationForSale({
          sale_id: result.sale.id,
          customer_id: result.sale.customer_id,
          amount_paid: paidAtSale,
          expected_amount:
            result.sale.payment_type === 'full'
              ? result.sale.total_amount
              : firstInstallment?.amount || result.sale.total_amount,
          payment_type: result.sale.payment_type,
          created_by_user_id: session.user.id,
          existing_pin: preparedPin,
        })
        activationId = activation.id
        unlockPin = activation.code
      } catch (error) {
        activationWarning =
          error instanceof Error
            ? error.message
            : 'Sale saved, but the device PIN SMS could not be sent'
        unlockPin = preparedPin || (await getSaleUnlockPin(result.sale.id)) || undefined
      }
    }

    revalidatePath('/sales')
    revalidatePath('/customers')
    revalidatePath('/products')
    revalidatePath('/inventory')
    revalidatePath('/invoices')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/warranty')
    revalidatePath('/activations')
    revalidatePath('/unlock')
    return {
      success: true,
      data: {
        ...result,
        activation_id: activationId,
        activation_warning: activationWarning,
        unlock_pin: unlockPin,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create sale',
    }
  }
}

export async function checkSoldSerialsAction(
  serials: string[],
  excludeSaleId?: string
): Promise<ActionResult<{ hits: SoldSerialHit[] }>> {
  await requireSession()
  try {
    const hits = await findSoldSerials(serials, excludeSaleId)
    return { success: true, data: { hits } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check serials',
    }
  }
}

export async function updateSaleAction(
  id: string,
  input: z.infer<typeof saleSchema>
): Promise<ActionResult<{ sale: Sale }>> {
  await requireAdmin()
  const parsed = saleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  if (!id?.trim()) return { success: false, error: 'Sale id is required' }

  try {
    const serials = parsed.data.items.flatMap((item) => parseDeviceSerials(item.serial_number))
    await assertSerialsNotSold(serials, id)

    const { documents: _documents, ...saleData } = parsed.data
    const result = await updateSale(id, {
      ...saleData,
      customer_id: parsed.data.customer_id || undefined,
      new_customer: parsed.data.new_customer
        ? {
            ...parsed.data.new_customer,
            email: parsed.data.new_customer.email || '',
            phone: parsed.data.new_customer.phone || '',
            credit_limit: parsed.data.new_customer.credit_limit ?? 0,
          }
        : undefined,
    })

    revalidatePath('/sales')
    revalidatePath(`/sales/${id}/edit`)
    revalidatePath('/customers')
    revalidatePath('/products')
    revalidatePath('/inventory')
    revalidatePath('/invoices')
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidatePath('/warranty')
    revalidatePath('/activations')
    revalidatePath('/unlock')
    revalidatePath('/reports')
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update sale',
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
