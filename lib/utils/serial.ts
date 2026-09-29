export function serialLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function sameSerialKey(left: string, right: string) {
  const a = serialLookupKey(left)
  const b = serialLookupKey(right)
  return Boolean(a) && a === b
}

export function parseDeviceSerials(raw?: string | string[] | null): string[] {
  if (!raw) return []
  const text = Array.isArray(raw) ? raw.join(',') : raw
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export type SoldSerialHit = {
  serial: string
  sale_id: string
  customer_id: string
  customer_name: string
}

export function soldSerialMessage(hit: SoldSerialHit) {
  const who = hit.customer_name ? ` to ${hit.customer_name}` : ''
  const sale = hit.sale_id ? ` (sale ${hit.sale_id})` : ''
  return `Serial ${hit.serial} has already been sold${who}${sale}. Use a different serial.`
}
