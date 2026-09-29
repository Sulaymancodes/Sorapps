'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireSession } from '@/lib/auth-server'
import { getOrgSettings, setKycUploadsRequired } from '@/lib/services/org-settings'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function getOrgSettingsAction(): Promise<
  ActionResult<{ kyc_uploads_required: boolean }>
> {
  await requireSession()
  try {
    return { success: true, data: await getOrgSettings() }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load settings',
    }
  }
}

const updateSchema = z.object({
  kyc_uploads_required: z.boolean(),
})

export async function updateKycUploadsRequiredAction(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult<{ kyc_uploads_required: boolean }>> {
  const session = await requireAdmin()
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const data = await setKycUploadsRequired(parsed.data.kyc_uploads_required, session.user.id)
    revalidatePath('/settings')
    revalidatePath('/sales/new')
    revalidatePath('/customers/new')
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save setting',
    }
  }
}
