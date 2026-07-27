import { cn } from '@/lib/utils'
import { STATUS_COLORS, PAYMENT_STATUS_COLORS } from '@/lib/constants/colors'

type StatusType = 'pending' | 'paid' | 'overdue' | 'draft' | 'sent' | 'delivered' | 'processing' | 'cancelled'
type PaymentStatusType = 'paid' | 'pending' | 'overdue' | 'partial'

interface StatusBadgeProps {
  status: StatusType | PaymentStatusType
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const allColors = { ...STATUS_COLORS, ...PAYMENT_STATUS_COLORS }
  const color = allColors[status as keyof typeof allColors] || '#64748b'

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    paid: 'Paid',
    overdue: 'Overdue',
    draft: 'Draft',
    sent: 'Sent',
    delivered: 'Delivered',
    processing: 'Processing',
    cancelled: 'Cancelled',
    partial: 'Partial Payment',
  }

  const getBackgroundColor = (color: string) => {
    const colorMap: Record<string, string> = {
      '#10b981': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      '#f59e0b': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      '#ef4444': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      '#06b6d4': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      '#64748b': 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
      '#8b5cf6': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    }
    return colorMap[color] || colorMap['#64748b']
  }

  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getBackgroundColor(color), className)}>
      {statusLabels[status]}
    </span>
  )
}
