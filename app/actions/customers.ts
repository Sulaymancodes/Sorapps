'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionAccess, requireAdmin, requireSession } from '@/lib/auth-server'
import { assertAgentTerritory } from '@/lib/utils/territory'
import {
  createCustomer,
  deleteCustomer,
  findCustomerDuplicates,
  scanBeneficiaryDuplicates,
  updateCustomer,
  type DuplicateField,
  type DuplicateMatch,
  type DuplicateScanResult,
} from '@/lib/services/customers'
import { createCustomerDocuments } from '@/lib/services/documents'
import { assertKycUploadsIfRequired } from '@/lib/services/org-settings'
import type { Customer, DocumentUploadInput } from '@/lib/types/crm'

const documentSchema = z.object({
  file_url: z.string().url(),
  file_name: z.string().min(1),
  content_type: z.string().min(1),
  storage_key: z.string().optional(),
  doc_type: z.enum(['kyc', 'sales_form', 'other']),
  page_number: z.number().int().positive().optional(),
})

const customerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.union([z.string().email('Valid email is required'), z.literal('')]),
    phone: z.string().optional().default(''),
    nin: z.string().optional(),
    bvn: z.string().optional(),
    address: z.string().optional().default(''),
    address_house_number: z.string().optional().default(''),
    address_building_features: z.string().optional().default(''),
    address_street: z.string().optional().default(''),
    address_landmark: z.string().optional().default(''),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    lga: z.string().optional(),
    business_type: z.string().optional().default('Household'),
    gender: z.string().min(1, 'Select gender'),
    customer_category: z.string().min(1, 'Select customer category'),
    customer_type: z.string().min(1, 'Select customer type'),
    alternate_phone: z.string().optional().default(''),
    credit_limit: z.coerce.number().min(0),
    is_minor: z.boolean().optional().default(false),
    guardian_name: z.string().optional().default(''),
    guardian_phone: z.string().optional().default(''),
    guardian_relationship: z.string().optional().default(''),
    next_of_kin_name: z.string().optional().default(''),
    next_of_kin_phone: z.string().optional().default(''),
    next_of_kin_relationship: z.string().optional().default(''),
    documents: z.array(documentSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const phone = (data.phone || '').trim()
    const guardianPhone = (data.guardian_phone || '').trim()
    if (data.is_minor) {
      if (!(data.guardian_name || '').trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Parent/guardian name is required for minors',
          path: ['guardian_name'],
        })
      }
      if (guardianPhone.length < 10) {
        ctx.addIssue({
          code: 'custom',
          message: 'Parent/guardian phone is required for minors',
          path: ['guardian_phone'],
        })
      }
      if (!(data.guardian_relationship || '').trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Select guardian relationship',
          path: ['guardian_relationship'],
        })
      }
    } else if (phone.length < 10) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phone is required',
        path: ['phone'],
      })
    }
  })

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createCustomerAction(
  input: z.infer<typeof customerSchema>
): Promise<ActionResult<Customer>> {
  const session = await requireSession()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const access = getSessionAccess(session)
    assertAgentTerritory(
      { state: parsed.data.state, lga: parsed.data.lga },
      access
    )
    await assertKycUploadsIfRequired(parsed.data.documents)
    const { documents, ...customerData } = parsed.data
    const customer = await createCustomer({
      ...customerData,
      email: customerData.email || '',
      phone: customerData.phone || '',
    })
    if (documents?.length) {
      await createCustomerDocuments({
        customer_id: customer.id,
        documents: documents as DocumentUploadInput[],
        uploaded_by_user_id: session.user.id,
      })
    }
    revalidatePath('/customers')
    revalidatePath('/sales')
    revalidatePath('/dashboard')
    return { success: true, data: customer }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create customer',
    }
  }
}

export async function updateCustomerAction(
  id: string,
  input: z.infer<typeof customerSchema>
): Promise<ActionResult<Customer>> {
  const session = await requireSession()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const access = getSessionAccess(session)
    assertAgentTerritory(
      { state: parsed.data.state, lga: parsed.data.lga },
      access
    )
    await assertKycUploadsIfRequired(parsed.data.documents, { customerId: id })
    const { documents, ...customerData } = parsed.data
    const customer = await updateCustomer(id, {
      ...customerData,
      email: customerData.email || '',
      phone: customerData.phone || '',
    })
    if (!customer) return { success: false, error: 'Customer not found' }
    if (documents?.length) {
      await createCustomerDocuments({
        customer_id: customer.id,
        documents: documents as DocumentUploadInput[],
        uploaded_by_user_id: session.user.id,
      })
    }
    revalidatePath('/customers')
    revalidatePath(`/customers/${id}/edit`)
    revalidatePath('/sales')
    revalidatePath('/dashboard')
    return { success: true, data: customer }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update customer',
    }
  }
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  await requireAdmin()
  if (!id?.trim()) {
    return { success: false, error: 'Customer id is required' }
  }

  try {
    await deleteCustomer(id)
    revalidatePath('/customers')
    revalidatePath('/sales')
    revalidatePath('/sales/new')
    revalidatePath('/dashboard')
    revalidatePath('/reports')
    revalidatePath('/activations')
    revalidatePath('/warranty')
    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete customer',
    }
  }
}

export async function checkCustomerDuplicateAction(input: {
  phone?: string
  nin?: string
  bvn?: string
  exclude_id?: string
}): Promise<ActionResult<{ field: DuplicateField; matches: DuplicateMatch[] }[]>> {
  await requireSession()
  try {
    const data = await findCustomerDuplicates(input)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Duplicate check failed',
    }
  }
}

export async function scanBeneficiaryDuplicatesAction(input: {
  name?: string
  phone?: string
  nin?: string
  bvn?: string
  city?: string
  state?: string
  lga?: string
  address?: string
  beneficiary_id?: string
  serial?: string | string[]
  exclude_id?: string
}): Promise<ActionResult<DuplicateScanResult>> {
  try {
    await requireSession()
    const data = await scanBeneficiaryDuplicates(input)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Duplicate scan failed',
    }
  }
}
