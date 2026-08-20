export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Federal Capital Territory',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const

export type NigerianState = (typeof NIGERIAN_STATES)[number]

export const BUSINESS_TYPES = [
  'Retail Store',
  'Shopping Mall',
  'Restaurant',
  'Hotel',
  'Hospital',
  'School',
  'Factory',
  'Farm',
  'Office',
  'Household',
] as const

export const GUARDIAN_RELATIONSHIPS = [
  'Parent',
  'Guardian',
  'Spouse',
  'Sibling',
  'Relative',
  'Caregiver',
  'Other',
] as const

export const INSTALLMENT_WEEK_OPTIONS = [4, 6, 8, 12] as const

export const VAT_RATE = 0.075

export const PRODUCT_CATEGORIES = [
  'Solar Panels',
  'Inverters',
  'Batteries',
  'Charge Controllers',
  'Mounting Systems',
  'Cables & Connectors',
  'Safety Equipment',
  'Monitoring Systems',
  'Accessories',
  'Installation Services',
] as const

export const PRODUCT_BRANDS = [
  'SunPower',
  'Canadian Solar',
  'JinkoSolar',
  'Longi',
  'First Solar',
  'Victron',
  'Growatt',
  'MPPT',
] as const

export const PRODUCT_UNITS = ['pcs', 'set', 'roll', 'pack', 'unit'] as const

export const INVENTORY_MOVEMENT_TYPES = [
  { value: 'in', label: 'Stock In' },
  { value: 'out', label: 'Stock Out' },
  { value: 'adjustment', label: 'Adjustment (set absolute qty)' },
] as const
