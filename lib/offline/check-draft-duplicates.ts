import { scanBeneficiaryDuplicatesAction } from '@/app/actions/customers'
import type { DuplicateMatch, DuplicateScanResult } from '@/lib/services/customers'
import { parseDeviceSerials } from '@/lib/utils/serial'

const IDENTITY_FIELDS = new Set(['phone', 'nin', 'bvn'])

export function identityDuplicates(scan: DuplicateScanResult): DuplicateMatch[] {
  return scan.hard.filter((match) =>
    (match.matched_fields || []).some((field) => IDENTITY_FIELDS.has(field))
  )
}

export function serialDuplicates(scan: DuplicateScanResult): DuplicateMatch[] {
  return scan.hard.filter((match) => (match.matched_fields || []).includes('serial'))
}

export function formatDuplicateMatch(match: DuplicateMatch) {
  const fields = (match.matched_fields || []).join(', ') || 'record'
  return `Duplicate ${fields} — already used by ${match.name}${match.id ? ` (${match.id})` : ''}`
}

export async function scanDraftDuplicates(input: {
  name?: string
  phone?: string
  nin?: string
  bvn?: string
  city?: string
  state?: string
  lga?: string
  address?: string
  serial?: string | string[]
  exclude_id?: string
}): Promise<DuplicateScanResult> {
  const result = await scanBeneficiaryDuplicatesAction(input)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export function saleItemSerials(
  items: Array<{ serial_number?: string; quantity?: number }>
): string[] {
  return parseDeviceSerials(items.map((item) => item.serial_number || ''))
}
