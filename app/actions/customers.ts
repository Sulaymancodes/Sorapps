'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth-server'
import {
  createCustomer,
  deleteCustomer,
  findCustomerDuplicates,
  updateCustomer,
  type DuplicateField,
  type DuplicateMatch,
} from '@/lib/services/customers'
import type { Customer } from '@/lib/types/crm'

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.union([z.string().email('Valid email is required'), z.literal('')]),
  phone: z.string().min(1, 'Phone is required'),
  nin: z.string().optional(),
  bvn: z.string().optional(),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  lga: z.string().optional(),
  business_type: z.string().min(1, 'Business type is required'),
  credit_limit: z.coerce.number().min(0),
})

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createCustomerAction(
  input: z.infer<typeof customerSchema>
): Promise<ActionResult<Customer>> {
  await requireSession()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const customer = await createCustomer(parsed.data)
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
  await requireSession()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  try {
    const customer = await updateCustomer(id, parsed.data)
    if (!customer) return { success: false, error: 'Customer not found' }
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
  await requireSession()
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
}): Promise<
  ActionResult<{ field: DuplicateField; matches: DuplicateMatch[] }[]>
> {
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
