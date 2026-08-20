'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth-server'
import {
  createDocumentUploadUrl,
  createSitePhotoUploadUrl,
  isR2Configured,
} from '@/lib/r2'
import { createCustomerDocuments } from '@/lib/services/documents'
import type { DocumentUploadInput } from '@/lib/types/crm'

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

export async function createDocumentUploadUrlAction(
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
      (parsed.data.contentType === 'application/pdf' ? 'pdf' : 'jpg')
    const data = await createDocumentUploadUrl({
      contentType: parsed.data.contentType,
      extension: ext,
    })
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to prepare document upload',
    }
  }
}

const saveDocsSchema = z.object({
  customer_id: z.string().min(1),
  sale_id: z.string().optional(),
  documents: z
    .array(
      z.object({
        file_url: z.string().url(),
        file_name: z.string().min(1),
        content_type: z.string().min(1),
        storage_key: z.string().optional(),
        doc_type: z.enum(['kyc', 'sales_form', 'other']),
        page_number: z.number().int().positive().optional(),
      })
    )
    .min(1),
})

export async function saveCustomerDocumentsAction(
  input: z.infer<typeof saveDocsSchema>
): Promise<ActionResult<{ count: number }>> {
  const session = await requireSession()
  const parsed = saveDocsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const docs = await createCustomerDocuments({
      customer_id: parsed.data.customer_id,
      sale_id: parsed.data.sale_id,
      documents: parsed.data.documents as DocumentUploadInput[],
      uploaded_by_user_id: session.user.id,
    })
    revalidatePath('/customers')
    revalidatePath('/sales')
    return { success: true, data: { count: docs.length } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save documents',
    }
  }
}
