'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Lock, MapPin, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/common/Panel'
import { getR2StatusAction } from '@/app/actions/uploads'
import { formatGpsCoord, isWithinNigeria } from '@/lib/utils/gps'
import { cn } from '@/lib/utils'
import type { SaleSiteGpsInput } from '@/lib/types/crm'

type SiteVerificationProps = {
  gps: SaleSiteGpsInput | null
  photoFile: File | null
  onGpsChange: (gps: SaleSiteGpsInput | null) => void
  onPhotoChange: (file: File | null) => void
  error?: string | null
}

function readLiveGps(): Promise<SaleSiteGpsInput> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device/browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        resolve({
          latitude,
          longitude,
          captured_at: new Date().toISOString(),
          locked: true,
          out_of_area: !isWithinNigeria(latitude, longitude),
        })
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
    void getR2StatusAction().then((result) => {
      if (result.success) setR2Ready(result.data.configured)
      else setR2Ready(false)
    })
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

  const openCameraWithGps = () => {
    setLocalError(null)
    // Start GPS while the camera / picker opens
    pendingGpsRef.current = readLiveGps()
    fileRef.current?.click()
  }

  const attachPhotoAndGps = async (file: File) => {
    setLocalError(null)
    setBusy(true)
    setStatus('Capturing GPS…')

    const gpsPromise = pendingGpsRef.current ?? readLiveGps()
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
      // Keep file on the form only — Cloudflare upload happens on submit
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
      const next = await readLiveGps()
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
      description="Photo stays on this form until you submit — then it uploads to Cloudflare R2"
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
              {gps.out_of_area && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    Out-of-area flag: coordinates are outside the Nigeria deployment bounds.
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
