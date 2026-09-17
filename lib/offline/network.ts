export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function isLikelyNetworkError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|offline|err_internet_disconnected|err_network_changed|err_connection/i.test(
    message
  )
}

export function subscribeToNetworkStatus(onChange: (online: boolean) => void) {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => onChange(true)
  const handleOffline = () => onChange(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
