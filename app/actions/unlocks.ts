'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import {
  listUnlocksForUser,
  unlockDevice,
  type DeviceUnlockRecord,
} from '@/lib/services/unlocks'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const unlockSchema = z.object({
  serial_number: z.string().trim().min(3, 'Enter a valid serial number'),
  kind: z.enum(['partial', 'full']),
  validity_days: z.coerce.number().int().positive().optional(),
})

export async function listMyUnlocksAction(): Promise<ActionResult<DeviceUnlockRecord[]>> {
  const session = await requireSession()
  try {
    return { success: true, data: await listUnlocksForUser(session.user.id) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load unlock history',
    }
  }
}

export async function unlockDeviceAction(
  input: z.infer<typeof unlockSchema>
): Promise<ActionResult<DeviceUnlockRecord>> {
  const session = await requireSession()
  const parsed = unlockSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const data = await unlockDevice({
      ...parsed.data,
      created_by_user_id: session.user.id,
    })
    revalidatePath('/unlock')
    revalidatePath('/sales')
    revalidatePath('/activations')
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unlock device',
    }
  }
}
