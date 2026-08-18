/** Approximate bounding box for Nigeria (deployment area). */
export const NIGERIA_BOUNDS = {
  minLat: 4.2,
  maxLat: 13.9,
  minLng: 2.65,
  maxLng: 14.7,
} as const

export function isWithinNigeria(lat: number, lng: number): boolean {
  return (
    lat >= NIGERIA_BOUNDS.minLat &&
    lat <= NIGERIA_BOUNDS.maxLat &&
    lng >= NIGERIA_BOUNDS.minLng &&
    lng <= NIGERIA_BOUNDS.maxLng
  )
}

export function formatGpsCoord(value: number, digits = 6): string {
  return value.toFixed(digits)
}
