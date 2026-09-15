'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, ScanBarcode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector || null
}

export function SerialBarcodeField({
  id,
  label = 'Serial number',
  value,
  onChange,
  placeholder = 'Device serial…',
  className,
}: {
  id: string
  label?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)

  const stopScanner = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }, [])

  useEffect(() => () => stopScanner(), [stopScanner])

  async function startScanner() {
    setError('')
    const Detector = getBarcodeDetector()
    if (!Detector) {
      setSupported(false)
      setError(
        'Barcode camera scan is not supported in this browser. Type the serial, or use a USB/Bluetooth scanner into the field.'
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      setScanning(true)

      // Wait for video element to mount
      requestAnimationFrame(async () => {
        const video = videoRef.current
        if (!video) {
          stopScanner()
          setError('Could not open camera preview')
          return
        }
        video.srcObject = stream
        await video.play()

        const detector = new Detector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'codabar'],
        })

        const tick = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick)
            return
          }
          try {
            const codes = await detector.detect(videoRef.current)
            const raw = codes.find((c) => c.rawValue?.trim())?.rawValue?.trim()
            if (raw) {
              onChange(raw)
              stopScanner()
              return
            }
          } catch {
            // keep scanning through transient detect errors
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })
    } catch {
      stopScanner()
      setError('Camera permission denied or unavailable. Allow camera access to scan.')
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {!scanning ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => void startScanner()}
          >
            <ScanBarcode className="size-3.5" />
            Scan barcode
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={stopScanner}
          >
            <CameraOff className="size-3.5" />
            Stop
          </Button>
        )}
      </div>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {scanning && (
        <div className="relative overflow-hidden rounded-lg border border-border bg-black">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-[78%] rounded-md border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 px-3 py-2 text-xs text-white">
            <span className="inline-flex items-center gap-1.5">
              <Camera className="size-3.5" />
              Point at the device barcode
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1"
              onClick={stopScanner}
            >
              <X className="size-3.5" />
              Close
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive">
          {error}
          {!supported ? '' : ''}
        </p>
      )}
    </div>
  )
}
