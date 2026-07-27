import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
  containerClassName?: string
}

export function SearchField({ className, containerClassName, ...props }: SearchFieldProps) {
  return (
    <label
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-lg border border-border/80 bg-background/80 px-3 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
        containerClassName
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        className={cn(
          'w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground',
          className
        )}
        {...props}
      />
    </label>
  )
}
