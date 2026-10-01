'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, TriangleAlert, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/common/Panel'
import { evaluateDeploymentArea } from '@/lib/utils/gps'
import { savePhotoOnThisPhone } from '@/lib/offline/save-phone-photo'
import type { SaleSiteGpsInput } from '@/lib/types/crm'

type SiteVerificationProps = {
  gps: SaleSiteGpsInput | null
  photoFile: File | null
  existingPhotoUrl?: string
  expectedState?: string
  expectedLga?: string
  onGpsChange: (gps: SaleSiteGpsInput | null) => void
  onPhotoChange: (file: File | null) => void
  error?: string | null
}

function buildGpsResult(
  latitude: number,
  longitude: number,
  expectedState?: string,
  expectedLga?: string
): SaleSiteGpsInput {
  const check = evaluateDeploymentArea(latitude, longitude, {
    state: expectedState,
    lga: expectedLga,
  })
  return {
    latitude,
    longitude,
    captured_at: new Date().toISOString(),
    locked: true,
    out_of_area: check.out_of_area,
    deployment_area_id: check.matched_area?.id ?? null,
    deployment_area_name: check.matched_area?.name ?? null,
    subsidy_level: check.subsidy_level,
    out_of_area_reason: check.reason,
  }
}

function readLiveGps(expectedState?: string, expectedLga?: string): Promise<SaleSiteGpsInput> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device/browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          buildGpsResult(
            position.coords.latitude,
            position.coords.longitude,
            expectedState,
            expectedLga
          )
        )
      },
      (err) => {
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied — allow GPS access and try again'
              : 'Could not capture GPS. Move outdoors and try again.'
          )
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )
  })
}

export function SiteVerificationPanel({
  gps,
  photoFile,
  existingPhotoUrl,
  expectedState,
  expectedLga,
  onGpsChange,
  onPhotoChange,
  error,
}: SiteVerificationProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const pendingGpsRef = useRef<Promise<SaleSiteGpsInput> | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [clearedExisting, setClearedExisting] = useState(false)

  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (!photoFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(photoFile)
    previewUrlRef.current = url
    setPreviewUrl(url)
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [photoFile])

  // Re-evaluate out-of-area when state/LGA changes after GPS is locked
  useEffect(() => {
    if (!gps?.locked) return
    const check = evaluateDeploymentArea(gps.latitude, gps.longitude, {
      state: expectedState,
      lga: expectedLga,
    })
    const nextReason = check.reason
    const nextAreaId = check.matched_area?.id ?? null
    const nextAreaName = check.matched_area?.name ?? null
    if (
      check.out_of_area === gps.out_of_area &&
      nextReason === (gps.out_of_area_reason ?? null) &&
      nextAreaId === (gps.deployment_area_id ?? null) &&
      nextAreaName === (gps.deployment_area_name ?? null) &&
      check.subsidy_level === (gps.subsidy_level ?? null)
    ) {
      return
    }
    onGpsChange({
      ...gps,
      out_of_area: check.out_of_area,
      deployment_area_id: nextAreaId,
      deployment_area_name: nextAreaName,
      subsidy_level: check.subsidy_level,
      out_of_area_reason: nextReason,
    })
  }, [expectedState, expectedLga, gps, onGpsChange])

  const openCameraWithGps = () => {
    setLocalError(null)
    pendingGpsRef.current = readLiveGps(expectedState, expectedLga)
    cameraRef.current?.click()
  }

  const openUploadWithGps = () => {
    setLocalError(null)
    pendingGpsRef.current = readLiveGps(expectedState, expectedLga)
    uploadRef.current?.click()
  }

  const attachPhotoAndGps = async (file: File) => {
    setLocalError(null)
    setBusy(true)
    setStatus('Capturing GPS…')

    const gpsPromise = pendingGpsRef.current ?? readLiveGps(expectedState, expectedLga)
    pendingGpsRef.current = null

    try {
      if (!file.type.startsWith('image/')) {
        setLocalError('Choose an image file for the unit photo')
        return
      }

      const gpsResult = await gpsPromise
      onGpsChange({
        ...gpsResult,
        captured_at: new Date().toISOString(),
        locked: true,
      })
      onPhotoChange(file)
      setStatus('Saving a copy on this phone…')
      await savePhotoOnThisPhone(file)
      setStatus('Copy saved on this phone')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Photo + GPS capture failed')
      setStatus(null)
    } finally {
      setBusy(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  const shownPhotoUrl = previewUrl || (!clearedExisting ? existingPhotoUrl : undefined)

  const clearPhoto = () => {
    onPhotoChange(null)
    setClearedExisting(true)
    setLocalError(null)
  }

  return (
    <Panel title="Unit photo">
      <div className="space-y-3">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void attachPhotoAndGps(file)
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void attachPhotoAndGps(file)
          }}
        />

        {shownPhotoUrl ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-secondary/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shownPhotoUrl}
              alt="Unit photo"
              className="max-h-56 w-full object-cover"
            />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="truncate text-xs text-muted-foreground">
                {busy ? status || 'Working…' : previewUrl ? 'Unit photo attached' : 'Saved unit photo'}
              </p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={openCameraWithGps}
                >
                  <Camera className="size-3.5" />
                  Retake
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={openUploadWithGps}
                >
                  <Upload className="size-3.5" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={clearPhoto}
                >
                  <X className="size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={openCameraWithGps}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/20 px-4 py-10 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
            >
              {busy ? (
                <RefreshCw className="size-10 animate-spin text-primary" />
              ) : (
                <Camera className="size-10 text-primary" />
              )}
              <span className="text-base font-medium">
                {busy ? status || 'Working…' : 'Take photo of unit'}
              </span>
              {!busy && (
                <span className="text-xs text-muted-foreground">Use device camera</span>
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openUploadWithGps}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/20 px-4 py-10 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
            >
              {busy ? (
                <RefreshCw className="size-10 animate-spin text-primary" />
              ) : (
                <Upload className="size-10 text-primary" />
              )}
              <span className="text-base font-medium">
                {busy ? status || 'Working…' : 'Upload photo'}
              </span>
              {!busy && (
                <span className="text-xs text-muted-foreground">Choose from this device</span>
              )}
            </button>
          </div>
        )}

        {gps?.out_of_area && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>
              {gps.out_of_area_reason ||
                'This photo was taken outside the approved deployment area.'}
            </p>
          </div>
        )}

        {(localError || error) && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {localError || error}
          </p>
        )}
      </div>
    </Panel>
  )
}
