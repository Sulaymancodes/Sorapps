export function nextId(prefix: string, existing: string[], pad: number) {
  const nums = existing
    .map((id) => Number(id.replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(pad, '0')}`
}
