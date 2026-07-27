export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value).toFixed(decimals)}%`
}

export function formatPhone(phone: string): string {
  // Format Nigerian phone numbers
  return phone.replace(/(\+234)(\d{3})(\d{3})(\d{4})/, '$1 $2 $3 $4')
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatTime(date: Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '-'
  return `${formatDate(date)} ${formatTime(date)}`
}

export function formatDaysAgo(date: Date | null | undefined): string {
  if (!date) return '-'
  const now = new Date()
  const d = new Date(date)
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

export function truncate(text: string, length: number = 50): string {
  return text.length > length ? `${text.substring(0, length)}...` : text
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
