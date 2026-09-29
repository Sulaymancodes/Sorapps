import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customerDocuments, orgSettings } from '@/lib/db/schema'
import {
  hasKycOrSalesFormDoc,
  KYC_UPLOAD_REQUIRED_MESSAGE,
} from '@/lib/utils/kyc-docs'

export const ORG_SETTINGS_ID = 'default'

export type OrgSettings = {
  kyc_uploads_required: boolean
}

const OPTIONAL: OrgSettings = { kyc_uploads_required: false }

export async function getOrgSettings(): Promise<OrgSettings> {
  try {
    const [row] = await db
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.id, ORG_SETTINGS_ID))
      .limit(1)
    if (!row) return OPTIONAL
    return { kyc_uploads_required: row.kycUploadsRequired }
  } catch {
    return OPTIONAL
  }
}

export async function setKycUploadsRequired(required: boolean, userId: string): Promise<OrgSettings> {
  const now = new Date()
  const [existing] = await db
    .select({ id: orgSettings.id })
    .from(orgSettings)
    .where(eq(orgSettings.id, ORG_SETTINGS_ID))
    .limit(1)

  if (existing) {
    const [row] = await db
      .update(orgSettings)
      .set({
        kycUploadsRequired: required,
        updatedAt: now,
        updatedByUserId: userId,
      })
      .where(eq(orgSettings.id, ORG_SETTINGS_ID))
      .returning()
    return { kyc_uploads_required: row.kycUploadsRequired }
  }

  const [row] = await db
    .insert(orgSettings)
    .values({
      id: ORG_SETTINGS_ID,
      kycUploadsRequired: required,
      updatedAt: now,
      updatedByUserId: userId,
    })
    .returning()
  return { kyc_uploads_required: row.kycUploadsRequired }
}

export async function assertKycUploadsIfRequired(
  incoming: Array<{ doc_type?: string | null; docType?: string | null }> | undefined,
  options?: { customerId?: string }
) {
  const settings = await getOrgSettings()
  if (!settings.kyc_uploads_required) return
  if (hasKycOrSalesFormDoc(incoming)) return
  if (options?.customerId) {
    const existing = await db
      .select({ docType: customerDocuments.docType })
      .from(customerDocuments)
      .where(eq(customerDocuments.customerId, options.customerId))
    if (hasKycOrSalesFormDoc(existing)) return
  }
  throw new Error(KYC_UPLOAD_REQUIRED_MESSAGE)
}
