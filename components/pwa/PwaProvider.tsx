'use client'

import { useEffect } from 'react'
import { SerwistProvider } from '@serwist/next/react'
import {
  findCachedAppPath,
  hardNavigate,
  isOfflineFieldCaptureHref,
  isSameOriginAppPath,
  offlineFallbackPath,
  PUBLIC_OFFLINE_ROUTES,
  requestAppShellCache,
  shouldHardNavigate,
  stayOnCachedOfflineShell,
} from '@/lib/offline/app-shell'

function OfflineNavigation() {
  useEffect(() => {
    void requestAppShellCache(PUBLIC_OFFLINE_ROUTES)
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href) return

      const onShell = window.location.pathname === '/~offline'
      if (href.startsWith('#')) {
        if (!onShell) return
        event.preventDefault()
        event.stopPropagation()
        stayOnCachedOfflineShell('/~offline', '', href)
        return
      }

      if (!isSameOriginAppPath(href)) return

      if (onShell && isOfflineFieldCaptureHref(anchor.pathname + anchor.search + anchor.hash)) {
        event.preventDefault()
        event.stopPropagation()
        stayOnCachedOfflineShell(anchor.pathname, anchor.search, anchor.hash)
        return
      }

      if (!shouldHardNavigate()) return

      event.preventDefault()
      event.stopPropagation()

      if (onShell) {
        stayOnCachedOfflineShell('/~offline')
        return
      }

      void (async () => {
        if (stayOnCachedOfflineShell(anchor.pathname, anchor.search, anchor.hash)) return
        if (anchor.pathname.startsWith('/login')) {
          hardNavigate(anchor.pathname + anchor.search + anchor.hash)
          return
        }
        const cached = await findCachedAppPath(anchor.pathname)
        if (cached && stayOnCachedOfflineShell(cached)) return
        const fallback = offlineFallbackPath(anchor.pathname)
        const fallbackUrl = new URL(fallback, window.location.origin)
        if (stayOnCachedOfflineShell(fallbackUrl.pathname, fallbackUrl.search, fallbackUrl.hash)) {
          return
        }
        hardNavigate(cached || fallback)
      })()
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
