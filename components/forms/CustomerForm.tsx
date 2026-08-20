'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { DocumentUploader } from '@/components/documents/DocumentUploader'
import { SoftDuplicateAlert } from '@/components/forms/SoftDuplicateAlert'
import { BUSINESS_TYPES, GUARDIAN_RELATIONSHIPS, NIGERIAN_STATES } from '@/lib/constants/options'
import { getLgasForState } from '@/lib/constants/lgas'
import {
  createCustomerAction,
  scanBeneficiaryDuplicatesAction,
  updateCustomerAction,
} from '@/app/actions/customers'
import type { DuplicateMatch } from '@/lib/services/customers'
import type { Customer, CustomerDocument, CustomerInput, DocumentUploadInput } from '@/lib/types/crm'

type CustomerFormValues = CustomerInput & { documents?: DocumentUploadInput[] }

interface CustomerFormProps {
  customer?: Customer
  existingDocuments?: CustomerDocument[]
  mode?: 'create' | 'edit'
}

function isCompletePhone(value: string) {
  const d = value.replace(/\D/g, '')
  if (d.startsWith('234')) return d.length === 13
  return d.length === 11 && d.startsWith('0')
}

const DUP_DEBOUNCE_MS = 600

export function CustomerForm({
  customer,
  existingDocuments = [],
  mode = 'create',
}: CustomerFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentUploadInput[]>([])
  const [softMatches, setSoftMatches] = useState<DuplicateMatch[]>([])
  const [hardMatches, setHardMatches] = useState<DuplicateMatch[]>([])
  const [softAcknowledged, setSoftAcknowledged] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    defaultValues: {
      name: customer?.name || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
      nin: customer?.nin || '',
      bvn: customer?.bvn || '',
      address: customer?.address || '',
      city: customer?.city || '',
      state: customer?.state || '',
      lga: customer?.lga || '',
      business_type: customer?.business_type || BUSINESS_TYPES[0],
      credit_limit: customer?.credit_limit || 500000,
      is_minor: customer?.is_minor || false,
      guardian_name: customer?.guardian_name || '',
      guardian_phone: customer?.guardian_phone || '',
      guardian_relationship: customer?.guardian_relationship || '',
      next_of_kin_name: customer?.next_of_kin_name || '',
      next_of_kin_phone: customer?.next_of_kin_phone || '',
      next_of_kin_relationship: customer?.next_of_kin_relationship || '',
    },
  })

  const selectedState = useWatch({ control, name: 'state' })
  const selectedLga = useWatch({ control, name: 'lga' })
  const isMinor = useWatch({ control, name: 'is_minor' })
  const watchedName = useWatch({ control, name: 'name' }) || ''
  const watchedPhone = useWatch({ control, name: 'phone' }) || ''
  const watchedNin = useWatch({ control, name: 'nin' }) || ''
  const watchedBvn = useWatch({ control, name: 'bvn' }) || ''
  const watchedCity = useWatch({ control, name: 'city' }) || ''
  const watchedAddress = useWatch({ control, name: 'address' }) || ''
  const watchedGuardianPhone = useWatch({ control, name: 'guardian_phone' }) || ''

  const stateOptions = (() => {
    if (selectedState && !(NIGERIAN_STATES as readonly string[]).includes(selectedState)) {
      return [selectedState, ...NIGERIAN_STATES] as string[]
    }
    return NIGERIAN_STATES as unknown as string[]
  })()

  const lgaOptions = useMemo(() => getLgasForState(selectedState || ''), [selectedState])

  useEffect(() => {
    const name = watchedName.trim()
    const timer = window.setTimeout(() => {
      void (async () => {
        if (name.length < 3 && !watchedPhone && !watchedNin && !watchedBvn) {
          setSoftMatches([])
          setHardMatches([])
          return
        }
        const result = await scanBeneficiaryDuplicatesAction({
          name: name.length >= 3 ? name : undefined,
          phone: watchedPhone || watchedGuardianPhone || undefined,
          nin: watchedNin || undefined,
          bvn: watchedBvn || undefined,
          city: watchedCity || undefined,
          state: selectedState || undefined,
          lga: selectedLga || undefined,
          address: watchedAddress || undefined,
          exclude_id: customer?.id,
        })
        if (!result.success) return
        setSoftMatches(result.data.soft)
        setHardMatches(result.data.hard)
        if (!result.data.soft.length) setSoftAcknowledged(false)
      })()
    }, DUP_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [
    watchedName,
    watchedPhone,
    watchedNin,
    watchedBvn,
    watchedCity,
    watchedAddress,
    selectedState,
    selectedLga,
    watchedGuardianPhone,
    customer?.id,
  ])

  const onSubmit = async (values: CustomerFormValues) => {
    setFormError(null)
    if (!values.name.trim() || values.name.trim().length < 2) {
      setError('name', { message: 'Enter the customer name' })
      return
    }
    if (values.email?.trim() && !values.email.includes('@')) {
      setError('email', { message: 'Enter a valid email' })
      return
    }

    if (values.is_minor) {
      if (!(values.guardian_name || '').trim()) {
        setError('guardian_name', { message: 'Enter parent/guardian name' })
        return
      }
      if (!isCompletePhone(values.guardian_phone || '')) {
        setError('guardian_phone', { message: 'Enter a valid guardian phone' })
        return
      }
      if (!(values.guardian_relationship || '').trim()) {
        setError('guardian_relationship', { message: 'Select relationship' })
        return
      }
    } else if (!isCompletePhone(values.phone || '')) {
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
    if (
      !values.state.trim() ||
      (!(NIGERIAN_STATES as readonly string[]).includes(values.state) &&
        values.state !== customer?.state)
    ) {
      setError('state', { message: 'Select a Nigerian state' })
      return
    }

    const scan = await scanBeneficiaryDuplicatesAction({
      name: values.name.trim(),
      phone: values.phone || values.guardian_phone,
      nin: values.nin,
      bvn: values.bvn,
      city: values.city,
      state: values.state,
      lga: values.lga,
      address: values.address,
      exclude_id: customer?.id,
    })
    if (!scan.success) {
      setFormError(scan.error)
      return
    }
    if (scan.data.hard.length) {
      setHardMatches(scan.data.hard)
      const first = scan.data.hard[0]
      setFormError(
        `Duplicate ${first.matched_fields?.[0] || 'record'} — already used by ${first.name}. Fix before saving.`
      )
      return
    }
    if (scan.data.soft.length) {
      setSoftMatches(scan.data.soft)
      if (!softAcknowledged) {
        setFormError(
          'Possible duplicate beneficiary — review the soft-match alert and confirm to continue.'
        )
        return
      }
    }

    const payload = {
      ...values,
      name: values.name.trim(),
      email: values.email?.trim() || '',
      phone: (values.phone || '').trim(),
      nin: values.nin?.trim() || '',
      bvn: values.bvn?.trim() || '',
      address: values.address.trim(),
      city: values.city.trim(),
      lga: values.lga?.trim() || '',
      credit_limit: Number(values.credit_limit) || 0,
      is_minor: Boolean(values.is_minor),
      guardian_name: (values.guardian_name || '').trim(),
      guardian_phone: (values.guardian_phone || '').trim(),
      guardian_relationship: (values.guardian_relationship || '').trim(),
      next_of_kin_name: (values.next_of_kin_name || '').trim(),
      next_of_kin_phone: (values.next_of_kin_phone || '').trim(),
      next_of_kin_relationship: (values.next_of_kin_relationship || '').trim(),
      documents: documents.length ? documents : undefined,
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

          {(hardMatches.length > 0 || softMatches.length > 0) && (
            <div className="md:col-span-2 space-y-3">
              {hardMatches.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  <p className="font-medium">Hard duplicate — cannot save</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {hardMatches.slice(0, 4).map((m) => (
                      <li key={m.id}>
                        {m.name} · {m.phone || 'no phone'}
                        {m.reasons?.length ? ` — ${m.reasons.join(', ')}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <SoftDuplicateAlert
                matches={softMatches}
                acknowledged={softAcknowledged}
                onAcknowledgeChange={(next) => {
                  setSoftAcknowledged(next)
                  if (next) setFormError(null)
                }}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/20 px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(isMinor)}
                onChange={(e) =>
                  setValue('is_minor', e.target.checked, { shouldDirty: true })
                }
              />
              <span>
                <span className="font-medium">Minor / no personal phone</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Beneficiary phone becomes optional — parent/guardian contact is required for SMS
                </span>
              </span>
            </label>
          </div>

          <div>
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" placeholder="name@company.com" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div>
            <Label htmlFor="phone">
              Beneficiary phone{isMinor ? ' (optional)' : ''}
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              placeholder="07012345678"
              {...register('phone', {
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  const limit = digits.startsWith('234') ? 13 : 11
                  e.target.value = digits.slice(0, limit)
                  setValue('phone', e.target.value, { shouldDirty: true })
                },
              })}
            />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div>
            <Label htmlFor="nin">NIN</Label>
            <Input
              id="nin"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="11-digit NIN"
              {...register('nin', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11)
                  setValue('nin', e.target.value, { shouldDirty: true })
                },
              })}
            />
          </div>

          <div>
            <Label htmlFor="bvn">BVN</Label>
            <Input
              id="bvn"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="11-digit BVN"
              {...register('bvn', {
                onChange: (e) => {
                  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11)
                  setValue('bvn', e.target.value, { shouldDirty: true })
                },
              })}
            />
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
            <SearchableSelect
              id="state"
              options={stateOptions}
              value={selectedState || ''}
              onChange={(state) => {
                setValue('state', state, { shouldValidate: true, shouldDirty: true })
                setValue('lga', '', { shouldDirty: true })
              }}
              placeholder="Search Nigerian states…"
              emptyLabel="No state matches your search"
              error={errors.state?.message}
            />
            <input type="hidden" {...register('state')} />
          </div>

          <div>
            <Label htmlFor="lga">Local government</Label>
            <SearchableSelect
              id="lga"
              options={lgaOptions}
              value={selectedLga || ''}
              onChange={(lga) => setValue('lga', lga, { shouldValidate: true, shouldDirty: true })}
              placeholder={selectedState ? 'Search LGA…' : 'Select a state first'}
              emptyLabel="No LGA matches"
            />
            <input type="hidden" {...register('lga')} />
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

      <Panel
        title="Parent / guardian & next of kin"
        description="Required for minors — also available for any beneficiary without a personal phone"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="guardian_name">
              Parent / guardian name{isMinor ? '' : ' (optional)'}
            </Label>
            <Input id="guardian_name" {...register('guardian_name')} placeholder="Full name" />
            {errors.guardian_name && (
              <p className="mt-1 text-xs text-destructive">{errors.guardian_name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="guardian_relationship">Relationship</Label>
            <Select id="guardian_relationship" {...register('guardian_relationship')}>
              <option value="">Select…</option>
              {GUARDIAN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            {errors.guardian_relationship && (
              <p className="mt-1 text-xs text-destructive">
                {errors.guardian_relationship.message}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="guardian_phone">
              Parent / guardian phone{isMinor ? '' : ' (optional)'}
            </Label>
            <Input
              id="guardian_phone"
              type="tel"
              inputMode="numeric"
              maxLength={13}
              placeholder="07012345678"
              {...register('guardian_phone', {
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  const limit = digits.startsWith('234') ? 13 : 11
                  e.target.value = digits.slice(0, limit)
                  setValue('guardian_phone', e.target.value, { shouldDirty: true })
                },
              })}
            />
            {errors.guardian_phone && (
              <p className="mt-1 text-xs text-destructive">{errors.guardian_phone.message}</p>
            )}
          </div>

          <div className="md:col-span-2 border-t border-border/60 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next of kin (optional)
            </p>
          </div>
          <div>
            <Label htmlFor="next_of_kin_name">Next-of-kin name</Label>
            <Input id="next_of_kin_name" {...register('next_of_kin_name')} />
          </div>
          <div>
            <Label htmlFor="next_of_kin_relationship">Relationship</Label>
            <Select id="next_of_kin_relationship" {...register('next_of_kin_relationship')}>
              <option value="">Select…</option>
              {GUARDIAN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="next_of_kin_phone">Next-of-kin phone</Label>
            <Input
              id="next_of_kin_phone"
              type="tel"
              inputMode="numeric"
              maxLength={13}
              {...register('next_of_kin_phone', {
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  const limit = digits.startsWith('234') ? 13 : 11
                  e.target.value = digits.slice(0, limit)
                  setValue('next_of_kin_phone', e.target.value, { shouldDirty: true })
                },
              })}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Physical forms" description="Upload KYC / sales paperwork (JPG, PNG, PDF)">
        {existingDocuments.length > 0 && (
          <ul className="mb-4 space-y-1.5 text-sm">
            {existingDocuments.map((d) => (
              <li key={d.id}>
                <a
                  href={d.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {d.file_name}
                </a>
                <span className="text-xs text-muted-foreground">
                  {' '}
                  · {d.doc_type.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DocumentUploader value={documents} onChange={setDocuments} />
      </Panel>

      {formError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting || hardMatches.length > 0}>
          {mode === 'edit' ? 'Save changes' : 'Create customer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/customers')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
