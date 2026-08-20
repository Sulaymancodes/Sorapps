import {
  APPROVED_DEPLOYMENT_AREAS,
  NIGERIA_BOUNDS,
  STATE_BOUNDS,
  SUBSIDY_LABELS,
  type DeploymentArea,
  type GeoBounds,
  type SubsidyLevel,
} from '@/lib/constants/deployment-areas'

export { NIGERIA_BOUNDS }

export type DeploymentContext = {
  state?: string
  lga?: string
}

export type DeploymentCheck = {
  in_nigeria: boolean
  /** State bbox that contains the point (best match by smallest area). */
  detected_state: string | null
  matched_area: DeploymentArea | null
  subsidy_level: SubsidyLevel
  subsidy_label: string
  /** True when GPS is outside approved deployment / expected state fence. */
  out_of_area: boolean
  reason: string | null
}

function pointInBounds(lat: number, lng: number, bounds: GeoBounds): boolean {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  )
}

/** Ray-casting point-in-polygon. Ring is [lat, lng][]. */
export function pointInPolygon(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]
    const xi = ring[i][1]
    const yj = ring[j][0]
    const xj = ring[j][1]
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function isWithinNigeria(lat: number, lng: number): boolean {
  return pointInBounds(lat, lng, NIGERIA_BOUNDS)
}

function boundsArea(bounds: GeoBounds): number {
  return (bounds.maxLat - bounds.minLat) * (bounds.maxLng - bounds.minLng)
}

export function detectStateForPoint(lat: number, lng: number): string | null {
  let best: { name: string; area: number } | null = null
  for (const [name, bounds] of Object.entries(STATE_BOUNDS)) {
    if (!pointInBounds(lat, lng, bounds)) continue
    const area = boundsArea(bounds)
    if (!best || area < best.area) best = { name, area }
  }
  return best?.name ?? null
}

function normalize(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase()
}

function areaContainsPoint(area: DeploymentArea, lat: number, lng: number): boolean {
  if (area.polygon?.length) {
    return pointInPolygon(lat, lng, area.polygon)
  }
  const bounds = STATE_BOUNDS[area.state]
  if (!bounds) return false
  return pointInBounds(lat, lng, bounds)
}

function areaMatchesExpected(area: DeploymentArea, expected?: DeploymentContext): boolean {
  if (!expected?.state?.trim()) return true
  if (normalize(area.state) !== normalize(expected.state)) return false
  if (!expected.lga?.trim()) return true
  if (!area.lgas?.length) return true
  return area.lgas.some((lga) => normalize(lga) === normalize(expected.lga))
}

function findMatchingAreas(lat: number, lng: number, expected?: DeploymentContext): DeploymentArea[] {
  return APPROVED_DEPLOYMENT_AREAS.filter(
    (area) => areaContainsPoint(area, lat, lng) && areaMatchesExpected(area, expected)
  )
}

/**
 * Validate live GPS against Nigeria bounds, approved deployment areas,
 * and the sale's selected state/LGA (when provided).
 */
export function evaluateDeploymentArea(
  lat: number,
  lng: number,
  expected?: DeploymentContext
): DeploymentCheck {
  const inNigeria = isWithinNigeria(lat, lng)
  const detectedState = inNigeria ? detectStateForPoint(lat, lng) : null

  if (!inNigeria) {
    return {
      in_nigeria: false,
      detected_state: null,
      matched_area: null,
      subsidy_level: 'none',
      subsidy_label: SUBSIDY_LABELS.none,
      out_of_area: true,
      reason: 'Coordinates are outside Nigeria.',
    }
  }

  const expectedState = expected?.state?.trim() || ''
  if (expectedState) {
    const expectedBounds = STATE_BOUNDS[expectedState]
    if (expectedBounds && !pointInBounds(lat, lng, expectedBounds)) {
      return {
        in_nigeria: true,
        detected_state: detectedState,
        matched_area: null,
        subsidy_level: 'none',
        subsidy_label: SUBSIDY_LABELS.none,
        out_of_area: true,
        reason: detectedState
          ? `GPS is in ${detectedState}, but the sale is registered for ${expectedState}.`
          : `GPS is outside the ${expectedState} deployment bounds.`,
      }
    }

    const expectedLga = expected?.lga?.trim() || ''
    if (expectedLga) {
      const stateAreas = APPROVED_DEPLOYMENT_AREAS.filter(
        (a) => normalize(a.state) === normalize(expectedState)
      )
      const lgaRestricted = stateAreas.filter((a) => a.lgas?.length)
      if (lgaRestricted.length) {
        const lgaOk = lgaRestricted.some((a) =>
          a.lgas!.some((lga) => normalize(lga) === normalize(expectedLga))
        )
        if (!lgaOk) {
          return {
            in_nigeria: true,
            detected_state: detectedState,
            matched_area: null,
            subsidy_level: 'none',
            subsidy_label: SUBSIDY_LABELS.none,
            out_of_area: true,
            reason: `${expectedLga}, ${expectedState} is not on the approved subsidy LGA list.`,
          }
        }
      }
    }
  }

  const matches = findMatchingAreas(lat, lng, expectedState ? expected : undefined)
  const matched =
    matches.find((a) => a.polygon?.length) ||
    matches.find((a) => a.lgas?.length && expected?.lga) ||
    matches[0] ||
    null

  if (!matched) {
    // Point may still fall in a Nigerian state that was removed from the approved list
    const anyStateMatch = APPROVED_DEPLOYMENT_AREAS.find((a) => areaContainsPoint(a, lat, lng))
    return {
      in_nigeria: true,
      detected_state: detectedState,
      matched_area: null,
      subsidy_level: 'none',
      subsidy_label: SUBSIDY_LABELS.none,
      out_of_area: true,
      reason: anyStateMatch
        ? `Location does not match the selected deployment area (${expectedState || 'none selected'}).`
        : detectedState
          ? `${detectedState} is not an approved subsidy deployment area.`
          : 'Location is outside approved deployment areas.',
    }
  }

  return {
    in_nigeria: true,
    detected_state: detectedState,
    matched_area: matched,
    subsidy_level: matched.subsidy_level,
    subsidy_label: SUBSIDY_LABELS[matched.subsidy_level],
    out_of_area: false,
    reason: null,
  }
}

/** Convenience: boolean out-of-area flag for forms / DB. */
export function isOutOfDeploymentArea(
  lat: number,
  lng: number,
  expected?: DeploymentContext
): boolean {
  return evaluateDeploymentArea(lat, lng, expected).out_of_area
}

export function formatGpsCoord(value: number, digits = 6): string {
  return value.toFixed(digits)
}
