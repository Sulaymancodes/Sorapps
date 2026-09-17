'use client'

import { useEffect } from 'react'
import { SerwistProvider } from '@serwist/next/react'
import { hardNavigate, isSameOriginAppPath, PUBLIC_OFFLINE_ROUTES, requestAppShellCache, shouldHardNavigate } from '@/lib/offline/app-shell'

function OfflineNavigation() {
  useEffect(() => {
    void requestAppShellCache(PUBLIC_OFFLINE_ROUTES)
    function onClick(event: MouseEvent) {
      if (!shouldHardNavigate()) return
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || !isSameOriginAppPath(href)) return

      event.preventDefault()
      event.stopPropagation()
      hardNavigate(anchor.pathname + anchor.search + anchor.hash)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === 'development'}
      register
      cacheOnNavigation
      reloadOnOnline={false}
    >
      <OfflineNavigation />
      {children}
    </SerwistProvider>
  )
}
