/**
 * Approved EDI SHS deployment areas + state bounding boxes.
 *
 * Ops can edit APPROVED_DEPLOYMENT_AREAS to match the official subsidy map.
 * Optional `lgas` narrows an area; empty/omitted means the whole state.
 * Optional `polygon` ([lat, lng][]) overrides the state bbox for that area.
 */

export type SubsidyLevel = 'tier_1' | 'tier_2' | 'tier_3' | 'none'

export type GeoBounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export type DeploymentArea = {
  id: string
  name: string
  state: string
  /** When set, only these LGAs are approved within the state. */
  lgas?: string[]
  subsidy_level: SubsidyLevel
  /** Optional tighter fence as [lat, lng] rings (ray-casting). */
  polygon?: Array<[number, number]>
}

/** Approximate Nigeria country bounds (fallback). */
export const NIGERIA_BOUNDS: GeoBounds = {
  minLat: 4.2,
  maxLat: 13.9,
  minLng: 2.65,
  maxLng: 14.7,
}

/**
 * State bounding boxes derived from public Nigeria state polygon outlines.
 * Keys match NIGERIAN_STATES display names.
 */
export const STATE_BOUNDS: Record<string, GeoBounds> = {
  Abia: { minLat: 4.8173, maxLat: 6.0286, minLng: 7.1425, maxLng: 7.9623 },
  Adamawa: { minLat: 7.436, maxLat: 10.9466, minLng: 11.3901, maxLng: 13.7357 },
  'Akwa Ibom': { minLat: 4.4724, maxLat: 5.5285, minLng: 7.4652, maxLng: 8.3263 },
  Anambra: { minLat: 5.6952, maxLat: 6.7724, minLng: 6.6193, maxLng: 7.3499 },
  Bauchi: { minLat: 9.5005, maxLat: 12.5036, minLng: 8.7012, maxLng: 11.0687 },
  Bayelsa: { minLat: 4.2697, maxLat: 5.3891, minLng: 5.3806, maxLng: 6.7181 },
  Benue: { minLat: 6.4463, maxLat: 8.1462, minLng: 7.5586, maxLng: 9.9179 },
  Borno: { minLat: 10.0229, maxLat: 13.7207, minLng: 11.6318, maxLng: 14.6722 },
  'Cross River': { minLat: 4.7352, maxLat: 6.8964, minLng: 7.869, maxLng: 9.462 },
  Delta: { minLat: 5.0225, maxLat: 6.5268, minLng: 4.996, maxLng: 6.7566 },
  Ebonyi: { minLat: 5.6925, maxLat: 6.7996, minLng: 7.5256, maxLng: 8.4471 },
  Edo: { minLat: 5.739, maxLat: 7.5708, minLng: 4.9796, maxLng: 6.7085 },
  Ekiti: { minLat: 7.2726, maxLat: 8.0674, minLng: 4.9081, maxLng: 5.8022 },
  Enugu: { minLat: 5.922, maxLat: 7.12, minLng: 6.9077, maxLng: 7.8635 },
  'Federal Capital Territory': {
    minLat: 8.3936,
    maxLat: 9.3542,
    minLng: 6.7429,
    maxLng: 7.6163,
  },
  Gombe: { minLat: 9.5886, maxLat: 11.3387, minLng: 10.5345, maxLng: 11.9421 },
  Imo: { minLat: 5.1812, maxLat: 5.9302, minLng: 6.6193, maxLng: 7.4048 },
  Jigawa: { minLat: 10.9331, maxLat: 12.9885, minLng: 8.1079, maxLng: 10.5963 },
  Kaduna: { minLat: 9.0045, maxLat: 11.4962, minLng: 6.0919, maxLng: 8.7822 },
  Kano: { minLat: 10.5472, maxLat: 12.5814, minLng: 7.6849, maxLng: 9.3466 },
  Katsina: { minLat: 11.1137, maxLat: 13.3469, minLng: 6.8719, maxLng: 8.9703 },
  Kebbi: { minLat: 10.0933, maxLat: 13.2239, minLng: 3.4937, maxLng: 6.026 },
  Kogi: { minLat: 6.5227, maxLat: 8.7276, minLng: 5.3421, maxLng: 7.8772 },
  Kwara: { minLat: 7.964, maxLat: 10.1527, minLng: 2.7315, maxLng: 6.1963 },
  Lagos: { minLat: 6.3726, maxLat: 6.7055, minLng: 2.7109, maxLng: 4.3451 },
  Nasarawa: { minLat: 7.7818, maxLat: 9.3624, minLng: 6.9379, maxLng: 9.6075 },
  Niger: { minLat: 8.1925, maxLat: 11.3508, minLng: 3.5843, maxLng: 7.3224 },
  Ogun: { minLat: 6.3126, maxLat: 7.9722, minLng: 2.6834, maxLng: 4.5923 },
  Ondo: { minLat: 5.8592, maxLat: 7.7654, minLng: 4.3561, maxLng: 6.0287 },
  Osun: { minLat: 6.9673, maxLat: 8.081, minLng: 4.0292, maxLng: 5.0592 },
  Oyo: { minLat: 7.0518, maxLat: 9.1862, minLng: 2.6862, maxLng: 4.5538 },
  Plateau: { minLat: 8.3501, maxLat: 10.3446, minLng: 8.5364, maxLng: 10.6512 },
  Rivers: { minLat: 4.3519, maxLat: 5.687, minLng: 6.3844, maxLng: 7.5902 },
  Sokoto: { minLat: 11.5312, maxLat: 13.8914, minLng: 4.1281, maxLng: 6.7676 },
  Taraba: { minLat: 6.4982, maxLat: 9.5953, minLng: 9.1132, maxLng: 11.9751 },
  Yobe: { minLat: 10.5904, maxLat: 13.3763, minLng: 9.668, maxLng: 12.4915 },
  Zamfara: { minLat: 10.8765, maxLat: 13.1865, minLng: 5.0153, maxLng: 7.229 },
}

/**
 * Default approved deployment map.
 * Replace / narrow this list when the official EDI subsidy area schedule is provided.
 * Tier 1 = highest subsidy band, tier 3 = lowest among approved areas.
 */
export const APPROVED_DEPLOYMENT_AREAS: DeploymentArea[] = [
  // North-east / high-need band
  { id: 'adamawa', name: 'Adamawa', state: 'Adamawa', subsidy_level: 'tier_1' },
  { id: 'bauchi', name: 'Bauchi', state: 'Bauchi', subsidy_level: 'tier_1' },
  { id: 'borno', name: 'Borno', state: 'Borno', subsidy_level: 'tier_1' },
  { id: 'gombe', name: 'Gombe', state: 'Gombe', subsidy_level: 'tier_1' },
  { id: 'taraba', name: 'Taraba', state: 'Taraba', subsidy_level: 'tier_1' },
  { id: 'yobe', name: 'Yobe', state: 'Yobe', subsidy_level: 'tier_1' },
  // North-west / north-central
  { id: 'jigawa', name: 'Jigawa', state: 'Jigawa', subsidy_level: 'tier_1' },
  { id: 'katsina', name: 'Katsina', state: 'Katsina', subsidy_level: 'tier_1' },
  { id: 'kebbi', name: 'Kebbi', state: 'Kebbi', subsidy_level: 'tier_1' },
  { id: 'sokoto', name: 'Sokoto', state: 'Sokoto', subsidy_level: 'tier_1' },
  { id: 'zamfara', name: 'Zamfara', state: 'Zamfara', subsidy_level: 'tier_1' },
  { id: 'kano', name: 'Kano', state: 'Kano', subsidy_level: 'tier_2' },
  { id: 'kaduna', name: 'Kaduna', state: 'Kaduna', subsidy_level: 'tier_2' },
  { id: 'niger', name: 'Niger', state: 'Niger', subsidy_level: 'tier_2' },
  { id: 'kwara', name: 'Kwara', state: 'Kwara', subsidy_level: 'tier_2' },
  { id: 'kogi', name: 'Kogi', state: 'Kogi', subsidy_level: 'tier_2' },
  { id: 'benue', name: 'Benue', state: 'Benue', subsidy_level: 'tier_2' },
  { id: 'plateau', name: 'Plateau', state: 'Plateau', subsidy_level: 'tier_2' },
  { id: 'nasarawa', name: 'Nasarawa', state: 'Nasarawa', subsidy_level: 'tier_2' },
  { id: 'fct', name: 'Federal Capital Territory', state: 'Federal Capital Territory', subsidy_level: 'tier_3' },
  // South / south-east / south-south
  { id: 'ebonyi', name: 'Ebonyi', state: 'Ebonyi', subsidy_level: 'tier_2' },
  { id: 'cross-river', name: 'Cross River', state: 'Cross River', subsidy_level: 'tier_2' },
  { id: 'akwa-ibom', name: 'Akwa Ibom', state: 'Akwa Ibom', subsidy_level: 'tier_2' },
  { id: 'bayelsa', name: 'Bayelsa', state: 'Bayelsa', subsidy_level: 'tier_2' },
  { id: 'rivers', name: 'Rivers', state: 'Rivers', subsidy_level: 'tier_3' },
  { id: 'delta', name: 'Delta', state: 'Delta', subsidy_level: 'tier_3' },
  { id: 'edo', name: 'Edo', state: 'Edo', subsidy_level: 'tier_3' },
  { id: 'anambra', name: 'Anambra', state: 'Anambra', subsidy_level: 'tier_3' },
  { id: 'enugu', name: 'Enugu', state: 'Enugu', subsidy_level: 'tier_3' },
  { id: 'abia', name: 'Abia', state: 'Abia', subsidy_level: 'tier_3' },
  { id: 'imo', name: 'Imo', state: 'Imo', subsidy_level: 'tier_3' },
  // South-west (often lower / urban subsidy)
  { id: 'ondo', name: 'Ondo', state: 'Ondo', subsidy_level: 'tier_3' },
  { id: 'ekiti', name: 'Ekiti', state: 'Ekiti', subsidy_level: 'tier_3' },
  { id: 'osun', name: 'Osun', state: 'Osun', subsidy_level: 'tier_3' },
  { id: 'ogun', name: 'Ogun', state: 'Ogun', subsidy_level: 'tier_3' },
  { id: 'oyo', name: 'Oyo', state: 'Oyo', subsidy_level: 'tier_3' },
  { id: 'lagos', name: 'Lagos', state: 'Lagos', subsidy_level: 'tier_3' },
]

export const SUBSIDY_LABELS: Record<SubsidyLevel, string> = {
  tier_1: 'Tier 1 (highest subsidy)',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
  none: 'Not subsidised',
}
