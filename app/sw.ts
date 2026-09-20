/// <reference lib="webworker" />
import { defaultCache, PAGES_CACHE_NAME } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/')
}

function isDocumentRequest(request: Request) {
  return request.mode === 'navigate' || request.destination === 'document'
}

function isRscRequest(request: Request, url: URL) {
  if (request.headers.get('Next-Router-Prefetch') === '1') return false
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')
}

const APP_NAV_FALLBACKS = [
  '/sales/new',
  '/sales',
  '/customers/new',
  '/customers',
  '/sales/drafts',
  '/dashboard',
  '/login',
  '/~offline',
]

async function cachedPage(path: string) {
  const cache = await caches.open(PAGES_CACHE_NAME.html)
  return cache.match(new URL(path, self.location.origin).toString(), { ignoreSearch: true })
}

const pagePlugins = [
  new CacheableResponsePlugin({ statuses: [200] }),
  new ExpirationPlugin({
    maxEntries: 64,
    maxAgeSeconds: 7 * 24 * 60 * 60,
    maxAgeFrom: 'last-used',
  }),
  {
    cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
      const url = new URL(request.url)
      url.search = ''
      url.hash = ''
      return url.href
    },
  },
  {
    handlerDidError: async ({ request }: { request: Request }) => {
      if (!isDocumentRequest(request)) return undefined
      const pathname = new URL(request.url).pathname
      for (const path of [...new Set([pathname, ...APP_NAV_FALLBACKS])]) {
        const hit = await cachedPage(path)
        if (hit) return hit
      }
      return undefined
    },
  },
]

const pagesHandler = new NetworkFirst({
  cacheName: PAGES_CACHE_NAME.html,
  networkTimeoutSeconds: 3,
  matchOptions: { ignoreSearch: true },
  plugins: pagePlugins,
})

const rscHandler = new NetworkFirst({
  cacheName: PAGES_CACHE_NAME.rsc,
  networkTimeoutSeconds: 3,
  matchOptions: { ignoreSearch: true },
  plugins: pagePlugins,
})

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    ignoreURLParametersMatching: [/^_rsc$/],
  },
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && isApiPath(url.pathname),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin
        && !isApiPath(url.pathname)
        && isDocumentRequest(request)
        && self.navigator.onLine === false,
      handler: new CacheFirst({
        cacheName: PAGES_CACHE_NAME.html,
        matchOptions: { ignoreSearch: true },
        plugins: pagePlugins,
      }),
    },
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && !isApiPath(url.pathname) && isDocumentRequest(request),
      handler: pagesHandler,
    },
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && !isApiPath(url.pathname) && isRscRequest(request, url),
      handler: rscHandler,
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return isDocumentRequest(request)
        },
      },
    ],
  },
})

async function cacheAppShell(urls: string[]) {
  const htmlCache = await caches.open(PAGES_CACHE_NAME.html)
  const rscCache = await caches.open(PAGES_CACHE_NAME.rsc)

  for (const path of urls) {
    const url = new URL(path, self.location.origin).toString()
    try {
      const htmlRes = await fetch(url, { credentials: 'same-origin' })
      if (htmlRes.ok && !htmlRes.redirected) {
        await htmlCache.put(url, htmlRes.clone())
      }

      const rscRes = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          RSC: '1',
          Accept: 'text/x-component',
        },
      })
      if (rscRes.ok && !rscRes.redirected) {
        await rscCache.put(url, rscRes.clone())
      }
    } catch {
      // Page may be unreachable; keep whatever is already cached.
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; urls?: string[] } | undefined
  if (data?.type !== 'CACHE_APP_SHELL' || !Array.isArray(data.urls)) return
  event.waitUntil(cacheAppShell(data.urls))
})

serwist.addEventListeners()
