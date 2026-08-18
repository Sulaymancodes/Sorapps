'use server'

import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import { createSitePhotoUploadUrl, isR2Configured } from '@/lib/r2'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const uploadSchema = z.object({
  contentType: z.string().min(1),
  fileName: z.string().min(1),
})

export async function getR2StatusAction(): Promise<
  ActionResult<{ configured: boolean }>
> {
  await requireSession()
  return { success: true, data: { configured: isR2Configured() } }
}

export async function createSitePhotoUploadUrlAction(
  input: z.infer<typeof uploadSchema>
): Promise<ActionResult<{ uploadUrl: string; publicUrl: string; key: string }>> {
  await requireSession()
  const parsed = uploadSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const ext =
      parsed.data.fileName.split('.').pop()?.toLowerCase() ||
      (parsed.data.contentType === 'image/png' ? 'png' : 'jpg')
    const data = await createSitePhotoUploadUrl({
      contentType: parsed.data.contentType,
      extension: ext,
    })
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to prepare upload',
    }
  }
}
