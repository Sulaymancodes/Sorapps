/**
 * DARES / Odyssey claim dropdowns (PMU-aligned).
 * Values are fixed lists for agents — update if REA publishes a revised template.
 */

export const DARES_GENDERS = ['Male', 'Female', 'Prefer not to say'] as const

export const DARES_CUSTOMER_CATEGORIES = [
  'Household',
  'MSME',
  'Public Institution',
  'Farmer',
  'Other',
] as const

/** Customer Type — PIM examples: Anchor, Productive, Residential, Public, Commercial */
export const DARES_CUSTOMER_TYPES = [
  'Residential',
  'Commercial',
  'Productive Use',
  'Anchor',
  'Public',
  'MSME',
] as const

export const DARES_TYPES_OF_PAYMENT = [
  'Cash',
  'Mobile Money',
  'Bank Transfer',
  'PAYGO',
  'Other',
] as const

export const DARES_PAYMENT_PLANS = [
  'Full Payment',
  'Daily',
  'Weekly',
  'Bi-weekly',
  'Monthly',
  'Custom Installment',
] as const

export type DaresGender = (typeof DARES_GENDERS)[number]
export type DaresCustomerCategory = (typeof DARES_CUSTOMER_CATEGORIES)[number]
export type DaresCustomerType = (typeof DARES_CUSTOMER_TYPES)[number]
export type DaresTypeOfPayment = (typeof DARES_TYPES_OF_PAYMENT)[number]
export type DaresPaymentPlan = (typeof DARES_PAYMENT_PLANS)[number]

/** Build Odyssey-style Location (Address) from structured parts. */
export function composeDaresAddress(parts: {
  house_number?: string
  building_features?: string
  street?: string
  landmark?: string
  fallback?: string
}): string {
  const house = (parts.house_number || '').trim()
  const building = (parts.building_features || '').trim()
  const street = (parts.street || '').trim()
  const landmark = (parts.landmark || '').trim()
  const chunks = [
    house ? `House No: ${house}` : '',
    building ? `Building: ${building}` : '',
    street ? `Street: ${street}` : '',
    landmark ? `Landmark: ${landmark}` : '',
  ].filter(Boolean)
  if (chunks.length) return chunks.join(' | ')
  return (parts.fallback || '').trim()
}
