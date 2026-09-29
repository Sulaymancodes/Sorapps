'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import { assertSerialsNotSold, listAllSoldSerials } from '@/lib/services/serials'
import {
  listAvailableUnlockPool,
  listTeamUnlocks,
  resolveUnlockPin,
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

export async function getUnlockPoolAction(): Promise<
  ActionResult<{
    available: Array<{
      id: string
      serial_number: string
      kind: DeviceUnlockRecord['kind']
      day_token: string
      pin: string
      source: DeviceUnlockRecord['source']
      created_at: string
    }>
    sold: Array<{
      serial: string
      sale_id: string
      customer_id: string
      customer_name: string
    }>
    synced_at: string
  }>
> {
  await requireSession()
  try {
    const [available, sold] = await Promise.all([listAvailableUnlockPool(), listAllSoldSerials()])
    return {
      success: true,
      data: {
        available: available.map((row) => ({
          id: row.id,
          serial_number: row.serial_number,
          kind: row.kind,
          day_token: row.day_token,
          pin: row.pin,
          source: row.source,
          created_at: row.created_at.toISOString(),
        })),
        sold,
        synced_at: new Date().toISOString(),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load unlock pool',
    }
  }
}

export async function listMyUnlocksAction(): Promise<ActionResult<DeviceUnlockRecord[]>> {
  const session = await requireSession()
  try {
    return { success: true, data: await listTeamUnlocks() }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load unlock history',
    }
  }
}

export async function resolveUnlockPinAction(
  input: z.infer<typeof unlockSchema>
): Promise<ActionResult<DeviceUnlockRecord & { reused: boolean }>> {
  const session = await requireSession()
  const parsed = unlockSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    await assertSerialsNotSold([parsed.data.serial_number])
    const data = await resolveUnlockPin({
      ...parsed.data,
      created_by_user_id: session.user.id,
    })
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve device PIN',
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
