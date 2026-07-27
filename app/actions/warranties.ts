'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import {
  createWarrantyClaim,
  registerWarranty,
  updateWarrantyClaim,
} from '@/lib/services/warranties'
import type { Warranty, WarrantyClaim } from '@/lib/types/crm'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const registerSchema = z.object({
  warranty_id: z.string().min(1),
  serial_number: z.string().min(1, 'Serial number is required'),
  warranty_period_months: z.union([z.literal(12), z.literal(24), z.literal(36)]),
})

const claimSchema = z.object({
  warranty_id: z.string().min(1),
  issue_description: z.string().min(3, 'Describe the issue'),
})

const updateClaimSchema = z.object({
  claim_id: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'resolved']),
  resolution: z.string().optional(),
})

export async function registerWarrantyAction(
  input: z.infer<typeof registerSchema>
): Promise<ActionResult<Warranty>> {
  await requireSession()
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const warranty = await registerWarranty(parsed.data)
    revalidatePath('/warranty')
    return { success: true, data: warranty }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register warranty',
    }
  }
}

export async function createWarrantyClaimAction(
  input: z.infer<typeof claimSchema>
): Promise<ActionResult<WarrantyClaim>> {
  await requireSession()
  const parsed = claimSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const claim = await createWarrantyClaim(parsed.data)
    revalidatePath('/warranty')
    return { success: true, data: claim }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open claim',
    }
  }
}

export async function updateWarrantyClaimAction(
  input: z.infer<typeof updateClaimSchema>
): Promise<ActionResult<WarrantyClaim>> {
  await requireSession()
  const parsed = updateClaimSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const claim = await updateWarrantyClaim(parsed.data)
    revalidatePath('/warranty')
    return { success: true, data: claim }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update claim',
    }
  }
}
