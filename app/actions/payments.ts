'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import { sendActivationSms } from '@/lib/services/activations'
import {
  getExpectedAmountForSale,
  linkPaymentActivation,
  listOutstandingSaleOptions,
  listPaymentsPage,
  recordPayment,
  type OutstandingSaleOption,
} from '@/lib/services/payments'
import { listWarranties } from '@/lib/services/warranties'
import type { Payment } from '@/lib/types/crm'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const recordSchema = z.object({
  sale_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(['bank_transfer', 'cash', 'cheque', 'card']),
  reference: z.string().optional(),
  bank: z.string().optional(),
  notes: z.string().optional(),
  issue_activation: z.boolean().optional(),
  phone: z.string().optional(),
})

const listPaymentsSchema = z.object({
  search: z.string().optional(),
  method: z.string().optional(),
  payment_type: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
})

const queueSchema = z.object({
  search: z.string().optional(),
  urgency: z
    .enum(['overdue', 'due_today', 'due_soon', 'later', 'actionable', 'all'])
    .optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export async function listPaymentsPageAction(
  input: z.infer<typeof listPaymentsSchema> = {}
): Promise<ActionResult<Awaited<ReturnType<typeof listPaymentsPage>>>> {
  await requireSession()
  const parsed = listPaymentsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid filters' }
  }
  try {
    return { success: true, data: await listPaymentsPage(parsed.data) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load payments',
    }
  }
}

export async function listCollectionQueueAction(
  input: z.infer<typeof queueSchema> = {}
): Promise<ActionResult<OutstandingSaleOption[]>> {
  await requireSession()
  const parsed = queueSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid filters' }
  }
  try {
    return {
      success: true,
      data: await listOutstandingSaleOptions({
        search: parsed.data.search,
        urgency: parsed.data.urgency ?? 'actionable',
        limit: parsed.data.limit ?? 60,
      }),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load collection queue',
    }
  }
}

export async function listOutstandingSalesAction(
  search?: string
): Promise<ActionResult<OutstandingSaleOption[]>> {
  await requireSession()
  try {
    return {
      success: true,
      data: await listOutstandingSaleOptions({
        search,
        urgency: 'all',
        limit: 100,
      }),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load outstanding sales',
    }
  }
}

export async function getExpectedAmountAction(
  saleId: string
): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof getExpectedAmountForSale>>>>> {
  await requireSession()
  try {
    const data = await getExpectedAmountForSale(saleId)
    if (!data) return { success: false, error: 'Sale not found' }
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load expected amount',
    }
  }
}

export async function recordPaymentAction(
  input: z.infer<typeof recordSchema>
): Promise<
  ActionResult<{
    payment: Payment
    outstanding: number
    validity_days: number
    is_partial: boolean
    activation_id?: string
  }>
> {
  const session = await requireSession()
  const parsed = recordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const recorded = await recordPayment({
      sale_id: parsed.data.sale_id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference,
      bank: parsed.data.bank,
      notes: parsed.data.notes,
      created_by_user_id: session.user.id,
    })

    let activationId: string | undefined

    if (parsed.data.issue_activation) {
      const warranties = await listWarranties()
      const warranty = warranties.find((w) => w.sale_id === parsed.data.sale_id)

      const { activation } = await sendActivationSms({
        customer_id: recorded.customer_id,
        sale_id: parsed.data.sale_id,
        warranty_id: warranty?.id,
        device_serial: warranty?.serial_number,
        phone: parsed.data.phone,
        validity_days: recorded.validity.validity_days,
        amount_paid: recorded.payment.amount,
        expected_amount: recorded.validity.expected_amount,
        payment_id: recorded.payment.id,
        created_by_user_id: session.user.id,
      })
      activationId = activation.id
      await linkPaymentActivation(recorded.payment.id, activationId)
    }

    revalidatePath('/payments')
    revalidatePath('/sales')
    revalidatePath('/activations')
    revalidatePath('/dashboard')
    revalidatePath('/calendar')
    revalidatePath('/customers')

    return {
      success: true,
      data: {
        payment: {
          ...recorded.payment,
          activation_id: activationId ?? recorded.payment.activation_id,
        },
        outstanding: recorded.outstanding,
        validity_days: recorded.validity.validity_days,
        is_partial: recorded.validity.is_partial,
        activation_id: activationId,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    }
  }
}
