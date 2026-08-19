'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import {
  listActivations,
  resendActivationSms,
  sendActivationSms,
  type ActivationRecord,
} from '@/lib/services/activations'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const sendSchema = z.object({
  customer_id: z.string().min(1),
  sale_id: z.string().optional(),
  warranty_id: z.string().optional(),
  device_serial: z.string().optional(),
  phone: z.string().optional(),
  validity_days: z.coerce.number().int().min(1).max(365).optional(),
  amount_paid: z.coerce.number().min(0).optional(),
  expected_amount: z.coerce.number().min(0).optional(),
})

export async function listActivationsAction(): Promise<ActionResult<ActivationRecord[]>> {
  await requireSession()
  try {
    const data = await listActivations()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load activations',
    }
  }
}

export async function sendActivationSmsAction(
  input: z.infer<typeof sendSchema>
): Promise<ActionResult<ActivationRecord>> {
  const session = await requireSession()
  const parsed = sendSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const { activation } = await sendActivationSms({
      ...parsed.data,
      created_by_user_id: session.user.id,
    })
    revalidatePath('/activations')
    revalidatePath('/sales')
    revalidatePath('/warranty')
    revalidatePath('/dashboard')
    return { success: true, data: activation }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send activation SMS',
    }
  }
}

export async function resendActivationSmsAction(
  id: string
): Promise<ActionResult<ActivationRecord>> {
  await requireSession()
  if (!id?.trim()) return { success: false, error: 'Activation id is required' }

  try {
    const { activation } = await resendActivationSms(id)
    revalidatePath('/activations')
    return { success: true, data: activation }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resend activation SMS',
    }
  }
}
