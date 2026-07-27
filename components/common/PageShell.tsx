import { cn } from '@/lib/utils'

interface PageShellProps {
  children: React.ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn('page-enter mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8', className)}>
      {children}
    </div>
  )
}
