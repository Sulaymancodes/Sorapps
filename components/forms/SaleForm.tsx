'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  CreditCard,
  CalendarClock,
  Search,
  Lock,
  Unlock,
  UserPlus,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CustomerPicker } from '@/components/forms/CustomerPicker'
import { SiteVerificationPanel } from '@/components/forms/SiteVerificationPanel'
import { DocumentUploader } from '@/components/documents/DocumentUploader'
import { SerialBarcodeField } from '@/components/forms/SerialBarcodeField'
import {
  BUSINESS_TYPES,
  GUARDIAN_RELATIONSHIPS,
  INSTALLMENT_WEEK_OPTIONS,
  NIGERIAN_STATES,
} from '@/lib/constants/options'
import {
  addLocalDays,
  parseDateInput,
  previewInstallmentPlan,
  toDateInputValue,
  todayInLagos,
} from '@/lib/paygo/schedule'
import { getLgasForState } from '@/lib/constants/lgas'
import { createSaleAction } from '@/app/actions/sales'
import {
  checkCustomerDuplicateAction,
  scanBeneficiaryDuplicatesAction,
} from '@/app/actions/customers'
import { createSitePhotoUploadUrlAction } from '@/app/actions/uploads'
import { SoftDuplicateAlert } from '@/components/forms/SoftDuplicateAlert'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { cn } from '@/lib/utils'
import type { DuplicateMatch as SoftDuplicateMatch } from '@/lib/services/customers'
import type {
  Customer,
  DocumentUploadInput,
  PaymentType,
  Product,
  SaleSiteGpsInput,
} from '@/lib/types/crm'

type DuplicateField = 'phone' | 'nin' | 'bvn'
type DuplicateMatch = {
  id: string
  name: string
  phone: string
  nin: string
  bvn: string
  city: string
  state: string
}

/** NIN (NIMC) and BVN (CBN/NIBSS) are both 11 digits. */
const NIN_DIGITS = 11
const BVN_DIGITS = 11
/** Local Nigerian mobile: 0 + 10 digits. International: 234 + 10 digits. */
const PHONE_LOCAL_DIGITS = 11
const PHONE_INTL_DIGITS = 13
const UNIQUE_CHECK_DEBOUNCE_MS = 600

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function maxDigitsForField(field: DuplicateField, digits: string): number {
  if (field === 'nin') return NIN_DIGITS
  if (field === 'bvn') return BVN_DIGITS
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
  if (field === 'bvn') return digits.length === BVN_DIGITS
  return isCompletePhone(value)
}

function uniqueFieldHint(field: DuplicateField) {
  if (field === 'nin') return `Exactly ${NIN_DIGITS} digits — search runs when complete`
  if (field === 'bvn') return `Exactly ${BVN_DIGITS} digits — search runs when complete`
  return `Exactly ${PHONE_LOCAL_DIGITS} digits (e.g. 0701xxxxxxx) — search runs when complete`
}

function uniqueFieldIncompleteMessage(field: DuplicateField) {
  if (field === 'nin') return `NIN must be exactly ${NIN_DIGITS} digits`
  if (field === 'bvn') return `BVN must be exactly ${BVN_DIGITS} digits`
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

type SaleFormValues = {
  customer_mode: CustomerMode
  customer_id: string
  new_customer: {
    name: string
    email: string
    phone: string
    nin: string
    bvn: string
    address: string
    city: string
    state: string
    lga: string
    business_type: string
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
  items: { product_id: string; quantity: number; serial_number: string }[]
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
  customers,
  products,
  forcedGeo,
}: {
  customers: Customer[]
  products: Product[]
  /** When set (agent territory), state/LGA are locked and cannot be changed. */
  forcedGeo?: { state: string; lga: string } | null
}) {
  const router = useRouter()
  const [geoLocked, setGeoLocked] = useState(false)
  const [productLocked, setProductLocked] = useState(false)
  const [siteGps, setSiteGps] = useState<SaleSiteGpsInput | null>(null)
  const [sitePhotoFile, setSitePhotoFile] = useState<File | null>(null)
  const [siteError, setSiteError] = useState<string | null>(null)
  const [dupPhone, setDupPhone] = useState<FieldDupState>(emptyDup)
  const [dupNin, setDupNin] = useState<FieldDupState>(emptyDup)
  const [dupBvn, setDupBvn] = useState<FieldDupState>(emptyDup)
  const [softMatches, setSoftMatches] = useState<SoftDuplicateMatch[]>([])
  const [softAcknowledged, setSoftAcknowledged] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentUploadInput[]>([])

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
      customer_id: '',
      new_customer: {
        name: '',
        email: '',
        phone: '',
        nin: '',
        bvn: '',
        address: '',
        city: '',
        state: '',
        lga: '',
        business_type: BUSINESS_TYPES[0],
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
      items: [{ product_id: '', quantity: 1, serial_number: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const paymentType = useWatch({ control, name: 'payment_type' })
  const installmentIntervalDays = useWatch({ control, name: 'installment_interval_days' })
  const planEndDate = useWatch({ control, name: 'plan_end_date' })
  const isInstallment = paymentType === 'installment'
  const customerMode = useWatch({ control, name: 'customer_mode' })
  const customerId = useWatch({ control, name: 'customer_id' })
  const watchedItems = useWatch({ control, name: 'items' })
  const selectedState = useWatch({ control, name: 'new_customer.state' }) || ''
  const selectedLga = useWatch({ control, name: 'new_customer.lga' }) || ''
  const firstProductId = watchedItems?.[0]?.product_id || ''

  const existingCustomer = useMemo(
    () => (customerId ? customers.find((c) => c.id === customerId) : undefined),
    [customers, customerId]
  )

  const deploymentState =
    customerMode === 'existing' ? existingCustomer?.state || '' : selectedState
  const deploymentLga =
    customerMode === 'existing' ? existingCustomer?.lga || '' : selectedLga

  const inStockProducts = useMemo(() => {
    return products
      .filter((p) => p.stock > 0 || (productLocked && p.id === firstProductId))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, productLocked, firstProductId])

  useEffect(() => {
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
  }, [setValue, forcedGeo])

  const lgaOptions = useMemo(() => getLgasForState(selectedState), [selectedState])

  const stateOptions = useMemo(() => {
    if (selectedState && !(NIGERIAN_STATES as readonly string[]).includes(selectedState)) {
      return [selectedState, ...NIGERIAN_STATES] as string[]
    }
    return NIGERIAN_STATES as unknown as string[]
  }, [selectedState])

  const hasDuplicates =
    dupPhone.matches.length > 0 || dupNin.matches.length > 0 || dupBvn.matches.length > 0

  const totals = useMemo(() => {
    const subtotal = (watchedItems || []).reduce((sum, line) => {
      const product = products.find((p) => p.id === line.product_id)
      const qty = Number(line.quantity) || 0
      return sum + (product?.price || 0) * qty
    }, 0)
    return { subtotal, total: Math.round(subtotal) }
  }, [watchedItems, products])

  const planPreview = useMemo(() => {
    if (!isInstallment) return null
    return previewInstallmentPlan({
      total: totals.total,
      endDateIso: planEndDate || '',
      intervalDays: Number(installmentIntervalDays) || 7,
      startDate: todayInLagos(),
    })
  }, [isInstallment, totals.total, planEndDate, installmentIntervalDays])

  const minPlanEndDate = toDateInputValue(addLocalDays(todayInLagos(), 1))

  function applyWeekPreset(weeks: number) {
    const end = addLocalDays(todayInLagos(), weeks * 7)
    setValue('plan_end_date', toDateInputValue(end), {
      shouldValidate: true,
      shouldDirty: true,
    })
    setValue('installment_interval_days', 7, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

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
      const setDup =
        field === 'phone' ? setDupPhone : field === 'nin' ? setDupNin : setDupBvn

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
        bvn: field === 'bvn' ? value : undefined,
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
    [getValues, setError, clearErrors]
  )

  const clearFieldDup = (field: DuplicateField) => {
    if (field === 'phone') setDupPhone(emptyDup())
    if (field === 'nin') setDupNin(emptyDup())
    if (field === 'bvn') setDupBvn(emptyDup())
    clearFieldError(field)
  }

  const phoneValue = useWatch({ control, name: 'new_customer.phone' }) || ''
  const ninValue = useWatch({ control, name: 'new_customer.nin' }) || ''
  const bvnValue = useWatch({ control, name: 'new_customer.bvn' }) || ''
  const customerNameValue = useWatch({ control, name: 'new_customer.name' }) || ''
  const customerCityValue = useWatch({ control, name: 'new_customer.city' }) || ''
  const customerAddressValue = useWatch({ control, name: 'new_customer.address' }) || ''
  const isMinor = useWatch({ control, name: 'new_customer.is_minor' })
  const guardianPhoneValue = useWatch({ control, name: 'new_customer.guardian_phone' }) || ''

  useEffect(() => {
    if (customerMode !== 'new') return
    const timer = window.setTimeout(() => {
      if (isCompleteUniqueValue('phone', phoneValue)) {
        void runDuplicateCheck('phone', { silentIncomplete: true })
      } else {
        setDupPhone(emptyDup())
      }
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [phoneValue, customerMode, runDuplicateCheck])

  useEffect(() => {
    if (customerMode !== 'new') return
    const timer = window.setTimeout(() => {
      if (isCompleteUniqueValue('nin', ninValue)) {
        void runDuplicateCheck('nin', { silentIncomplete: true })
      } else {
        setDupNin(emptyDup())
      }
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [ninValue, customerMode, runDuplicateCheck])

  useEffect(() => {
    if (customerMode !== 'new') return
    const timer = window.setTimeout(() => {
      if (isCompleteUniqueValue('bvn', bvnValue)) {
        void runDuplicateCheck('bvn', { silentIncomplete: true })
      } else {
        setDupBvn(emptyDup())
      }
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [bvnValue, customerMode, runDuplicateCheck])

  useEffect(() => {
    if (customerMode !== 'new') {
      setSoftMatches([])
      setSoftAcknowledged(false)
      return
    }
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
          bvn: bvnValue || undefined,
          city: customerCityValue || undefined,
          state: selectedState || undefined,
          lga: selectedLga || undefined,
          address: customerAddressValue || undefined,
          serial: serials.length ? serials : undefined,
        })
        if (!result.success) return
        setSoftMatches(result.data.soft)
        if (!result.data.soft.length) setSoftAcknowledged(false)
        // Surface hard serial hits into form error if any
        const serialHard = result.data.hard.filter((m) =>
          m.matched_fields?.includes('serial')
        )
        if (serialHard.length) {
          setFormError(
            `Device serial already registered to ${serialHard[0].name}. Use a different serial.`
          )
        }
      })()
    }, UNIQUE_CHECK_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [
    customerMode,
    customerNameValue,
    customerCityValue,
    customerAddressValue,
    selectedState,
    selectedLga,
    phoneValue,
    guardianPhoneValue,
    ninValue,
    bvnValue,
    watchedItems,
  ])

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

  const onSubmit = async (values: SaleFormValues) => {
    setFormError(null)
    setSiteError(null)

    if (inStockProducts.length === 0) {
      setError('items', { message: 'Add products with stock before creating a sale' })
      return
    }

    if (!siteGps?.locked) {
      setSiteError('Take the site photo to capture and lock GPS')
      return
    }
    if (!sitePhotoFile) {
      setSiteError('Attach a site photo before saving')
      return
    }

    if (values.customer_mode === 'existing') {
      if (!values.customer_id) {
        setError('customer_id', { message: 'Select a customer' })
        return
      }
    } else {
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
      if (digitsOnly(nc.bvn).length !== BVN_DIGITS) {
        setError('new_customer.bvn', { message: `BVN must be exactly ${BVN_DIGITS} digits` })
        return
      }
      if (!nc.address.trim()) {
        setError('new_customer.address', { message: 'Enter an address' })
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
      const dupResult = await scanBeneficiaryDuplicatesAction({
        name: nc.name,
        phone: nc.phone || nc.guardian_phone,
        nin: nc.nin,
        bvn: nc.bvn,
        city: nc.city,
        state: nc.state,
        lga: nc.lga,
        address: nc.address,
        serial: serials,
      })
      if (!dupResult.success) {
        setFormError(dupResult.error)
        return
      }
      const hardIdFields = dupResult.data.hard.filter((m) =>
        m.matched_fields?.some((f) => f === 'phone' || f === 'nin' || f === 'bvn' || f === 'serial')
      )
      if (hardIdFields.length > 0 || dupResult.data.by_field.some((d) =>
        (['phone', 'nin', 'bvn', 'serial'] as const).includes(d.field as 'phone' | 'nin' | 'bvn' | 'serial')
      )) {
        for (const d of dupResult.data.by_field) {
          if (d.field === 'phone' || d.field === 'nin' || d.field === 'bvn') {
            const match = d.matches[0]
            setError(`new_customer.${d.field}`, {
              message: `Duplicate ${d.field.toUpperCase()} — already used by ${match?.name}`,
            })
            if (d.field === 'phone') setDupPhone({ checking: false, matches: d.matches })
            if (d.field === 'nin') setDupNin({ checking: false, matches: d.matches })
            if (d.field === 'bvn') setDupBvn({ checking: false, matches: d.matches })
          }
        }
        const serialHit = dupResult.data.hard.find((m) => m.matched_fields?.includes('serial'))
        setFormError(
          serialHit
            ? `Device serial already registered to ${serialHit.name}. Fix before saving.`
            : 'Fix duplicate phone, NIN, BVN, or serial before saving this sale.'
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

    if (!values.items.some((item) => item.product_id && item.quantity > 0)) {
      setError('items', { message: 'Add at least one product line' })
      return
    }
    if (values.payment_type === 'installment') {
      const interval = Math.round(Number(values.installment_interval_days))
      if (!Number.isFinite(interval) || interval < 1 || interval > 365) {
        setError('installment_interval_days', {
          message: 'Enter payment interval in days (1–365)',
        })
        return
      }
      if (!values.plan_end_date) {
        setError('plan_end_date', { message: 'Choose a plan end date' })
        return
      }
      const end = parseDateInput(values.plan_end_date)
      const start = todayInLagos()
      if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        setError('plan_end_date', {
          message: `Plan end date must be after the sale date (${toDateInputValue(start)})`,
        })
        return
      }
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
      if (product && product.stock < qty) {
        setError('items', {
          message: `Not enough stock for ${product.name}. Available: ${product.stock} ${product.unit}`,
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

    // Upload site photo to Cloudflare R2 only when submitting the sale
    const prepared = await createSitePhotoUploadUrlAction({
      contentType: sitePhotoFile.type || 'image/jpeg',
      fileName: sitePhotoFile.name || 'site.jpg',
    })
    if (!prepared.success) {
      setSiteError(prepared.error)
      return
    }

    const put = await fetch(prepared.data.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': sitePhotoFile.type || 'image/jpeg',
      },
      body: sitePhotoFile,
    })
    if (!put.ok) {
      setSiteError('Upload to Cloudflare R2 failed. Check bucket CORS and credentials.')
      return
    }
    const sitePhotoUrl = prepared.data.publicUrl

    const result = await createSaleAction({
      customer_id: values.customer_mode === 'existing' ? values.customer_id : undefined,
      new_customer:
        values.customer_mode === 'new'
          ? {
              name: values.new_customer.name.trim(),
              email: values.new_customer.email.trim(),
              phone: values.new_customer.phone.trim(),
              nin: digitsOnly(values.new_customer.nin),
              bvn: digitsOnly(values.new_customer.bvn),
              address: values.new_customer.address.trim(),
              city: values.new_customer.city.trim(),
              state: values.new_customer.state.trim(),
              lga: values.new_customer.lga.trim(),
              business_type: values.new_customer.business_type,
              credit_limit: 0,
              is_minor: Boolean(values.new_customer.is_minor),
              guardian_name: values.new_customer.guardian_name.trim(),
              guardian_phone: values.new_customer.guardian_phone.trim(),
              guardian_relationship: values.new_customer.guardian_relationship.trim(),
              next_of_kin_name: values.new_customer.next_of_kin_name.trim(),
              next_of_kin_phone: values.new_customer.next_of_kin_phone.trim(),
              next_of_kin_relationship: values.new_customer.next_of_kin_relationship.trim(),
            }
          : undefined,
      payment_type: values.payment_type,
      payment_method: values.payment_method,
      installment_interval_days:
        values.payment_type === 'installment'
          ? Math.round(Number(values.installment_interval_days))
          : undefined,
      plan_end_date:
        values.payment_type === 'installment' ? values.plan_end_date : undefined,
      discount_percent: 0,
      transport_cost: 0,
      notes: '',
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
      documents: documents.length ? documents : undefined,
    })

    if (!result.success) {
      setFormError(result.error)
      return
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
        nin: '',
        bvn: '',
        address: '',
        city: '',
        state: keepState,
        lga: keepLga,
        business_type: BUSINESS_TYPES[0],
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
    setDupBvn(emptyDup())
    setSiteGps(null)
    setSitePhotoFile(null)
    setSiteError(null)

    router.push(`/sales?created=${result.data.sale.id}&invoice=${result.data.invoice.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Panel title="Customer & payment" description="Choose who is buying and how they will pay">
        <div className="space-y-5">
          <div>
            <Label>Customer source</Label>
            <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setValue('customer_mode', 'new')}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  customerMode === 'new'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <UserPlus className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">New customer</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add details here — phone, NIN & BVN checked for duplicates
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setValue('customer_mode', 'existing')}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  customerMode === 'existing'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <Users className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Existing customer</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Search and select from the list</p>
                </div>
              </button>
            </div>
            <input type="hidden" {...register('customer_mode')} />
          </div>

          {customerMode === 'existing' ? (
            <div>
              <Label>Customer</Label>
              <div className="mt-1.5">
                <CustomerPicker
                  customers={customers}
                  value={customerId || ''}
                  onChange={(id) =>
                    setValue('customer_id', id, { shouldValidate: true, shouldDirty: true })
                  }
                  error={errors.customer_id?.message}
                />
              </div>
              <input type="hidden" {...register('customer_id')} />
            </div>
          ) : (
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

                {customerMode === 'new' && softMatches.length > 0 && (
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
                      onChange={(e) =>
                        setValue('new_customer.is_minor', e.target.checked, { shouldDirty: true })
                      }
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
                <UniqueField
                  field="bvn"
                  label="BVN"
                  placeholder="11-digit BVN"
                  dup={dupBvn}
                  value={bvnValue}
                  error={errors.new_customer?.bvn?.message}
                  onChange={(next) => {
                    setValue('new_customer.bvn', next, { shouldDirty: true })
                    clearFieldDup('bvn')
                  }}
                  onSearch={() => void runDuplicateCheck('bvn')}
                />

                <div>
                  <Label htmlFor="new_customer.email">Email (optional)</Label>
                  <Input
                    id="new_customer.email"
                    type="email"
                    placeholder="name@email.com"
                    {...register('new_customer.email')}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="new_customer.address">Address</Label>
                  <Input
                    id="new_customer.address"
                    placeholder="Street address"
                    {...register('new_customer.address')}
                  />
                  {errors.new_customer?.address && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.new_customer.address.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="new_customer.city">City</Label>
                  <Input id="new_customer.city" placeholder="City" {...register('new_customer.city')} />
                  {errors.new_customer?.city && (
                    <p className="mt-1 text-xs text-destructive">{errors.new_customer.city.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="new_customer.business_type">Business / customer type</Label>
                  <Select id="new_customer.business_type" {...register('new_customer.business_type')}>
                    {BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
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
                    Required when the beneficiary is a minor or has no personal phone
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="new_customer.guardian_name">Parent / guardian name</Label>
                    <Input
                      id="new_customer.guardian_name"
                      {...register('new_customer.guardian_name')}
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
                    />
                  </div>
                  <div>
                    <Label htmlFor="new_customer.next_of_kin_relationship">NOK relationship</Label>
                    <Select
                      id="new_customer.next_of_kin_relationship"
                      {...register('new_customer.next_of_kin_relationship')}
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
                    />
                  </div>
                </div>
              </div>

              <DocumentUploader
                value={documents}
                onChange={setDocuments}
                label="KYC / sales form uploads"
                description="Take a photo or upload JPG, PNG, or PDF — multiple pages for audit"
              />
            </div>
          )}

          <div>
            <Label>Payment type</Label>
            <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setValue('payment_type', 'full', {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  !isInstallment
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <CreditCard className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Full payment</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Paid in full — no outstanding balance on this sale
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setValue('payment_type', 'installment', {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  isInstallment
                    ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                    : 'border-border/80 hover:border-accent/40'
                )}
              >
                <CalendarClock className="mt-0.5 size-5 text-accent" />
                <div>
                  <p className="font-medium">Installment / PAYGO</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pick end date and how often (every 7 / 14 / 30 days)
                  </p>
                </div>
              </button>
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
              {isInstallment
                ? 'Preferred collection method for this PAYGO plan'
                : 'How this full payment was received'}
            </p>
          </div>

          {isInstallment && (
            <div className="space-y-4 rounded-xl border border-border/70 bg-secondary/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan_end_date">Plan end date</Label>
                  <Input
                    id="plan_end_date"
                    type="date"
                    min={minPlanEndDate}
                    {...register('plan_end_date')}
                    className="mt-1.5"
                  />
                  {errors.plan_end_date && (
                    <p className="mt-1 text-xs text-destructive">{errors.plan_end_date.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="installment_interval_days">Payment every</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="installment_interval_days"
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      inputMode="numeric"
                      {...register('installment_interval_days', { valueAsNumber: true })}
                      className="max-w-[140px]"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                  {errors.installment_interval_days && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.installment_interval_days.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quick end-date presets
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INSTALLMENT_WEEK_OPTIONS.map((weeks) => (
                    <button
                      key={weeks}
                      type="button"
                      onClick={() => applyWeekPreset(weeks)}
                      className="rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium hover:border-accent/50"
                    >
                      {weeks} weeks
                    </button>
                  ))}
                </div>
              </div>

              {planPreview && (
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                  <p className="font-medium">
                    {planPreview.count} payment{planPreview.count === 1 ? '' : 's'} ·{' '}
                    {formatCurrency(planPreview.amount)} each
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    First due {formatDate(planPreview.first_due)} · Last due{' '}
                    {formatDate(planPreview.last_due)}
                  </p>
                </div>
              )}
            </div>
          )}
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
              className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 md:grid-cols-[1fr_100px_1fr_auto]"
            >
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
                      {product.name} — {formatCurrency(product.price)} (stock {product.stock}{' '}
                      {product.unit})
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
                  onChange={(next) =>
                    setValue(`items.${index}.serial_number`, next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
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
        expectedState={deploymentState}
        expectedLga={deploymentLga}
        onGpsChange={setSiteGps}
        onPhotoChange={setSitePhotoFile}
        error={siteError}
      />

      {formError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting || hasDuplicates}>
          Create sale
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/sales')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
