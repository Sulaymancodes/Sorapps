'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Lock, MapPin, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/common/Panel'
import { getR2StatusAction } from '@/app/actions/uploads'
import { evaluateDeploymentArea, formatGpsCoord } from '@/lib/utils/gps'
import { SUBSIDY_LABELS, type SubsidyLevel } from '@/lib/constants/deployment-areas'
import { cn } from '@/lib/utils'
import type { SaleSiteGpsInput } from '@/lib/types/crm'

type SiteVerificationProps = {
  gps: SaleSiteGpsInput | null
  photoFile: File | null
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
  expectedState,
  expectedLga,
  onGpsChange,
  onPhotoChange,
  error,
}: SiteVerificationProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingGpsRef = useRef<Promise<SaleSiteGpsInput> | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [r2Ready, setR2Ready] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setR2Ready(null)
      return
    }
    void getR2StatusAction()
      .then((result) => {
        if (result.success) setR2Ready(result.data.configured)
        else setR2Ready(null)
      })
      .catch(() => setR2Ready(null))
  }, [])

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
    fileRef.current?.click()
  }

  const attachPhotoAndGps = async (file: File) => {
    setLocalError(null)
    setBusy(true)
    setStatus('Capturing GPS…')

    const gpsPromise = pendingGpsRef.current ?? readLiveGps(expectedState, expectedLga)
    pendingGpsRef.current = null

    try {
      if (!file.type.startsWith('image/')) {
        setLocalError('Choose an image file for the site photo')
        return
      }

      const gpsResult = await gpsPromise
      onGpsChange({
        ...gpsResult,
        captured_at: new Date().toISOString(),
        locked: true,
      })
      onPhotoChange(file)
      setStatus(null)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Photo + GPS capture failed')
    } finally {
      setBusy(false)
      setStatus(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const recaptureGpsOnly = async () => {
    setLocalError(null)
    setBusy(true)
    setStatus('Recapturing GPS…')
    try {
      const next = await readLiveGps(expectedState, expectedLga)
      onGpsChange(next)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'GPS recapture failed')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  const clearPhoto = () => {
    onPhotoChange(null)
    setLocalError(null)
  }

  return (
    <Panel
      title="Site GPS & photo"
      description="Photo stays on this form until you submit — then it uploads. Offline, it is stored in the sale draft with GPS."
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border/70 bg-secondary/15 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Site photo + GPS</Label>
              <p className="text-xs text-muted-foreground">
                Attach photo now; GPS locks with it. Upload runs only when you create the sale.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={openCameraWithGps}
              >
                {busy ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <Camera className="size-3.5" />
                    {photoFile ? 'Retake photo + GPS' : 'Take photo + GPS'}
                  </>
                )}
              </Button>
              {gps?.locked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => void recaptureGpsOnly()}
                >
                  <RefreshCw className="size-3.5" />
                  GPS only
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void attachPhotoAndGps(file)
              }}
            />
          </div>

          {r2Ready === false && (
            <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Cloudflare R2 is not configured yet. You can still attach a photo for now; submit will
              fail until R2 env vars are set.
            </p>
          )}

          {!expectedState?.trim() && (
            <p className="mb-3 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              Select customer state (and LGA) first so GPS can be checked against the approved
              deployment area.
            </p>
          )}

          {status && <p className="mb-3 text-xs text-muted-foreground">{status}</p>}

          {previewUrl ? (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Site capture preview"
                className="max-h-56 w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <p className="truncate text-[11px] text-muted-foreground">
                  Attached: {photoFile?.name || 'site photo'} (not uploaded yet)
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-muted-foreground hover:text-destructive"
                  onClick={clearPhoto}
                >
                  <X className="size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Stand at the installation site, then take the photo — GPS locks automatically.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border/70 bg-secondary/15 p-4">
          <p className="mb-3 text-sm font-medium">GPS (locked with photo)</p>
          {gps?.locked ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-background/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Latitude
                  </p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums">
                    {formatGpsCoord(gps.latitude)}
                  </p>
                </div>
                <div className="rounded-lg bg-background/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Longitude
                  </p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums">
                    {formatGpsCoord(gps.longitude)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary">
                  <Lock className="size-3" />
                  Locked
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  Captured {new Date(gps.captured_at).toLocaleString()}
                </span>
              </div>
              {!gps.out_of_area && gps.deployment_area_name && (
                <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
                  Inside approved area: {gps.deployment_area_name}
                  {gps.subsidy_level
                    ? ` · ${SUBSIDY_LABELS[(gps.subsidy_level as SubsidyLevel) || 'none'] || gps.subsidy_level}`
                    : ''}
                  {expectedState ? ` · Sale state ${expectedState}` : ''}
                  {expectedLga ? ` / ${expectedLga}` : ''}
                </p>
              )}
              {gps.out_of_area && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    Out-of-area flag:{' '}
                    {gps.out_of_area_reason ||
                      'Coordinates are outside the approved deployment area for the selected subsidy zone.'}{' '}
                    Retake on-site or confirm with a supervisor before saving.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              GPS appears here after you take the site photo.
            </p>
          )}
        </div>

        {(localError || error) && (
          <p
            className={cn(
              'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            )}
          >
            {localError || error}
          </p>
        )}
      </div>
    </Panel>
  )
}
