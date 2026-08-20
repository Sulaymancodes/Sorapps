'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-server'
import {
  createAppUser,
  listAppUsers,
  resetAppUserPassword,
  updateAgentTerritory,
  updateAppUserRole,
  type AppUser,
} from '@/lib/services/users'
import type { AppRole } from '@/lib/roles'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  assigned_state: z.string().min(1),
  assigned_lga: z.string().min(1),
  password: z.string().min(8).optional().or(z.literal('')),
  send_sms: z.boolean().optional().default(true),
  role: z.enum(['admin', 'agent']).optional().default('agent'),
})

export async function listUsersAction(): Promise<ActionResult<AppUser[]>> {
  await requireAdmin()
  try {
    return { success: true, data: await listAppUsers() }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list users',
    }
  }
}

export async function createUserAction(
  input: z.infer<typeof createSchema>
): Promise<
  ActionResult<{
    user: AppUser
    password: string
    sms_sent: boolean
    sms_error?: string
  }>
> {
  await requireAdmin()
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const result = await createAppUser({
      ...parsed.data,
      password: parsed.data.password || undefined,
      role: parsed.data.role as AppRole,
    })
    revalidatePath('/settings')
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create user',
    }
  }
}

export async function updateUserRoleAction(input: {
  id: string
  role: AppRole
  assigned_state?: string
  assigned_lga?: string
}): Promise<ActionResult<AppUser>> {
  const session = await requireAdmin()
  if (input.id === session.user.id && input.role !== 'admin') {
    return { success: false, error: 'You cannot demote your own admin account' }
  }

  try {
    const user = await updateAppUserRole(input.id, input.role, {
      assigned_state: input.assigned_state,
      assigned_lga: input.assigned_lga,
    })
    revalidatePath('/settings')
    return { success: true, data: user }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update role',
    }
  }
}

export async function updateUserTerritoryAction(input: {
  id: string
  assigned_state: string
  assigned_lga: string
}): Promise<ActionResult<AppUser>> {
  await requireAdmin()
  try {
    const user = await updateAgentTerritory(input.id, input.assigned_state, input.assigned_lga)
    revalidatePath('/settings')
    return { success: true, data: user }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update territory',
    }
  }
}

export async function resetUserPasswordAction(input: {
  id: string
  send_sms?: boolean
}): Promise<ActionResult<{ password: string; sms_sent: boolean; sms_error?: string }>> {
  await requireAdmin()
  try {
    const result = await resetAppUserPassword(input.id, { send_sms: input.send_sms })
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset password',
    }
  }
}
