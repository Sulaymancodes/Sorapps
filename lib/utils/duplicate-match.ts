/**
 * Soft / fuzzy beneficiary duplicate helpers.
 * Hard matches (exact phone / NIN / BVN / serial) stay in the customers service.
 */

const TITLE_RE =
  /\b(mr|mrs|ms|miss|dr|alhaji|alh|chief|engr|eng|hon|pastor|rev|mallam|haja|hajia)\b\.?/g

export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(TITLE_RE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nameTokens(name: string): string[] {
  return normalizePersonName(name)
    .split(' ')
    .filter((t) => t.length > 1)
}

function bigrams(value: string): string[] {
  const s = ` ${value} `
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

/** Sørensen–Dice coefficient on character bigrams (0–1). */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.length || !B.length) return 0
  const counts = new Map<string, number>()
  for (const g of A) counts.set(g, (counts.get(g) || 0) + 1)
  let overlap = 0
  for (const g of B) {
    const n = counts.get(g) || 0
    if (n > 0) {
      overlap += 1
      counts.set(g, n - 1)
    }
  }
  return (2 * overlap) / (A.length + B.length)
}

function jaccardTokens(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  let inter = 0
  for (const t of new Set(a)) if (setB.has(t)) inter += 1
  const union = new Set([...a, ...b]).size
  return union ? inter / union : 0
}

function containmentRatio(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const [smaller, larger] = a.length <= b.length ? [a, b] : [b, a]
  const large = new Set(larger)
  let hit = 0
  for (const t of smaller) if (large.has(t)) hit += 1
  return hit / smaller.length
}

/** Name similarity 0–1 combining exact, token, and dice scores. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizePersonName(a)
  const nb = normalizePersonName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ta = nameTokens(a)
  const tb = nameTokens(b)
  const sortedA = [...ta].sort().join(' ')
  const sortedB = [...tb].sort().join(' ')
  if (sortedA && sortedA === sortedB) return 0.98

  const dice = Math.max(diceCoefficient(na, nb), diceCoefficient(sortedA, sortedB))
  const jaccard = jaccardTokens(ta, tb)
  const contain = containmentRatio(ta, tb)

  // Shared surname boost (last token)
  let surname = 0
  if (ta.length && tb.length && ta[ta.length - 1] === tb[tb.length - 1] && ta[ta.length - 1].length > 2) {
    surname = 0.15
  }

  return Math.min(1, Math.max(dice, jaccard * 0.95, contain * 0.9) + surname * (contain > 0.4 ? 1 : 0))
}

export function sameNormalized(a?: string | null, b?: string | null): boolean {
  const x = (a || '').trim().toLowerCase()
  const y = (b || '').trim().toLowerCase()
  return Boolean(x && y && x === y)
}

export type SoftMatchReason =
  | 'similar_name'
  | 'same_name'
  | 'name_and_state'
  | 'name_and_lga'
  | 'name_and_city'
  | 'name_and_address'
  | 'shared_surname_same_area'

export function scoreSoftDuplicate(input: {
  name: string
  city?: string
  state?: string
  lga?: string
  address?: string
  candidate: {
    name: string
    city?: string
    state?: string
    lga?: string
    address?: string
  }
}): { score: number; reasons: SoftMatchReason[] } | null {
  const sim = nameSimilarity(input.name, input.candidate.name)
  if (sim < 0.72) return null

  const reasons: SoftMatchReason[] = []
  let score = Math.round(sim * 70)

  if (sim >= 0.97) {
    reasons.push('same_name')
    score += 15
  } else {
    reasons.push('similar_name')
  }

  if (sameNormalized(input.state, input.candidate.state)) {
    reasons.push('name_and_state')
    score += 8
  }
  if (sameNormalized(input.lga, input.candidate.lga)) {
    reasons.push('name_and_lga')
    score += 12
  }
  if (sameNormalized(input.city, input.candidate.city)) {
    reasons.push('name_and_city')
    score += 10
  }

  const addrA = (input.address || '').trim().toLowerCase().slice(0, 24)
  const addrB = (input.candidate.address || '').trim().toLowerCase().slice(0, 24)
  if (addrA.length >= 8 && addrB.length >= 8 && (addrA.includes(addrB) || addrB.includes(addrA))) {
    reasons.push('name_and_address')
    score += 14
  }

  const ta = nameTokens(input.name)
  const tb = nameTokens(input.candidate.name)
  if (
    ta.length &&
    tb.length &&
    ta[ta.length - 1] === tb[tb.length - 1] &&
    sameNormalized(input.state, input.candidate.state) &&
    sim < 0.97
  ) {
    reasons.push('shared_surname_same_area')
    score += 5
  }

  // Require at least name signal; elevate when geo/address reinforces
  if (sim < 0.85 && reasons.length < 2) return null

  return { score: Math.min(100, score), reasons }
}

export function formatSoftReason(reason: SoftMatchReason): string {
  switch (reason) {
    case 'same_name':
      return 'Exact same name'
    case 'similar_name':
      return 'Similar name'
    case 'name_and_state':
      return 'Same state'
    case 'name_and_lga':
      return 'Same LGA'
    case 'name_and_city':
      return 'Same city'
    case 'name_and_address':
      return 'Similar address'
    case 'shared_surname_same_area':
      return 'Shared surname in same state'
    default:
      return reason
  }
}
