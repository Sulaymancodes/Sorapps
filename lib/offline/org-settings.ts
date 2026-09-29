'use client'

import { useEffect, useState } from 'react'
import { getOrgSettingsAction } from '@/app/actions/org-settings'

export const ORG_SETTINGS_CACHE_KEY = 'sorapps-org-settings'

export type CachedOrgSettings = {
  kyc_uploads_required: boolean
  synced_at: string
}

export function loadCachedOrgSettings(): CachedOrgSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORG_SETTINGS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedOrgSettings
    if (typeof parsed.kyc_uploads_required !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

export function saveCachedOrgSettings(settings: { kyc_uploads_required: boolean }) {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedOrgSettings = {
      kyc_uploads_required: settings.kyc_uploads_required,
      synced_at: new Date().toISOString(),
    }
    window.localStorage.setItem(ORG_SETTINGS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota
  }
}

export function kycUploadsRequiredFromCache() {
  return loadCachedOrgSettings()?.kyc_uploads_required === true
}

export async function refreshOrgSettingsCache(): Promise<{ ok: boolean; kyc_uploads_required: boolean }> {
  try {
    const result = await getOrgSettingsAction()
    if (!result.success) {
      return { ok: false, kyc_uploads_required: kycUploadsRequiredFromCache() }
    }
    saveCachedOrgSettings(result.data)
    return { ok: true, kyc_uploads_required: result.data.kyc_uploads_required }
  } catch {
    return { ok: false, kyc_uploads_required: kycUploadsRequiredFromCache() }
  }
}

export function useKycUploadsRequired(initial?: boolean) {
  const [required, setRequired] = useState(() =>
    typeof initial === 'boolean' ? initial : kycUploadsRequiredFromCache()
  )

  useEffect(() => {
    if (typeof initial === 'boolean') {
      saveCachedOrgSettings({ kyc_uploads_required: initial })
      setRequired(initial)
    }
    void refreshOrgSettingsCache().then((result) => {
      if (result.ok) setRequired(result.kyc_uploads_required)
    })
  }, [initial])

  return required
}
