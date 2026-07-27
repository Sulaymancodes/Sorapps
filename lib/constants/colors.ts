export const COLORS = {
  primary: '#1a5c3a',
  accent: '#e06b2b',
  success: '#0f9f6e',
  warning: '#d4a017',
  error: '#dc3d3d',
  info: '#2a7a9b',
  dark: '#12261c',
  light: '#ffffff',
} as const

export const STATUS_COLORS = {
  pending: '#f59e0b',
  paid: '#10b981',
  overdue: '#ef4444',
  draft: '#64748b',
  sent: '#06b6d4',
  delivered: '#10b981',
  processing: '#8b5cf6',
  cancelled: '#64748b',
} as const

export const PAYMENT_STATUS_COLORS = {
  paid: '#10b981',
  pending: '#f59e0b',
  overdue: '#ef4444',
  partial: '#06b6d4',
} as const
