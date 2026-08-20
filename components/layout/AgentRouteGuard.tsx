'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isAgentAllowedPath } from '@/lib/roles'

/** Client-side guard — agents only keep Sales, Customers, Activations, Calendar, Settings. */
export function AgentRouteGuard({
  isAgent,
  children,
}: {
  isAgent: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isAgent) return
    if (!isAgentAllowedPath(pathname)) {
      router.replace('/sales')
    }
  }, [isAgent, pathname, router])

  if (isAgent && !isAgentAllowedPath(pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-muted-foreground">
        Redirecting to Sales…
      </div>
    )
  }

  return <>{children}</>
}
