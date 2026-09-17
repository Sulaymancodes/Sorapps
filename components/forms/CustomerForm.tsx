'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CloudOff, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { DocumentUploader } from '@/components/documents/DocumentUploader'
import { SoftDuplicateAlert } from '@/components/forms/SoftDuplicateAlert'
import { useOfflineSyncOptional } from '@/components/offline/offline-sync-context'
import {
  DARES_CUSTOMER_CATEGORIES,
  DARES_CUSTOMER_TYPES,
  DARES_GENDERS,
  composeDaresAddress,
} from '@/lib/constants/dares'
import { BUSINESS_TYPES, GUARDIAN_RELATIONSHIPS, NIGERIAN_STATES } from '@/lib/constants/options'
import { getLgasForState } from '@/lib/constants/lgas'
import {
  createCustomerAction,
  scanBeneficiaryDuplicatesAction,
  updateCustomerAction,
} from '@/app/actions/customers'
import {
  upsertCustomerDraft,
  type CustomerDraft,
  type CustomerDraftPayload,
} from '@/lib/offline/customer-drafts'
import type { PendingDocument } from '@/lib/offline/sale-drafts'
import { isBrowserOnline, isLikelyNetworkError } from '@/lib/offline/network'
import type { DuplicateMatch } from '@/lib/services/customers'
import type { Customer, CustomerDocument, CustomerInput, DocumentUploadInput } from '@/lib/types/crm'

type CustomerFormValues = CustomerInput & { documents?: DocumentUploadInput[] }

interface CustomerFormProps {
  customer?: Customer
  existingDocuments?: CustomerDocument[]
  mode?: 'create' | 'edit'
  draft?: CustomerDraft
}

function isCompletePhone(value: string) {
  const d = value.replace(/\D/g, '')
  if (d.startsWith('234')) return d.length === 13
  return d.length === 11 && d.startsWith('0')
}

const DUP_DEBOUNCE_MS = 600

function sourceValue<K extends keyof CustomerInput>(
  customer: Customer | undefined,
  draft: CustomerDraft | undefined,
  key: K,
  fallback: CustomerInput[K]
) {
  const fromCustomer = customer?.[key]
  if (fromCustomer !== undefined && fromCustomer !== null && fromCustomer !== '') {
    return fromCustomer as CustomerInput[K]
  }
  const fromDraft = draft?.payload[key]
  if (fromDraft !== undefined && fromDraft !== null && fromDraft !== '') {
    return fromDraft as CustomerInput[K]
  }
  return fallback
}

export function CustomerForm({
  customer,
  existingDocuments = [],
  mode = 'create',
  draft,
}: CustomerFormProps) {
  const router = useRouter()
  const offline = useOfflineSyncOptional()
  const isOnline = offline?.isOnline ?? true
  const [formError, setFormError] = useState<string | null>(null)
  const [offlineSaved, setOfflineSaved] = useState<string | null>(null)
  const [documents, setDocuments] = useState<PendingDocument[]>(
    draft?.payload.documents ?? []
  )
  const [softMatches, setSoftMatches] = useState<DuplicateMatch[]>([])
  const [hardMatches, setHardMatches] = useState<DuplicateMatch[]>([])
  const [softAcknowledged, setSoftAcknowledged] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    defaultValues: {
      name: sourceValue(customer, draft, 'name', ''),
      email: sourceValue(customer, draft, 'email', ''),
      phone: sourceValue(customer, draft, 'phone', ''),
      nin: sourceValue(customer, draft, 'nin', ''),
      bvn: sourceValue(customer, draft, 'bvn', ''),
      address: sourceValue(customer, draft, 'address', ''),
      address_house_number: sourceValue(customer, draft, 'address_house_number', ''),
      address_building_features: sourceValue(customer, draft, 'address_building_features', ''),
      address_street: sourceValue(customer, draft, 'address_street', ''),
      address_landmark: sourceValue(customer, draft, 'address_landmark', ''),
      city: sourceValue(customer, draft, 'city', ''),
      state: sourceValue(customer, draft, 'state', ''),
      lga: sourceValue(customer, draft, 'lga', ''),
      business_type: sourceValue(customer, draft, 'business_type', BUSINESS_TYPES[0]),
      gender: sourceValue(customer, draft, 'gender', ''),
      customer_category: sourceValue(customer, draft, 'customer_category', ''),
      customer_type: sourceValue(customer, draft, 'customer_type', ''),
      alternate_phone: sourceValue(customer, draft, 'alternate_phone', ''),
      credit_limit: sourceValue(customer, draft, 'credit_limit', 500000),
      is_minor: sourceValue(customer, draft, 'is_minor', false),
      guardian_name: sourceValue(customer, draft, 'guardian_name', ''),
      guardian_phone: sourceValue(customer, draft, 'guardian_phone', ''),
      guardian_relationship: sourceValue(customer, draft, 'guardian_relationship', ''),
      next_of_kin_name: sourceValue(customer, draft, 'next_of_kin_name', ''),
      next_of_kin_phone: sourceValue(customer, draft, 'next_of_kin_phone', ''),
      next_of_kin_relationship: sourceValue(customer, draft, 'next_of_kin_relationship', ''),
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
  const watchedHouseNumber = useWatch({ control, name: 'address_house_number' }) || ''
  const watchedBuildingFeatures = useWatch({ control, name: 'address_building_features' }) || ''
  const watchedStreet = useWatch({ control, name: 'address_street' }) || ''
  const watchedLandmark = useWatch({ control, name: 'address_landmark' }) || ''
  const watchedGuardianPhone = useWatch({ control, name: 'guardian_phone' }) || ''

  const composedAddress = useMemo(
    () =>
      composeDaresAddress({
        house_number: watchedHouseNumber,
        building_features: watchedBuildingFeatures,
        street: watchedStreet,
        landmark: watchedLandmark,
        fallback: customer?.address || '',
      }),
    [
      watchedHouseNumber,
      watchedBuildingFeatures,
      watchedStreet,
      watchedLandmark,
      customer?.address,
    ]
  )

  const stateOptions = (() => {
    if (selectedState && !(NIGERIAN_STATES as readonly string[]).includes(selectedState)) {
      return [selectedState, ...NIGERIAN_STATES] as string[]
    }
    return NIGERIAN_STATES as unknown as string[]
  })()

  const lgaOptions = useMemo(() => getLgasForState(selectedState || ''), [selectedState])

  useEffect(() => {
    if (!isOnline) return
    const name = watchedName.trim()
    const timer = window.setTimeout(() => {
      void (async () => {
        if (name.length < 3 && !watchedPhone && !watchedNin && !watchedBvn) {
          setSoftMatches([])
          setHardMatches([])
          return
        }
        try {
          const result = await scanBeneficiaryDuplicatesAction({
            name: name.length >= 3 ? name : undefined,
            phone: watchedPhone || watchedGuardianPhone || undefined,
            nin: watchedNin || undefined,
            bvn: watchedBvn || undefined,
            city: watchedCity || undefined,
            state: selectedState || undefined,
            lga: selectedLga || undefined,
            address: composedAddress || undefined,
            exclude_id: customer?.id || draft?.remoteId,
          })
          if (!result.success) return
          setSoftMatches(result.data.soft)
          setHardMatches(result.data.hard)
          if (!result.data.soft.length) setSoftAcknowledged(false)
        } catch {
          // Duplicate scan requires the network; ignore while unreachable.
        }
      })()
    }, DUP_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [
    watchedName,
    watchedPhone,
    watchedNin,
    watchedBvn,
    watchedCity,
    composedAddress,
    selectedState,
    selectedLga,
    watchedGuardianPhone,
    customer?.id,
    draft?.remoteId,
    isOnline,
  ])

  async function saveDraft(payload: CustomerDraftPayload) {
    const saved = await upsertCustomerDraft({
      localId: draft?.localId,
      mode: draft?.mode ?? (mode === 'edit' && customer ? 'edit' : 'create'),
      remoteId: draft?.remoteId ?? customer?.id,
      payload,
      status: 'pending',
      syncError: null,
    })
    await offline?.refreshDrafts()
    return saved
  }

  const onSubmit = async (values: CustomerFormValues) => {
    setFormError(null)
    setOfflineSaved(null)
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

    if (!(values.address_building_features || '').trim()) {
      setError('address_building_features', { message: 'Enter building features' })
      return
    }
    if (!(values.address_street || '').trim()) {
      setError('address_street', { message: 'Enter a street' })
      return
    }
    if (!(values.address_landmark || '').trim()) {
      setError('address_landmark', { message: 'Enter a landmark' })
      return
    }
    if (!values.city.trim()) {
      setError('city', { message: 'Enter a city' })
      return
    }
    if (
      !values.state.trim() ||
      (!(NIGERIAN_STATES as readonly string[]).includes(values.state) &&
        values.state !== customer?.state &&
        values.state !== draft?.payload.state)
    ) {
      setError('state', { message: 'Select a Nigerian state' })
      return
    }

    const composed = composeDaresAddress({
      house_number: values.address_house_number,
      building_features: values.address_building_features,
      street: values.address_street,
      landmark: values.address_landmark,
    })

    const customerType = (values.customer_type || '').trim()

    const payload: CustomerDraftPayload = {
      ...values,
      name: values.name.trim(),
      email: values.email?.trim() || '',
      phone: (values.phone || '').trim(),
      nin: values.nin?.trim() || '',
      bvn: values.bvn?.trim() || '',
      address: '',
      address_house_number: (values.address_house_number || '').trim(),
      address_building_features: (values.address_building_features || '').trim(),
      address_street: (values.address_street || '').trim(),
      address_landmark: (values.address_landmark || '').trim(),
      city: values.city.trim(),
      lga: values.lga?.trim() || '',
      gender: (values.gender || '').trim(),
      customer_category: (values.customer_category || '').trim(),
      customer_type: customerType,
      business_type: customerType || values.business_type,
      alternate_phone: (values.alternate_phone || '').trim(),
      credit_limit: Number(values.credit_limit) || 0,
      is_minor: Boolean(values.is_minor),
      guardian_name: (values.guardian_name || '').trim(),
      guardian_phone: (values.guardian_phone || '').trim(),
      guardian_relationship: (values.guardian_relationship || '').trim(),
      next_of_kin_name: (values.next_of_kin_name || '').trim(),
      next_of_kin_phone: (values.next_of_kin_phone || '').trim(),
      next_of_kin_relationship: (values.next_of_kin_relationship || '').trim(),
      documents: documents.filter((d) => d.file_url).length
        ? (documents.filter((d) => d.file_url) as DocumentUploadInput[])
        : undefined,
    }

    const queueOffline = async (message: string) => {
      try {
        await saveDraft(payload)
        setOfflineSaved(message)
        if (!draft && mode === 'create') {
          reset()
          setDocuments([])
        }
      } catch {
        setFormError(
          'Could not save this customer on this device. Check that browser storage is available and try again.'
        )
      }
    }

    const online = isOnline && isBrowserOnline()
    if (!online) {
      await queueOffline(
        'Saved on this device. It will sync automatically when you are back online, or tap Sync now in the header.'
      )
      return
    }

    try {
      const scan = await scanBeneficiaryDuplicatesAction({
        name: values.name.trim(),
        phone: values.phone || values.guardian_phone,
        nin: values.nin,
        bvn: values.bvn,
        city: values.city,
        state: values.state,
        lga: values.lga,
        address: composed,
        exclude_id: customer?.id || draft?.remoteId,
      })
      if (!scan.success) {
        if (isLikelyNetworkError(scan.error)) {
          await queueOffline(
            'No network while checking duplicates. Customer saved as a draft and will sync later.'
          )
          return
        }
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
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        await queueOffline(
          'No network while checking duplicates. Customer saved as a draft and will sync later.'
        )
        return
      }
      setFormError(error instanceof Error ? error.message : 'Could not check duplicates')
      return
    }

    try {
      const actionPayload = payload as Parameters<typeof createCustomerAction>[0]
      const result =
        (draft?.mode ?? mode) === 'edit' && (customer || draft?.remoteId)
          ? await updateCustomerAction(customer?.id || draft!.remoteId!, actionPayload)
          : await createCustomerAction(actionPayload)

      if (!result.success) {
        if (isLikelyNetworkError(result.error)) {
          await queueOffline(
            'No network while saving. Customer saved as a draft and will sync later.'
          )
          return
        }
        setFormError(result.error)
        return
      }

      if (draft?.localId) {
        await offline?.removeDraft(draft.localId)
      }

      if (mode === 'edit' || draft?.mode === 'edit') {
        router.push('/customers')
      } else {
        router.push(`/customers?created=${result.data.id}`)
      }
      router.refresh()
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        await queueOffline(
          'No network while saving. Customer saved as a draft and will sync later.'
        )
        return
      }
      setFormError(error instanceof Error ? error.message : 'Failed to save customer')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {!isOnline && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <p>
            You are offline. This customer will be saved as a draft on this device and synced when
            the network returns.
          </p>
        </div>
      )}

      {draft && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <CloudOff className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Editing a local draft
            {draft.status === 'failed' && draft.syncError ? ` — ${draft.syncError}` : ''}. Save
            again to update it, or sync from the header when you are online.
          </p>
        </div>
      )}

      {offlineSaved && (
        <div className="rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p>{offlineSaved}</p>
          <Link
            href="/customers/drafts"
            className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline"
          >
            View drafts
          </Link>
        </div>
      )}
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
            <Label htmlFor="alternate_phone">Alternate phone</Label>
            <Input
              id="alternate_phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              placeholder="07012345678"
              {...register('alternate_phone', {
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  const limit = digits.startsWith('234') ? 13 : 11
                  e.target.value = digits.slice(0, limit)
                  setValue('alternate_phone', e.target.value, { shouldDirty: true })
                },
              })}
            />
          </div>

          <div>
            <Label htmlFor="gender">Gender</Label>
            <Select id="gender" {...register('gender')}>
              <option value="">Select…</option>
              {DARES_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="customer_category">Customer category</Label>
            <Select id="customer_category" {...register('customer_category')}>
              <option value="">Select…</option>
              {DARES_CUSTOMER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="customer_type">Customer type</Label>
            <Select id="customer_type" {...register('customer_type')}>
              <option value="">Select…</option>
              {DARES_CUSTOMER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
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

          <div>
            <Label htmlFor="address_house_number">House number (optional)</Label>
            <Input
              id="address_house_number"
              placeholder="e.g. 12A"
              {...register('address_house_number')}
            />
          </div>

          <div>
            <Label htmlFor="address_building_features">Building features</Label>
            <Input
              id="address_building_features"
              placeholder="e.g. White bungalow with blue gate"
              {...register('address_building_features')}
            />
            {errors.address_building_features && (
              <p className="mt-1 text-xs text-destructive">
                {errors.address_building_features.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="address_street">Street</Label>
            <Input
              id="address_street"
              placeholder="e.g. Adeola Odeku Street"
              {...register('address_street')}
            />
            {errors.address_street && (
              <p className="mt-1 text-xs text-destructive">{errors.address_street.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="address_landmark">Landmark</Label>
            <Input
              id="address_landmark"
              placeholder="e.g. Near First Bank"
              {...register('address_landmark')}
            />
            {errors.address_landmark && (
              <p className="mt-1 text-xs text-destructive">{errors.address_landmark.message}</p>
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
        {!isOnline && (
          <p className="mb-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
            Document uploads need a connection. Save the customer draft now and attach files after
            you reconnect.
          </p>
        )}
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
        <Button type="submit" disabled={isSubmitting || (isOnline && hardMatches.length > 0)}>
          {!isOnline
            ? draft
              ? 'Update draft'
              : 'Save draft offline'
            : draft
              ? 'Save and sync'
              : mode === 'edit'
                ? 'Save changes'
                : 'Create customer'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(draft ? '/customers/drafts' : '/customers')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
