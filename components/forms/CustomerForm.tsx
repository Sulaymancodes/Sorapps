'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Panel } from '@/components/common/Panel'
import { BUSINESS_TYPES, NIGERIAN_STATES } from '@/lib/constants/options'
import {
  createCustomerAction,
  updateCustomerAction,
} from '@/app/actions/customers'
import type { Customer, CustomerInput } from '@/lib/types/crm'

type CustomerFormValues = CustomerInput

interface CustomerFormProps {
  customer?: Customer
  mode?: 'create' | 'edit'
}

export function CustomerForm({ customer, mode = 'create' }: CustomerFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    defaultValues: {
      name: customer?.name || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
      address: customer?.address || '',
      city: customer?.city || '',
      state: customer?.state || NIGERIAN_STATES[0],
      business_type: customer?.business_type || BUSINESS_TYPES[0],
      credit_limit: customer?.credit_limit || 500000,
    },
  })

  const onSubmit = async (values: CustomerFormValues) => {
    setFormError(null)
    if (!values.name.trim() || values.name.trim().length < 2) {
      setError('name', { message: 'Enter the customer name' })
      return
    }
    if (!values.email.includes('@')) {
      setError('email', { message: 'Enter a valid email' })
      return
    }
    if (!values.phone.trim() || values.phone.trim().length < 10) {
      setError('phone', { message: 'Enter a valid phone number' })
      return
    }
    if (!values.address.trim()) {
      setError('address', { message: 'Enter an address' })
      return
    }
    if (!values.city.trim()) {
      setError('city', { message: 'Enter a city' })
      return
    }

    const payload: CustomerInput = {
      ...values,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      credit_limit: Number(values.credit_limit) || 0,
    }

    const result =
      mode === 'edit' && customer
        ? await updateCustomerAction(customer.id, payload)
        : await createCustomerAction(payload)

    if (!result.success) {
      setFormError(result.error)
      return
    }

    if (mode === 'edit') {
      router.push('/customers')
    } else {
      router.push(`/customers?created=${result.data.id}`)
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Customer details" description="Contact and business information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="name">Full name / Business name</Label>
            <Input id="name" placeholder="e.g. Chioma Solar Ventures" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="name@company.com" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="+2348012345678" {...register('phone')} />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Street address" {...register('address')} />
            {errors.address && (
              <p className="mt-1 text-xs text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" placeholder="Lagos" {...register('city')} />
            {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city.message}</p>}
          </div>

          <div>
            <Label htmlFor="state">State</Label>
            <Select id="state" {...register('state')}>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="business_type">Business type</Label>
            <Select id="business_type" {...register('business_type')}>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="credit_limit">Credit limit (₦)</Label>
            <Input
              id="credit_limit"
              type="number"
              min={0}
              step={10000}
              {...register('credit_limit', { valueAsNumber: true })}
            />
          </div>
        </div>
      </Panel>

      {formError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {mode === 'edit' ? 'Save changes' : 'Create customer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/customers')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
