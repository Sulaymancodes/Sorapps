'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  Search,
  Lock,
  Unlock,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { SiteVerificationPanel } from '@/components/forms/SiteVerificationPanel'
import { SerialBarcodeField } from '@/components/forms/SerialBarcodeField'
import {
  DARES_CUSTOMER_CATEGORIES,
  DARES_CUSTOMER_TYPES,
  DARES_GENDERS,
} from '@/lib/constants/dares'
import { GUARDIAN_RELATIONSHIPS, NIGERIAN_STATES } from '@/lib/constants/options'
import { addLocalDays, toDateInputValue, todayInLagos } from '@/lib/paygo/schedule'
import { getLgasForState } from '@/lib/constants/lgas'
import { checkSoldSerialsAction, createSaleAction, updateSaleAction } from '@/app/actions/sales'
import { resolveUnlockPinAction } from '@/app/actions/unlocks'
import {
  checkCustomerDuplicateAction,
  scanBeneficiaryDuplicatesAction,
} from '@/app/actions/customers'
import { SoftDuplicateAlert } from '@/components/forms/SoftDuplicateAlert'
import { OfflineDraftSavedModal } from '@/components/offline/OfflineDraftSavedModal'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'
import {
  deleteSaleDraft,
  getSaleDraft,
  upsertSaleDraft,
  type PendingDocument,
  type SaleDraftFormValues,
} from '@/lib/offline/sale-drafts'
import { isBrowserOnline, isLikelyNetworkError } from '@/lib/offline/network'
import { uploadPendingDocuments, uploadSitePhotoFile } from '@/lib/offline/upload-blobs'
import { parseDeviceSerials, serialLookupKey, sameSerialKey, soldSerialMessage } from '@/lib/utils/serial'
import {
  checkSerialsAgainstLocalPool,
  pinsForSaleSerials,
  reserveUnlocksForDraft,
  consumeUnlocksLocally,
  type CachedUnlock,
} from '@/lib/offline/unlock-pool'
import { refreshUnlockPoolSnapshot } from '@/lib/offline/sync-unlock-pool'
import type { DuplicateMatch as SoftDuplicateMatch } from '@/lib/services/customers'
import type {
  Customer,
  PaymentType,
  Product,
  Sale,
  SaleSiteGpsInput,
} from '@/lib/types/crm'

type DuplicateField = 'phone' | 'nin'
type DuplicateMatch = {
  id: string
  name: string
  phone: string
  nin: string
  bvn: string
  city: string
  state: string
}

/** NIN (NIMC) is 11 digits. */
const NIN_DIGITS = 11
/** Local Nigerian mobile: 0 + 10 digits. International: 234 + 10 digits. */
const PHONE_LOCAL_DIGITS = 11
const PHONE_INTL_DIGITS = 13
const UNIQUE_CHECK_DEBOUNCE_MS = 600

function localSerialProblem(serials: string[]) {
  const seen = new Set<string>()
  for (const serial of serials) {
    const key = serialLookupKey(serial)
    if (!key) return 'Enter a device serial number for every unit'
    if (seen.has(key)) return `Serial number is repeated on this sale: ${serial}`
    seen.add(key)
  }
  return null
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function maxDigitsForField(field: DuplicateField, digits: string): number {
  if (field === 'nin') return NIN_DIGITS
  if (digits.startsWith('234')) return PHONE_INTL_DIGITS
  return PHONE_LOCAL_DIGITS
}

function isCompletePhone(value: string) {
  const digits = digitsOnly(value)
  if (digits.startsWith('234') && digits.length === PHONE_INTL_DIGITS) return true
  if (digits.startsWith('0') && digits.length === PHONE_LOCAL_DIGITS) return true
  if (digits.length === 10 && /^[789]/.test(digits)) return true
  return false
}

function isCompleteUniqueValue(field: DuplicateField, value: string) {
  const digits = digitsOnly(value)
  if (field === 'nin') return digits.length === NIN_DIGITS
  return isCompletePhone(value)
}

function uniqueFieldHint(field: DuplicateField) {
  if (field === 'nin') return `Exactly ${NIN_DIGITS} digits — search runs when complete`
  return `Exactly ${PHONE_LOCAL_DIGITS} digits (e.g. 0701xxxxxxx) — search runs when complete`
}

function uniqueFieldIncompleteMessage(field: DuplicateField) {
  if (field === 'nin') return `NIN must be exactly ${NIN_DIGITS} digits`
  return `Phone must be exactly ${PHONE_LOCAL_DIGITS} digits starting with 0`
}

const GEO_LOCK_KEY = 'sorapps-geo-lock'
const PRODUCT_LOCK_KEY = 'sorapps-product-lock'

type GeoLock = {
  locked: boolean
  state: string
  lga: string
}

type ProductLock = {
  locked: boolean
  product_id: string
  quantity: number
}

type CustomerMode = 'existing' | 'new'

type LineUnlockPin = {
  serial: string
  pin: string
  kind: 'partial' | 'full'
  day_token: string
  reused: boolean
}

type SaleFormValues = {
  customer_mode: CustomerMode
  customer_id: string
  new_customer: {
    name: string
    email: string
    phone: string
    alternate_phone: string
    nin: string
    bvn: string
    address: string
    address_house_number: string
    address_building_features: string
    address_street: string
    address_landmark: string
    city: string
    state: string
    lga: string
    business_type: string
    gender: string
    customer_category: string
    customer_type: string
    is_minor: boolean
    guardian_name: string
    guardian_phone: string
    guardian_relationship: string
    next_of_kin_name: string
    next_of_kin_phone: string
    next_of_kin_relationship: string
  }
  payment_type: PaymentType
  payment_method: 'bank_transfer' | 'cash' | 'cheque' | 'card'
  installment_interval_days: number
  plan_end_date: string
  discount_percent: number
  transport_cost: number
  notes: string
  dares_type_of_payment: string
  dares_payment_plan: string
  retail_cost_ngn: number
  cost_to_end_user_ngn: number
  downpayment_amount_ngn: number
  items: { product_id: string; quantity: number; serial_number: string }[]
}

function daresClaimFromSale(
  paymentType: PaymentType,
  paymentMethod: SaleFormValues['payment_method'],
  productTotal: number
) {
  const total = Math.max(1, Math.round(productTotal) || 1)
  return {
    dares_type_of_payment:
      paymentType === 'installment'
        ? 'PAYGO'
        : paymentMethod === 'bank_transfer'
          ? 'Bank Transfer'
          : paymentMethod === 'cash'
            ? 'Cash'
            : 'Other',
    dares_payment_plan: paymentType === 'full' ? 'Full Payment' : 'Custom Installment',
    retail_cost_ngn: total,
    cost_to_end_user_ngn: total,
    downpayment_amount_ngn: paymentType === 'full' ? total : 0,
  }
}

function emptyCustomerValues(): SaleFormValues['new_customer'] {
  return {
    name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    nin: '',
    bvn: '',
    address: '',
    address_house_number: '',
    address_building_features: '',
    address_street: '',
    address_landmark: '',
    city: '',
    state: '',
    lga: '',
    business_type: DARES_CUSTOMER_TYPES[0],
    gender: '',
    customer_category: '',
    customer_type: DARES_CUSTOMER_TYPES[0],
    is_minor: false,
    guardian_name: '',
    guardian_phone: '',
    guardian_relationship: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_relationship: '',
  }
}

function customerToFormValues(customer?: Customer | null): SaleFormValues['new_customer'] {
  if (!customer) return emptyCustomerValues()
  return {
    name: customer.name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    alternate_phone: customer.alternate_phone || '',
    nin: digitsOnly(customer.nin || ''),
    bvn: customer.bvn || '',
    address: customer.address || '',
    address_house_number: customer.address_house_number || '',
    address_building_features: customer.address_building_features || '',
    address_street: customer.address_street || '',
    address_landmark: customer.address_landmark || '',
    city: customer.city || '',
    state: customer.state || '',
    lga: customer.lga || '',
    business_type: customer.business_type || DARES_CUSTOMER_TYPES[0],
    gender: customer.gender || '',
    customer_category: customer.customer_category || '',
    customer_type: customer.customer_type || customer.business_type || DARES_CUSTOMER_TYPES[0],
    is_minor: Boolean(customer.is_minor),
    guardian_name: customer.guardian_name || '',
    guardian_phone: customer.guardian_phone || '',
    guardian_relationship: customer.guardian_relationship || '',
    next_of_kin_name: customer.next_of_kin_name || '',
    next_of_kin_phone: customer.next_of_kin_phone || '',
    next_of_kin_relationship: customer.next_of_kin_relationship || '',
  }
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

type FieldDupState = {
  checking: boolean
  matches: DuplicateMatch[]
}

function emptyDup(): FieldDupState {
  return { checking: false, matches: [] }
}

function DuplicateHint({
  field,
  state,
}: {
  field: DuplicateField
  state: FieldDupState
}) {
  if (state.checking) {
    return <p className="mt-1 text-xs text-muted-foreground">Checking {field.toUpperCase()}…</p>
  }
  if (!state.matches.length) return null
  return (
    <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
      <p className="font-medium">Duplicate {field.toUpperCase()} found</p>
      <ul className="mt-1 space-y-0.5">
        {state.matches.slice(0, 3).map((m) => (
          <li key={m.id}>
            {m.name} · {m.phone}
            {m.city ? ` · ${m.city}` : ''}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-destructive/80">Change this value before submitting.</p>
    </div>
  )
}

function UniqueField({
  field,
  label,
  placeholder,
  dup,
  value,
  error,
  onChange,
  onSearch,
}: {
  field: DuplicateField
  label: string
  placeholder: string
  dup: FieldDupState
  value: string
  error?: string
  onChange: (next: string) => void
  onSearch: () => void
}) {
  const complete = isCompleteUniqueValue(field, value)
  const maxLen = maxDigitsForField(field, digitsOnly(value))

  return (
    <div>
      <Label htmlFor={`new_customer.${field}`}>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={`new_customer.${field}`}
          name={`new_customer.${field}`}
          value={value}
          placeholder={placeholder}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={maxLen}
          onChange={(e) => {
            const digits = digitsOnly(e.target.value)
            const limit = maxDigitsForField(field, digits)
            onChange(digits.slice(0, limit))
          }}
          onPaste={(e) => {
            e.preventDefault()
            const pasted = digitsOnly(e.clipboardData.getData('text'))
            const limit = maxDigitsForField(field, pasted)
            onChange(pasted.slice(0, limit))
          }}
          className={cn(dup.matches.length > 0 && 'border-destructive')}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={`Search ${label} for duplicates`}
          disabled={dup.checking || !complete}
          title={complete ? `Check ${label} for duplicates` : uniqueFieldHint(field)}
          onClick={onSearch}
        >
          <Search className="size-4" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{uniqueFieldHint(field)}</p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <DuplicateHint field={field} state={dup} />
    </div>
  )
}

function readGeoLock(): GeoLock {
  if (typeof window === 'undefined') {
    return { locked: false, state: '', lga: '' }
  }
  try {
    const raw = localStorage.getItem(GEO_LOCK_KEY)
    if (!raw) return { locked: false, state: '', lga: '' }
    const parsed = JSON.parse(raw) as GeoLock
    return {
      locked: Boolean(parsed.locked),
      state: parsed.state || '',
      lga: parsed.lga || '',
    }
  } catch {
    return { locked: false, state: '', lga: '' }
  }
}

function writeGeoLock(lock: GeoLock) {
  localStorage.setItem(GEO_LOCK_KEY, JSON.stringify(lock))
}

function readProductLock(): ProductLock {
  if (typeof window === 'undefined') {
    return { locked: false, product_id: '', quantity: 1 }
  }
  try {
    const raw = localStorage.getItem(PRODUCT_LOCK_KEY)
    if (!raw) return { locked: false, product_id: '', quantity: 1 }
    const parsed = JSON.parse(raw) as ProductLock
    return {
      locked: Boolean(parsed.locked),
      product_id: parsed.product_id || '',
      quantity: Math.max(1, Number(parsed.quantity) || 1),
    }
  } catch {
    return { locked: false, product_id: '', quantity: 1 }
  }
}

function writeProductLock(lock: ProductLock) {
  localStorage.setItem(PRODUCT_LOCK_KEY, JSON.stringify(lock))
}

export function SaleForm({
  customers: _customers,
  products,
  forcedGeo,
  draftId,
  mode = 'create',
  sale,
  customer,
  initialItems,
  showMoney = true,
}: {
  customers: Customer[]
  products: Product[]
  /** When set (agent territory), state/LGA are locked and cannot be changed. */
  forcedGeo?: { state: string; lga: string } | null
  draftId?: string
  mode?: 'create' | 'edit'
  sale?: Sale
  customer?: Customer
  initialItems?: { product_id: string; quantity: number; serial_number: string }[]
  showMoney?: boolean
}) {
  const router = useRouter()
  const isEdit = mode === 'edit' && Boolean(sale)
  const [geoLocked, setGeoLocked] = useState(false)
  const [productLocked, setProductLocked] = useState(false)
  const [siteGps, setSiteGps] = useState<SaleSiteGpsInput | null>(() => {
    if (!sale || sale.latitude == null || sale.longitude == null) return null
    const captured = asDate(sale.gps_captured_at) || asDate(sale.date)
    return {
      latitude: Number(sale.latitude),
      longitude: Number(sale.longitude),
      captured_at: captured?.toISOString() || new Date().toISOString(),
      locked: true,
      out_of_area: Boolean(sale.gps_out_of_area),
    }
  })
  const [sitePhotoFile, setSitePhotoFile] = useState<File | null>(null)
  const [siteError, setSiteError] = useState<string | null>(null)
  const [dupPhone, setDupPhone] = useState<FieldDupState>(emptyDup)
  const [dupNin, setDupNin] = useState<FieldDupState>(emptyDup)
  const [softMatches, setSoftMatches] = useState<SoftDuplicateMatch[]>([])
  const [softAcknowledged, setSoftAcknowledged] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<PendingDocument[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(draftId)
  const [draftSavedOpen, setDraftSavedOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [linePins, setLinePins] = useState<Record<number, LineUnlockPin>>(() => {
    const serial = (initialItems?.[0]?.serial_number || '').split(/[,\n]/)[0]?.trim() || ''
    if (!sale?.unlock_pin || !serial) return {} as Record<number, LineUnlockPin>
    return {
      0: {
        serial,
        pin: sale.unlock_pin,
        kind: sale.payment_type === 'full' ? 'full' : 'partial',
        day_token: sale.payment_type === 'full' ? 'Full' : `${sale.installment_interval_days || 7}Days`,
        reused: true,
      },
    }
  })
  const [activateError, setActivateError] = useState<Record<number, string>>({})
  const [activatingIndex, setActivatingIndex] = useState<number | null>(null)
  const [serialSoldError, setSerialSoldError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    defaultValues: {
      customer_mode: 'new',
      customer_id: customer?.id || '',
      new_customer: customerToFormValues(customer),
      payment_type: 'full',
      payment_method: sale?.payment_method || 'cash',
      installment_interval_days: sale?.installment_interval_days || 7,
      plan_end_date: sale?.plan_end_date
        ? toDateInputValue(asDate(sale.plan_end_date) || addLocalDays(todayInLagos(), 28))
        : toDateInputValue(addLocalDays(todayInLagos(), 28)),
      discount_percent: sale?.discount_percent || 0,
      transport_cost: sale?.transport_cost || 0,
      notes: sale?.notes || '',
      dares_type_of_payment: sale?.dares_type_of_payment || '',
      dares_payment_plan: sale?.dares_payment_plan || 'Full Payment',
      retail_cost_ngn: sale?.retail_cost_ngn || 0,
      cost_to_end_user_ngn: sale?.cost_to_end_user_ngn || 0,
      downpayment_amount_ngn: sale?.downpayment_amount_ngn || 0,
      items:
        initialItems && initialItems.length
          ? initialItems.map((item) => ({
              product_id: item.product_id,
              quantity: item.quantity || 1,
              serial_number: item.serial_number || '',
            }))
          : [{ product_id: '', quantity: 1, serial_number: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })
  const selectedState = useWatch({ control, name: 'new_customer.state' }) || ''
  const selectedLga = useWatch({ control, name: 'new_customer.lga' }) || ''
  const firstProductId = watchedItems?.[0]?.product_id || ''
  const unlockKind = 'full' as const
  const unlockLabel = 'full unlock'

  const deploymentState = selectedState
  const deploymentLga = selectedLga

  const inStockProducts = useMemo(() => {
    const onSale = new Set((initialItems || []).map((item) => item.product_id).filter(Boolean))
    return products
      .filter(
        (p) => p.stock > 0 || onSale.has(p.id) || (productLocked && p.id === firstProductId)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, productLocked, firstProductId, initialItems])

  useEffect(() => {
    if (isEdit) return
    if (forcedGeo?.state && forcedGeo?.lga) {
      setGeoLocked(true)
      setValue('new_customer.state', forcedGeo.state)
      setValue('new_customer.lga', forcedGeo.lga)
      writeGeoLock({ locked: true, state: forcedGeo.state, lga: forcedGeo.lga })
      return
    }
    const lock = readGeoLock()
    if (lock.locked && lock.state) {
      setGeoLocked(true)
      setValue('new_customer.state', lock.state)
      setValue('new_customer.lga', lock.lga)
    }
    const productLock = readProductLock()
    if (productLock.locked && productLock.product_id) {
      setProductLocked(true)
      setValue('items', [
        {
          product_id: productLock.product_id,
          quantity: productLock.quantity,
          serial_number: '',
        },
      ])
    }
  }, [setValue, forcedGeo, isEdit])

  const lgaOptions = useMemo(() => getLgasForState(selectedState), [selectedState])

  const stateOptions = useMemo(() => {
    if (selectedState && !(NIGERIAN_STATES as readonly string[]).includes(selectedState)) {
      return [selectedState, ...NIGERIAN_STATES] as string[]
    }
    return NIGERIAN_STATES as unknown as string[]
  }, [selectedState])

  const hasDuplicates = dupPhone.matches.length > 0 || dupNin.matches.length > 0

  const totals = useMemo(() => {
    const subtotal = (watchedItems || []).reduce((sum, line) => {
      const product = products.find((p) => p.id === line.product_id)
      const qty = Number(line.quantity) || 0
      return sum + (product?.price || 0) * qty
    }, 0)
    return { subtotal, total: Math.round(subtotal) }
  }, [watchedItems, products])

  useEffect(() => {
    setIsOnline(isBrowserOnline())
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (isEdit) return
    if (!draftId) return
    void getSaleDraft(draftId).then((draft) => {
      if (!draft) return
      setActiveDraftId(draft.localId)
      reset(draft.values)
      setSiteGps(draft.siteGps)
      const photo = draft.sitePhoto as File | Blob | null | undefined
      setSitePhotoFile(
        photo instanceof File
          ? photo
          : photo
            ? new File([photo], 'site.jpg', { type: photo.type || 'image/jpeg' })
            : null
      )
      setDocuments(
        (draft.documents || []).map((doc) => {
          if (doc.file && !(doc.file instanceof File)) {
            return {
              ...doc,
              file: new File([doc.file], doc.file_name, { type: doc.content_type }),
            }
          }
          return doc
        })
      )
    })
  }, [draftId, reset])

  const clearFieldError = useCallback(
    (field: DuplicateField) => {
      clearErrors(`new_customer.${field}`)
    },
    [clearErrors]
  )

  const runDuplicateCheck = useCallback(
    async (field: DuplicateField, opts?: { silentIncomplete?: boolean }) => {
      const values = getValues('new_customer')
      const raw = values[field]?.trim() || ''
      const value = field === 'phone' ? raw : digitsOnly(raw)
      const setDup = field === 'phone' ? setDupPhone : setDupNin

      if (!isCompleteUniqueValue(field, value)) {
        setDup(emptyDup())
        if (!opts?.silentIncomplete && value) {
          setError(`new_customer.${field}`, { message: uniqueFieldIncompleteMessage(field) })
        }
        return
      }

      setDup({ checking: true, matches: [] })
      const result = await checkCustomerDuplicateAction({
        phone: field === 'phone' ? value : undefined,
        nin: field === 'nin' ? value : undefined,
        exclude_id: customer?.id,
      })

      if (!result.success) {
        setDup(emptyDup())
        setFormError(result.error)
        return
      }

      const hit = result.data.find((d) => d.field === field)
      setDup({ checking: false, matches: hit?.matches ?? [] })
      if (hit?.matches.length) {
        setError(`new_customer.${field}`, {
          message: `Duplicate ${field.toUpperCase()} — already used by ${hit.matches[0].name}`,
        })
      } else {
        clearErrors(`new_customer.${field}`)
      }
    },
    [getValues, setError, clearErrors, customer?.id]
  )

  const clearFieldDup = (field: DuplicateField) => {
    if (field === 'phone') setDupPhone(emptyDup())
    if (field === 'nin') setDupNin(emptyDup())
    clearFieldError(field)
  }

  const phoneValue = useWatch({ control, name: 'new_customer.phone' }) || ''
  const ninValue = useWatch({ control, name: 'new_customer.nin' }) || ''
  const customerNameValue = useWatch({ control, name: 'new_customer.name' }) || ''
  const customerCityValue = useWatch({ control, name: 'new_customer.city' }) || ''
  const isMinor = useWatch({ control, name: 'new_customer.is_minor' })
  const guardianPhoneValue = useWatch({ control, name: 'new_customer.guardian_phone' }) || ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isCompleteUniqueValue('phone', phoneValue)) {
        void runDuplicateCheck('phone', { silentIncomplete: true })
      } else {
        setDupPhone(emptyDup())
      }
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [phoneValue, runDuplicateCheck])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isCompleteUniqueValue('nin', ninValue)) {
        void runDuplicateCheck('nin', { silentIncomplete: true })
      } else {
        setDupNin(emptyDup())
      }
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [ninValue, runDuplicateCheck])

  useEffect(() => {
    const name = customerNameValue.trim()
    if (name.length < 3) {
      setSoftMatches([])
      setSoftAcknowledged(false)
      return
    }

    const serials = (watchedItems || [])
      .flatMap((item) => (item.serial_number || '').split(/[\s,;]+/))
      .map((s) => s.trim())
      .filter(Boolean)

    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await scanBeneficiaryDuplicatesAction({
          name,
          phone: phoneValue || guardianPhoneValue || undefined,
          nin: ninValue || undefined,
          city: customerCityValue || undefined,
          state: selectedState || undefined,
          lga: selectedLga || undefined,
          serial: serials.length ? serials : undefined,
          exclude_id: customer?.id,
          exclude_sale_id: sale?.id,
        }).catch(() => ({ success: false as const, error: 'scan failed' }))
        if (!result.success) return
        setSoftMatches(result.data.soft)
        if (!result.data.soft.length) setSoftAcknowledged(false)
      })()
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [
    customerNameValue,
    customerCityValue,
    selectedState,
    selectedLga,
    phoneValue,
    guardianPhoneValue,
    ninValue,
    watchedItems,
  ])

  useEffect(() => {
    const serials = parseDeviceSerials((watchedItems || []).map((item) => item.serial_number))
    const localProblem = serials.length ? localSerialProblem(serials) : null
    if (localProblem) {
      setSerialSoldError(localProblem)
      return
    }
    if (!serials.length) {
      setSerialSoldError(null)
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const local = await checkSerialsAgainstLocalPool(serials, activeDraftId).catch(() => ({}) as {
          error?: string
          unlock?: CachedUnlock
        })
        if (local.error) {
          setSerialSoldError(local.error)
          return
        }

        if (local.unlock) {
          const firstIndex = (watchedItems || []).findIndex((item) =>
            sameSerialKey(item.serial_number || '', local.unlock!.serial_number)
          )
          if (firstIndex >= 0) {
            setLinePins((current) => ({
              ...current,
              [firstIndex]: {
                serial: local.unlock!.serial_number,
                pin: local.unlock!.pin,
                kind: local.unlock!.kind,
                day_token: local.unlock!.day_token,
                reused: true,
              },
            }))
          }
        }

        if (!isBrowserOnline()) {
          setSerialSoldError(null)
          return
        }
        const result = await checkSoldSerialsAction(serials, sale?.id).catch(() => ({
          success: false as const,
          error: 'check failed',
        }))
        if (!result.success) return
        setSerialSoldError(result.data.hits[0] ? soldSerialMessage(result.data.hits[0]) : null)
      })()
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [watchedItems, activeDraftId])

  const toggleGeoLock = () => {
    if (forcedGeo?.state) return
    const state = getValues('new_customer.state')
    const lga = getValues('new_customer.lga')
    if (!geoLocked) {
      if (!state.trim()) {
        setError('new_customer.state', { message: 'Select a state before locking' })
        return
      }
      if (!lga.trim()) {
        setError('new_customer.lga', { message: 'Select an LGA before locking' })
        return
      }
      writeGeoLock({ locked: true, state, lga })
      setGeoLocked(true)
      return
    }
    writeGeoLock({ locked: false, state, lga })
    setGeoLocked(false)
  }

  const toggleProductLock = () => {
    const items = getValues('items')
    const productId = items[0]?.product_id || ''
    const quantity = Math.max(1, Number(items[0]?.quantity) || 1)
    if (!productLocked) {
      if (!productId.trim()) {
        setError('items', { message: 'Select a product before locking' })
        return
      }
      // Keep a single locked product line for queue entry
      setValue('items', [
        {
          product_id: productId,
          quantity,
          serial_number: items[0]?.serial_number || '',
        },
      ])
      writeProductLock({ locked: true, product_id: productId, quantity })
      setProductLocked(true)
      return
    }
    writeProductLock({ locked: false, product_id: productId, quantity })
    setProductLocked(false)
  }

  async function saveSaleAsDraft(values: SaleFormValues) {
    if (!siteGps?.locked || !sitePhotoFile) {
      throw new Error('Unit photo and GPS are required')
    }
    const customerName = values.new_customer.name.trim()
    const serials = parseDeviceSerials(values.items.map((item) => item.serial_number))
    const pins = await pinsForSaleSerials(serials)
    const unlockPin =
      Object.values(linePins).find((row) => sameSerialKey(row.serial, serials[0] || ''))?.pin ||
      pins[0]?.pin
    const saved = await upsertSaleDraft({
      localId: activeDraftId,
      label: customerName,
      values: { ...(values as SaleDraftFormValues), unlock_pin: unlockPin },
      siteGps,
      sitePhoto: sitePhotoFile,
      documents,
      status: 'pending',
      syncError: null,
    })
    await reserveUnlocksForDraft(saved.localId, serials)
    setActiveDraftId(saved.localId)
    return saved
  }

  function resetFormAfterQueue(values: SaleFormValues) {
    const lock = readGeoLock()
    const keepState = lock.locked ? lock.state : values.new_customer.state
    const keepLga = lock.locked ? lock.lga : values.new_customer.lga
    if (lock.locked) {
      writeGeoLock({ locked: true, state: keepState, lga: keepLga })
    }

    const productLock = readProductLock()
    const keepProductId = productLock.locked
      ? productLock.product_id
      : values.items[0]?.product_id || ''
    const keepQty = productLock.locked
      ? productLock.quantity
      : Number(values.items[0]?.quantity) || 1
    if (productLock.locked && keepProductId) {
      writeProductLock({
        locked: true,
        product_id: keepProductId,
        quantity: keepQty,
      })
    }

    reset({
      customer_mode: 'new',
      customer_id: '',
      new_customer: {
        name: '',
        email: '',
        phone: '',
        alternate_phone: '',
        nin: '',
        bvn: '',
        address: '',
        address_house_number: '',
        address_building_features: '',
        address_street: '',
        address_landmark: '',
        city: '',
        state: keepState,
        lga: keepLga,
        business_type: DARES_CUSTOMER_TYPES[0],
        gender: '',
        customer_category: '',
        customer_type: DARES_CUSTOMER_TYPES[0],
        is_minor: false,
        guardian_name: '',
        guardian_phone: '',
        guardian_relationship: '',
        next_of_kin_name: '',
        next_of_kin_phone: '',
        next_of_kin_relationship: '',
      },
      payment_type: 'full',
      payment_method: 'cash',
      installment_interval_days: 7,
      plan_end_date: toDateInputValue(addLocalDays(todayInLagos(), 28)),
      discount_percent: 0,
      transport_cost: 0,
      notes: '',
      dares_type_of_payment: '',
      dares_payment_plan: 'Full Payment',
      retail_cost_ngn: 0,
      cost_to_end_user_ngn: 0,
      downpayment_amount_ngn: 0,
      items: [
        {
          product_id: productLock.locked ? keepProductId : '',
          quantity: productLock.locked ? keepQty : 1,
          serial_number: '',
        },
      ],
    })
    setDupPhone(emptyDup())
    setDocuments([])
    setDupNin(emptyDup())
    setSiteGps(null)
    setSitePhotoFile(null)
    setSiteError(null)
    setFormError(null)
    setActiveDraftId(undefined)
    setDraftSavedOpen(true)
    setLinePins({})
    setActivateError({})
    setSerialSoldError(null)
  }

  async function activateLine(index: number) {
    const serial = (getValues(`items.${index}.serial_number`) || '').trim()
    if (!serial) {
      setActivateError((current) => ({ ...current, [index]: 'Enter or scan a serial number first' }))
      return
    }
    if (!isBrowserOnline()) {
      const local = await checkSerialsAgainstLocalPool([serial], activeDraftId)
      if (local.error) {
        setActivateError((current) => ({ ...current, [index]: local.error! }))
        setSerialSoldError(local.error)
        return
      }
      if (local.unlock) {
        setLinePins((current) => ({
          ...current,
          [index]: {
            serial: local.unlock!.serial_number,
            pin: local.unlock!.pin,
            kind: local.unlock!.kind,
            day_token: local.unlock!.day_token,
            reused: true,
          },
        }))
        return
      }
      setActivateError((current) => ({
        ...current,
        [index]:
          'This serial is not in the downloaded unlock pool. Unlock it while online, then sync before going to site.',
      }))
      return
    }

    setActivatingIndex(index)
    setActivateError((current) => ({ ...current, [index]: '' }))
    try {
      const localProblem = localSerialProblem([serial])
      if (localProblem) {
        setActivateError((current) => ({ ...current, [index]: localProblem }))
        setSerialSoldError(localProblem)
        return
      }
      const sold = await checkSoldSerialsAction([serial])
      if (!sold.success) {
        setActivateError((current) => ({ ...current, [index]: sold.error }))
        return
      }
      if (sold.data.hits[0]) {
        const message = soldSerialMessage(sold.data.hits[0])
        setActivateError((current) => ({ ...current, [index]: message }))
        setSerialSoldError(message)
        return
      }

      const result = await resolveUnlockPinAction({
        serial_number: serial,
        kind: unlockKind,
        validity_days: undefined,
      })
      if (!result.success) {
        setActivateError((current) => ({ ...current, [index]: result.error }))
        return
      }
      setLinePins((current) => ({
        ...current,
        [index]: {
          serial: result.data.serial_number || serial,
          pin: result.data.pin,
          kind: result.data.kind,
          day_token: result.data.day_token,
          reused: Boolean(result.data.reused),
        },
      }))
    } catch (error) {
      setActivateError((current) => ({
        ...current,
        [index]: error instanceof Error ? error.message : 'Failed to activate this serial',
      }))
    } finally {
      setActivatingIndex(null)
    }
  }

  const onSubmit = async (values: SaleFormValues) => {
    setFormError(null)
    setSiteError(null)

    if (inStockProducts.length === 0) {
      setError('items', { message: 'Add products with stock before creating a sale' })
      return
    }

    if (!siteGps?.locked) {
      setSiteError('Take the unit photo to capture and lock GPS')
      return
    }
    if (!sitePhotoFile && !(isEdit && sale?.site_photo_url)) {
      setSiteError('Attach a unit photo before saving')
      return
    }

    const nc = values.new_customer
      if (!nc.name.trim() || nc.name.trim().length < 2) {
        setError('new_customer.name', { message: 'Enter the customer name' })
        return
      }
      if (nc.is_minor) {
        if (!nc.guardian_name.trim()) {
          setError('new_customer.guardian_name', { message: 'Enter parent/guardian name' })
          return
        }
        if (!isCompletePhone(nc.guardian_phone)) {
          setError('new_customer.guardian_phone', {
            message: 'Enter a complete guardian phone number',
          })
          return
        }
        if (!nc.guardian_relationship.trim()) {
          setError('new_customer.guardian_relationship', { message: 'Select relationship' })
          return
        }
        if (nc.phone.trim() && !isCompletePhone(nc.phone)) {
          setError('new_customer.phone', {
            message: 'Clear beneficiary phone or enter a complete number',
          })
          return
        }
      } else if (!isCompletePhone(nc.phone)) {
        setError('new_customer.phone', {
          message: 'Enter a complete Nigerian phone number (11 digits starting with 0)',
        })
        return
      }
      if (digitsOnly(nc.nin).length !== NIN_DIGITS) {
        setError('new_customer.nin', { message: `NIN must be exactly ${NIN_DIGITS} digits` })
        return
      }
      if (!nc.gender.trim()) {
        setError('new_customer.gender', { message: 'Select gender' })
        return
      }
      if (!nc.customer_category.trim()) {
        setError('new_customer.customer_category', { message: 'Select customer category' })
        return
      }
      if (!nc.customer_type.trim()) {
        setError('new_customer.customer_type', { message: 'Select customer type' })
        return
      }
      if (!nc.city.trim()) {
        setError('new_customer.city', { message: 'Enter a city' })
        return
      }
      if (!nc.state.trim()) {
        setError('new_customer.state', { message: 'Select a state' })
        return
      }
      if (!nc.lga.trim()) {
        setError('new_customer.lga', { message: 'Select a local government' })
        return
      }

      // Final duplicate sweep before submit (hard + soft + serial)
      const serials = values.items
        .flatMap((item) => (item.serial_number || '').split(/[\s,;]+/))
        .map((s) => s.trim())
        .filter(Boolean)

      if (isBrowserOnline()) {
      const dupResult = await scanBeneficiaryDuplicatesAction({
        name: nc.name,
        phone: nc.phone || nc.guardian_phone,
        nin: nc.nin,
        city: nc.city,
        state: nc.state,
        lga: nc.lga,
        serial: serials,
        exclude_id: customer?.id,
        exclude_sale_id: sale?.id,
      }).catch((error) => {
        if (isLikelyNetworkError(error)) return { success: false as const, error: 'offline' }
        throw error
      })
      if (!dupResult.success) {
        if (isLikelyNetworkError(dupResult.error) || dupResult.error === 'offline') {
          // Fall through to full-sale draft after remaining local validation.
        } else {
        setFormError(dupResult.error)
        return
        }
      } else {
      const hardIdFields = dupResult.data.hard.filter((m) =>
        m.matched_fields?.some((f) => f === 'phone' || f === 'nin' || f === 'serial')
      )
      if (hardIdFields.length > 0 || dupResult.data.by_field.some((d) =>
        (['phone', 'nin', 'serial'] as const).includes(d.field as 'phone' | 'nin' | 'serial')
      )) {
        for (const d of dupResult.data.by_field) {
          if (d.field === 'phone' || d.field === 'nin') {
            const match = d.matches[0]
            setError(`new_customer.${d.field}`, {
              message: `Duplicate ${d.field.toUpperCase()} — already used by ${match?.name}`,
            })
            if (d.field === 'phone') setDupPhone({ checking: false, matches: d.matches })
            if (d.field === 'nin') setDupNin({ checking: false, matches: d.matches })
          }
        }
        const serialHit = dupResult.data.hard.find((m) => m.matched_fields?.includes('serial'))
        setFormError(
          serialHit
            ? `Device serial already registered to ${serialHit.name}. Fix before saving.`
            : 'Fix duplicate phone, NIN, or serial before saving this sale.'
        )
        return
      }
      if (dupResult.data.soft.length > 0) {
        setSoftMatches(dupResult.data.soft)
        if (!softAcknowledged) {
          setFormError(
            'Possible duplicate beneficiary — review the soft-match alert and confirm to continue.'
          )
          return
        }
      }
      }
    }

    if (!values.items.some((item) => item.product_id && item.quantity > 0)) {
      setError('items', { message: 'Add at least one product line' })
      return
    }

    const qtyByProduct = new Map<string, number>()
    values.items
      .filter((item) => item.product_id)
      .forEach((item) => {
        const qty = Number(item.quantity) || 1
        qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + qty)
      })

    for (const [productId, qty] of qtyByProduct) {
      const product = products.find((p) => p.id === productId)
      const alreadyOnSale = (initialItems || [])
        .filter((item) => item.product_id === productId)
        .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      if (product && product.stock + alreadyOnSale < qty) {
        setError('items', {
          message: `Not enough stock for ${product.name}. Available: ${product.stock + alreadyOnSale} ${product.unit}`,
        })
        return
      }
    }

    for (const item of values.items.filter((i) => i.product_id)) {
      const serial = (item.serial_number || '').trim()
      if (!serial) {
        setError('items', { message: 'Enter a product serial number for each line' })
        return
      }
      const qty = Number(item.quantity) || 1
      const serials = serial
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (qty > 1 && serials.length !== qty) {
        setError('items', {
          message: `For qty ${qty}, enter ${qty} serial numbers separated by commas`,
        })
        return
      }
    }

    const saleSerials = parseDeviceSerials(
      values.items.filter((item) => item.product_id).map((item) => item.serial_number)
    )
    const localProblem = localSerialProblem(saleSerials)
    if (localProblem) {
      setSerialSoldError(localProblem)
      setFormError(localProblem)
      setError('items', { message: localProblem })
      return
    }
    const localPool = isEdit
      ? ({} as { error?: string })
      : await checkSerialsAgainstLocalPool(saleSerials, activeDraftId).catch(
          () => ({}) as { error?: string }
        )
    if (localPool.error) {
      setSerialSoldError(localPool.error)
      setFormError(localPool.error)
      setError('items', { message: localPool.error })
      return
    }
    if (isBrowserOnline()) {
      const sold = await checkSoldSerialsAction(saleSerials, sale?.id).catch((error) => {
        if (isLikelyNetworkError(error)) return { success: false as const, error: 'offline' }
        throw error
      })
      if (!sold.success) {
        if (!(isLikelyNetworkError(sold.error) || sold.error === 'offline')) {
          setFormError(sold.error)
          return
        }
      } else if (sold.data.hits[0]) {
        const message = soldSerialMessage(sold.data.hits[0])
        setSerialSoldError(message)
        setFormError(message)
        setError('items', { message })
        return
      } else {
        setSerialSoldError(null)
      }
    }

    if (isEdit && sale) {
      if (!isBrowserOnline()) {
        setFormError('Connect to the internet to save sale edits')
        return
      }

      let sitePhotoUrl = sale.site_photo_url || ''
      try {
        if (sitePhotoFile) sitePhotoUrl = await uploadSitePhotoFile(sitePhotoFile)
      } catch (error) {
        setSiteError(error instanceof Error ? error.message : 'Could not upload unit photo')
        return
      }

      const claim = daresClaimFromSale('full', values.payment_method, totals.total)
      const result = await updateSaleAction(sale.id, {
        customer_id: sale.customer_id,
        new_customer: {
          name: values.new_customer.name.trim(),
          email: '',
          phone: values.new_customer.phone.trim(),
          alternate_phone: values.new_customer.alternate_phone.trim(),
          nin: digitsOnly(values.new_customer.nin),
          bvn: '',
          address: '',
          address_house_number: '',
          address_building_features: '',
          address_street: '',
          address_landmark: '',
          city: values.new_customer.city.trim(),
          state: values.new_customer.state.trim(),
          lga: values.new_customer.lga.trim(),
          business_type:
            values.new_customer.customer_type || values.new_customer.business_type,
          gender: values.new_customer.gender.trim(),
          customer_category: values.new_customer.customer_category.trim(),
          customer_type: values.new_customer.customer_type.trim(),
          credit_limit: customer?.credit_limit ?? 0,
          is_minor: Boolean(values.new_customer.is_minor),
          guardian_name: values.new_customer.is_minor
            ? (values.new_customer.guardian_name || '').trim()
            : '',
          guardian_phone: values.new_customer.is_minor
            ? (values.new_customer.guardian_phone || '').trim()
            : '',
          guardian_relationship: values.new_customer.is_minor
            ? (values.new_customer.guardian_relationship || '').trim()
            : '',
          next_of_kin_name: values.new_customer.is_minor
            ? (values.new_customer.next_of_kin_name || '').trim()
            : '',
          next_of_kin_phone: values.new_customer.is_minor
            ? (values.new_customer.next_of_kin_phone || '').trim()
            : '',
          next_of_kin_relationship: values.new_customer.is_minor
            ? (values.new_customer.next_of_kin_relationship || '').trim()
            : '',
        },
        payment_type: 'full',
        payment_method: values.payment_method,
        installment_interval_days: undefined,
        plan_end_date: undefined,
        discount_percent: 0,
        transport_cost: 0,
        notes: values.notes || sale.notes || '',
        dares_type_of_payment: claim.dares_type_of_payment,
        dares_payment_plan: claim.dares_payment_plan,
        retail_cost_ngn: claim.retail_cost_ngn,
        cost_to_end_user_ngn: claim.cost_to_end_user_ngn,
        downpayment_amount_ngn: claim.downpayment_amount_ngn,
        items: values.items
          .filter((item) => item.product_id)
          .map((item) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity) || 1,
            serial_number: item.serial_number.trim(),
          })),
        site_gps: {
          latitude: siteGps.latitude,
          longitude: siteGps.longitude,
          captured_at: siteGps.captured_at,
          locked: true as const,
          out_of_area: siteGps.out_of_area,
          deployment_area_id: siteGps.deployment_area_id ?? null,
          deployment_area_name: siteGps.deployment_area_name ?? null,
          subsidy_level: siteGps.subsidy_level ?? null,
          out_of_area_reason: siteGps.out_of_area_reason ?? null,
        },
        site_photo_url: sitePhotoUrl,
      }).catch((error) => {
        if (isLikelyNetworkError(error)) return { success: false as const, error: 'offline' }
        throw error
      })

      if (!result.success) {
        setFormError(result.error)
        return
      }

      document.querySelector('main')?.scrollTo({ top: 0, left: 0 })
      window.scrollTo({ top: 0, left: 0 })
      router.push('/sales')
      router.refresh()
      return
    }

    if (!isBrowserOnline()) {
      try {
        await saveSaleAsDraft(values)
        resetFormAfterQueue(values)
      } catch {
        setFormError('Could not save this sale on this device. Check browser storage and try again.')
      }
      return
    }

    let sitePhotoUrl: string
    let remoteDocuments
    try {
      if (!sitePhotoFile) {
        setSiteError('Attach a unit photo before saving')
        return
      }
      sitePhotoUrl = await uploadSitePhotoFile(sitePhotoFile)
      remoteDocuments = await uploadPendingDocuments(documents)
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        await saveSaleAsDraft(values)
        resetFormAfterQueue(values)
        return
      }
      setSiteError(error instanceof Error ? error.message : 'Could not upload unit photo')
      return
    }

    const claim = daresClaimFromSale('full', values.payment_method, totals.total)
    const firstSerial = values.items.find((item) => item.product_id)?.serial_number.trim() || ''
    const preparedUnlockPin =
      Object.values(linePins).find((row) => sameSerialKey(row.serial, firstSerial))?.pin ||
      (await pinsForSaleSerials([firstSerial]))[0]?.pin

    const result = await createSaleAction({
      new_customer: {
              name: values.new_customer.name.trim(),
              email: '',
              phone: values.new_customer.phone.trim(),
              alternate_phone: '',
              nin: digitsOnly(values.new_customer.nin),
              bvn: '',
              address: '',
              address_house_number: '',
              address_building_features: '',
              address_street: '',
              address_landmark: '',
              city: values.new_customer.city.trim(),
              state: values.new_customer.state.trim(),
              lga: values.new_customer.lga.trim(),
              business_type:
                values.new_customer.customer_type || values.new_customer.business_type,
              gender: values.new_customer.gender.trim(),
              customer_category: values.new_customer.customer_category.trim(),
              customer_type: values.new_customer.customer_type.trim(),
              credit_limit: 0,
              is_minor: Boolean(values.new_customer.is_minor),
              guardian_name: values.new_customer.is_minor
                ? (values.new_customer.guardian_name || '').trim()
                : '',
              guardian_phone: values.new_customer.is_minor
                ? (values.new_customer.guardian_phone || '').trim()
                : '',
              guardian_relationship: values.new_customer.is_minor
                ? (values.new_customer.guardian_relationship || '').trim()
                : '',
              next_of_kin_name: values.new_customer.is_minor
                ? (values.new_customer.next_of_kin_name || '').trim()
                : '',
              next_of_kin_phone: values.new_customer.is_minor
                ? (values.new_customer.next_of_kin_phone || '').trim()
                : '',
              next_of_kin_relationship: values.new_customer.is_minor
                ? (values.new_customer.next_of_kin_relationship || '').trim()
                : '',
            },
      payment_type: 'full',
      payment_method: values.payment_method,
      installment_interval_days: undefined,
      plan_end_date: undefined,
      discount_percent: 0,
      transport_cost: 0,
      notes: '',
      dares_type_of_payment: claim.dares_type_of_payment,
      dares_payment_plan: claim.dares_payment_plan,
      retail_cost_ngn: claim.retail_cost_ngn,
      cost_to_end_user_ngn: claim.cost_to_end_user_ngn,
      downpayment_amount_ngn: claim.downpayment_amount_ngn,
      items: values.items
        .filter((item) => item.product_id)
        .map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 1,
          serial_number: item.serial_number.trim(),
        })),
      site_gps: {
        latitude: siteGps.latitude,
        longitude: siteGps.longitude,
        captured_at: siteGps.captured_at,
        locked: true as const,
        out_of_area: siteGps.out_of_area,
        deployment_area_id: siteGps.deployment_area_id ?? null,
        deployment_area_name: siteGps.deployment_area_name ?? null,
        subsidy_level: siteGps.subsidy_level ?? null,
        out_of_area_reason: siteGps.out_of_area_reason ?? null,
      },
      site_photo_url: sitePhotoUrl,
      documents: remoteDocuments.length ? remoteDocuments : undefined,
      ...(preparedUnlockPin ? { unlock_pin: preparedUnlockPin } : {}),
    }).catch((error) => {
      if (isLikelyNetworkError(error)) return { success: false as const, error: 'offline' }
      throw error
    })

    if (!result.success) {
      if (isLikelyNetworkError(result.error) || result.error === 'offline') {
        await saveSaleAsDraft(values)
        resetFormAfterQueue(values)
        return
      }
      setFormError(result.error)
      return
    }

    if (activeDraftId) {
      await deleteSaleDraft(activeDraftId)
    }

    // Keep geo + product locks across successful saves
    const lock = readGeoLock()
    const keepState = lock.locked ? lock.state : values.new_customer.state
    const keepLga = lock.locked ? lock.lga : values.new_customer.lga
    if (lock.locked) {
      writeGeoLock({ locked: true, state: keepState, lga: keepLga })
    }

    const productLock = readProductLock()
    const keepProductId = productLock.locked
      ? productLock.product_id
      : values.items[0]?.product_id || ''
    const keepQty = productLock.locked
      ? productLock.quantity
      : Number(values.items[0]?.quantity) || 1
    if (productLock.locked && keepProductId) {
      writeProductLock({
        locked: true,
        product_id: keepProductId,
        quantity: keepQty,
      })
    }

    reset({
      customer_mode: 'new',
      customer_id: '',
      new_customer: {
        name: '',
        email: '',
        phone: '',
        alternate_phone: '',
        nin: '',
        bvn: '',
        address: '',
        address_house_number: '',
        address_building_features: '',
        address_street: '',
        address_landmark: '',
        city: '',
        state: keepState,
        lga: keepLga,
        business_type: DARES_CUSTOMER_TYPES[0],
        gender: '',
        customer_category: '',
        customer_type: DARES_CUSTOMER_TYPES[0],
        is_minor: false,
        guardian_name: '',
        guardian_phone: '',
        guardian_relationship: '',
        next_of_kin_name: '',
        next_of_kin_phone: '',
        next_of_kin_relationship: '',
      },
      payment_type: 'full',
      payment_method: 'cash',
      installment_interval_days: 7,
      plan_end_date: toDateInputValue(addLocalDays(todayInLagos(), 28)),
      discount_percent: 0,
      transport_cost: 0,
      notes: '',
      dares_type_of_payment: '',
      dares_payment_plan: 'Full Payment',
      retail_cost_ngn: 0,
      cost_to_end_user_ngn: 0,
      downpayment_amount_ngn: 0,
      items: [
        {
          product_id: productLock.locked ? keepProductId : '',
          quantity: productLock.locked ? keepQty : 1,
          serial_number: '',
        },
      ],
    })
    setDupPhone(emptyDup())
    setDocuments([])
    setDupNin(emptyDup())
    setSiteGps(null)
    setSitePhotoFile(null)
    setSiteError(null)
    setLinePins({})
    setActivateError({})

    const createdQuery = new URLSearchParams({
      created: result.data.sale.id,
      invoice: result.data.invoice.id,
    })
    if (result.data.unlock_pin) {
      createdQuery.set('unlock_pin', result.data.unlock_pin)
    }
    document.querySelector('main')?.scrollTo({ top: 0, left: 0 })
    window.scrollTo({ top: 0, left: 0 })
    const soldSerials = values.items.filter((item) => item.product_id).map((item) => item.serial_number)
    await consumeUnlocksLocally(soldSerials, {
      sale_id: result.data.sale.id,
      customer_id: result.data.sale.customer_id,
    })
    void refreshUnlockPoolSnapshot()
    router.push(`/sales?${createdQuery.toString()}`)
    router.refresh()
  }

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Customer & payment" description="Who is buying and how they will pay">
        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border border-border/70 bg-secondary/15 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="new_customer.name">Full name</Label>
                  <Input
                    id="new_customer.name"
                    placeholder="Customer full name"
                    {...register('new_customer.name')}
                  />
                  {errors.new_customer?.name && (
                    <p className="mt-1 text-xs text-destructive">{errors.new_customer.name.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="new_customer.gender">Gender</Label>
                  <Select id="new_customer.gender" {...register('new_customer.gender')}>
                    <option value="">Select…</option>
                    {DARES_GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                  {errors.new_customer?.gender && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.new_customer.gender.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="new_customer.customer_category">Customer category</Label>
                  <Select
                    id="new_customer.customer_category"
                    {...register('new_customer.customer_category')}
                  >
                    <option value="">Select…</option>
                    {DARES_CUSTOMER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  {errors.new_customer?.customer_category && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.new_customer.customer_category.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="new_customer.customer_type">Customer type</Label>
                  <Select
                    id="new_customer.customer_type"
                    {...register('new_customer.customer_type', {
                      onChange: (e) => {
                        const next = e.target.value
                        setValue('new_customer.customer_type', next, { shouldDirty: true })
                        if (next) {
                          setValue('new_customer.business_type', next, { shouldDirty: true })
                        }
                      },
                    })}
                  >
                    <option value="">Select…</option>
                    {DARES_CUSTOMER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  {errors.new_customer?.customer_type && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.new_customer.customer_type.message}
                    </p>
                  )}
                  <input type="hidden" {...register('new_customer.business_type')} />
                </div>

                {softMatches.length > 0 && (
                  <div className="md:col-span-2">
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
                  <label className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(isMinor)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setValue('new_customer.is_minor', checked, { shouldDirty: true })
                        if (checked) return
                        setValue('new_customer.guardian_name', '')
                        setValue('new_customer.guardian_phone', '')
                        setValue('new_customer.guardian_relationship', '')
                        setValue('new_customer.next_of_kin_name', '')
                        setValue('new_customer.next_of_kin_phone', '')
                        setValue('new_customer.next_of_kin_relationship', '')
                        clearErrors([
                          'new_customer.guardian_name',
                          'new_customer.guardian_phone',
                          'new_customer.guardian_relationship',
                          'new_customer.next_of_kin_name',
                          'new_customer.next_of_kin_phone',
                          'new_customer.next_of_kin_relationship',
                        ])
                      }}
                    />
                    <span>
                      <span className="font-medium">Minor / no personal phone</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Makes beneficiary phone optional — guardian phone is used for SMS
                      </span>
                    </span>
                  </label>
                </div>

                <UniqueField
                  field="phone"
                  label={isMinor ? 'Beneficiary phone (optional)' : 'Phone'}
                  placeholder="07012345678"
                  dup={dupPhone}
                  value={phoneValue}
                  error={errors.new_customer?.phone?.message}
                  onChange={(next) => {
                    setValue('new_customer.phone', next, { shouldDirty: true })
                    clearFieldDup('phone')
                  }}
                  onSearch={() => void runDuplicateCheck('phone')}
                />
                <UniqueField
                  field="nin"
                  label="NIN"
                  placeholder="11-digit NIN"
                  dup={dupNin}
                  value={ninValue}
                  error={errors.new_customer?.nin?.message}
                  onChange={(next) => {
                    setValue('new_customer.nin', next, { shouldDirty: true })
                    clearFieldDup('nin')
                  }}
                  onSearch={() => void runDuplicateCheck('nin')}
                />

                <div>
                  <Label htmlFor="new_customer.city">City</Label>
                  <Input id="new_customer.city" placeholder="City" {...register('new_customer.city')} />
                  {errors.new_customer?.city && (
                    <p className="mt-1 text-xs text-destructive">{errors.new_customer.city.message}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">State & local government</p>
                    <p className="text-xs text-muted-foreground">
                      {forcedGeo?.state
                        ? 'Locked to your assigned territory by admin'
                        : 'Lock these for queue entry — they stay set after each save until you unlock'}
                    </p>
                  </div>
                  {!forcedGeo?.state && (
                    <Button
                      type="button"
                      variant={geoLocked ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      onClick={toggleGeoLock}
                    >
                      {geoLocked ? (
                        <>
                          <Lock className="size-3.5" />
                          Locked
                        </>
                      ) : (
                        <>
                          <Unlock className="size-3.5" />
                          Lock location
                        </>
                      )}
                    </Button>
                  )}
                  {forcedGeo?.state && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      <Lock className="size-3.5" />
                      Agent territory
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>State</Label>
                    <SearchableSelect
                      id="new_customer.state"
                      options={stateOptions}
                      value={selectedState}
                      disabled={geoLocked}
                      onChange={(state) => {
                        setValue('new_customer.state', state, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                        setValue('new_customer.lga', '', { shouldDirty: true })
                      }}
                      placeholder="Search states…"
                      emptyLabel="No state matches"
                      error={errors.new_customer?.state?.message}
                    />
                    <input type="hidden" {...register('new_customer.state')} />
                  </div>
                  <div>
                    <Label>Local government</Label>
                    <SearchableSelect
                      id="new_customer.lga"
                      options={lgaOptions}
                      value={selectedLga}
                      disabled={geoLocked}
                      onChange={(lga) => {
                        setValue('new_customer.lga', lga, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }}
                      placeholder={selectedState ? 'Search LGA…' : 'Select a state first'}
                      emptyLabel="No LGA matches"
                      error={errors.new_customer?.lga?.message}
                    />
                    <input type="hidden" {...register('new_customer.lga')} />
                  </div>
                </div>
                {geoLocked && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Location is locked to {selectedState}
                    {selectedLga ? ` / ${selectedLga}` : ''}.
                    {forcedGeo?.state ? '' : ' Unlock to change.'}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
                <div>
                  <p className="text-sm font-medium">Parent / guardian & next of kin</p>
                  <p className="text-xs text-muted-foreground">
                    {isMinor
                      ? 'Required for this customer — guardian phone is used for SMS'
                      : 'Tick “Minor / no personal phone” above to fill these'}
                  </p>
                </div>
                <fieldset
                  disabled={!isMinor}
                  className={cn(
                    'grid grid-cols-1 gap-4 md:grid-cols-2',
                    !isMinor && 'pointer-events-none opacity-50'
                  )}
                >
                  <div>
                    <Label htmlFor="new_customer.guardian_name">Parent / guardian name</Label>
                    <Input
                      id="new_customer.guardian_name"
                      {...register('new_customer.guardian_name')}
                      disabled={!isMinor}
                    />
                    {errors.new_customer?.guardian_name && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.new_customer.guardian_name.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="new_customer.guardian_relationship">Relationship</Label>
                    <Select
                      id="new_customer.guardian_relationship"
                      {...register('new_customer.guardian_relationship')}
                      disabled={!isMinor}
                    >
                      <option value="">Select…</option>
                      {GUARDIAN_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                    {errors.new_customer?.guardian_relationship && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.new_customer.guardian_relationship.message}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="new_customer.guardian_phone">Parent / guardian phone</Label>
                    <Input
                      id="new_customer.guardian_phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={13}
                      disabled={!isMinor}
                      value={guardianPhoneValue}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        const limit = digits.startsWith('234') ? 13 : 11
                        setValue('new_customer.guardian_phone', digits.slice(0, limit), {
                          shouldDirty: true,
                        })
                      }}
                      placeholder="07012345678"
                    />
                    {errors.new_customer?.guardian_phone && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.new_customer.guardian_phone.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="new_customer.next_of_kin_name">Next-of-kin name</Label>
                    <Input
                      id="new_customer.next_of_kin_name"
                      {...register('new_customer.next_of_kin_name')}
                      disabled={!isMinor}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_customer.next_of_kin_relationship">NOK relationship</Label>
                    <Select
                      id="new_customer.next_of_kin_relationship"
                      {...register('new_customer.next_of_kin_relationship')}
                      disabled={!isMinor}
                    >
                      <option value="">Select…</option>
                      {GUARDIAN_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="new_customer.next_of_kin_phone">Next-of-kin phone</Label>
                    <Input
                      id="new_customer.next_of_kin_phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={13}
                      {...register('new_customer.next_of_kin_phone', {
                        onChange: (e) => {
                          const digits = e.target.value.replace(/\D/g, '')
                          const limit = digits.startsWith('234') ? 13 : 11
                          e.target.value = digits.slice(0, limit)
                          setValue('new_customer.next_of_kin_phone', e.target.value, {
                            shouldDirty: true,
                          })
                        },
                      })}
                      disabled={!isMinor}
                    />
                  </div>
                </fieldset>
              </div>
            </div>

          <div>
            <Label htmlFor="payment_method">Payment method</Label>
            <Select id="payment_method" className="mt-1.5" {...register('payment_method')}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              How this full payment was received
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Products"
        description="Lock the product for queue entry — serial still changes per sale"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={productLocked ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={toggleProductLock}
            >
              {productLocked ? (
                <>
                  <Lock className="size-3.5" />
                  Product locked
                </>
              ) : (
                <>
                  <Unlock className="size-3.5" />
                  Lock product
                </>
              )}
            </Button>
            {!productLocked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => append({ product_id: '', quantity: 1, serial_number: '' })}
              >
                <Plus className="size-3.5" />
                Add line
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="space-y-3 rounded-lg border border-border/60 bg-secondary/20 p-3"
            >
              <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_100px_1fr_auto]">
              <div>
                <Label htmlFor={`items.${index}.product_id`}>Product</Label>
                <Select
                  id={`items.${index}.product_id`}
                  disabled={productLocked}
                  {...register(`items.${index}.product_id`)}
                >
                  <option value="">Select product…</option>
                  {inStockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {showMoney
                        ? `${product.name} — ${formatCurrency(product.price)} (stock ${product.stock} ${product.unit})`
                        : `${product.name} (stock ${product.stock} ${product.unit})`}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`items.${index}.quantity`}>Qty</Label>
                <Input
                  id={`items.${index}.quantity`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={productLocked}
                  {...register(`items.${index}.quantity`, {
                    setValueAs: (v) => {
                      const n = Number(digitsOnly(String(v ?? ''))) || 1
                      return Math.max(1, n)
                    },
                    onChange: (e) => {
                      e.target.value = digitsOnly(e.target.value)
                    },
                  })}
                />
              </div>
              <div>
                <SerialBarcodeField
                  id={`items.${index}.serial_number`}
                  value={watchedItems?.[index]?.serial_number || ''}
                  onChange={(next) => {
                    setValue(`items.${index}.serial_number`, next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                    setLinePins((current) => {
                      if (!current[index]) return current
                      if (sameSerialKey(current[index].serial, next)) {
                        return current
                      }
                      const copy = { ...current }
                      delete copy[index]
                      return copy
                    })
                    setActivateError((current) => ({ ...current, [index]: '' }))
                  }}
                  placeholder="Device serial…"
                />
              </div>
              {!productLocked ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => fields.length > 1 && remove(index)}
                  disabled={fields.length === 1}
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <div className="hidden md:block" />
              )}
              </div>
              {(watchedItems?.[index]?.serial_number || '').trim() ? (
                <div className="space-y-2">
                  {!isEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5"
                        disabled={activatingIndex === index}
                        onClick={() => void activateLine(index)}
                      >
                        <KeyRound className="size-4" />
                        {activatingIndex === index ? 'Activating…' : `Activate ${unlockLabel}`}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Checks the shared unlock pool first. If this serial is not unlocked yet and you
                        are online, it fetches the PIN from BeeBeeJump. Offline, only downloaded unused
                        PINs can be attached.
                      </p>
                    </>
                  ) : null}
                  {activateError[index] ? (
                    <p className="text-sm text-destructive">{activateError[index]}</p>
                  ) : null}
                  {linePins[index] &&
                  linePins[index].serial.trim() &&
                  sameSerialKey(
                    linePins[index].serial,
                    watchedItems?.[index]?.serial_number || ''
                  ) ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {isEdit
                          ? 'Device PIN on this sale'
                          : linePins[index].reused
                            ? 'PIN from shared unlock pool'
                            : 'PIN fetched from BeeBeeJump'}{' '}
                        · {linePins[index].kind === 'full' ? 'Full' : linePins[index].day_token.replace('Days', ' days')}
                      </p>
                      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em] text-primary">
                        {linePins[index].pin}
                      </p>
                    </div>
                  ) : isEdit && sale?.unlock_pin && index === 0 ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground">Device PIN on this sale</p>
                      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em] text-primary">
                        {sale.unlock_pin}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {productLocked && firstProductId && (
            <p className="text-xs text-muted-foreground">
              Product is locked
              {products.find((p) => p.id === firstProductId)?.name
                ? ` to ${products.find((p) => p.id === firstProductId)?.name}`
                : ''}
              . Unlock to change product or quantity.
            </p>
          )}
          {!productLocked && (
            <p className="text-xs text-muted-foreground">
              For quantity greater than 1, enter one serial per unit separated by commas.
            </p>
          )}
          {errors.items && (
            <p className="text-xs text-destructive">
              {errors.items.message || 'Add at least one product line'}
            </p>
          )}
        </div>
      </Panel>

      <SiteVerificationPanel
        gps={siteGps}
        photoFile={sitePhotoFile}
        existingPhotoUrl={isEdit ? sale?.site_photo_url : undefined}
        expectedState={deploymentState}
        expectedLga={deploymentLga}
        onGpsChange={setSiteGps}
        onPhotoChange={setSitePhotoFile}
        error={siteError}
      />

      {formError || serialSoldError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError || serialSoldError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            Boolean(serialSoldError) ||
            (!isEdit && isOnline && hasDuplicates)
          }
        >
          {isEdit
            ? isSubmitting
              ? 'Saving…'
              : 'Save changes'
            : !isOnline
              ? 'Save draft offline'
              : activeDraftId
                ? 'Save and sync'
                : 'Create sale'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/sales')}>
          Cancel
        </Button>
      </div>
    </form>
    {draftSavedOpen && (
      <OfflineDraftSavedModal
        onClose={() => setDraftSavedOpen(false)}
        draftsHref="/sales/drafts"
        message="This sale was saved as a draft on this device, including customer details, unit photo, and GPS. It will sync automatically when you reconnect, or tap Sync now in the header."
      />
    )}
    </>
  )
}
