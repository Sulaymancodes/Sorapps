'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { createDocumentUploadUrlAction } from '@/app/actions/uploads'
import { isBrowserOnline, isLikelyNetworkError } from '@/lib/offline/network'
import { savePhotoOnThisPhone } from '@/lib/offline/save-phone-photo'
import type { PendingDocument } from '@/lib/offline/sale-drafts'
import type { DocumentDocType } from '@/lib/types/crm'
import { cn } from '@/lib/utils'

const ACCEPT_FILES = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.pdf'
const ACCEPT_CAMERA = 'image/*'

function DocThumb({ doc }: { doc: PendingDocument }) {
  const [src, setSrc] = useState(doc.file_url || '')

  useEffect(() => {
    if (doc.file_url) {
      setSrc(doc.file_url)
      return
    }
    if (!doc.file || !doc.content_type.startsWith('image/')) {
      setSrc('')
      return
    }
    const url = URL.createObjectURL(doc.file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [doc.content_type, doc.file, doc.file_url])

  if (src && doc.content_type.startsWith('image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="size-10 shrink-0 rounded-md object-cover" />
    )
  }
  return <FileText className="size-4 shrink-0 text-muted-foreground" />
}

export function DocumentUploader({
  value,
  onChange,
  defaultDocType = 'kyc',
  label = 'KYC / sales documents',
  description = 'Take a photo or upload JPG, PNG, or PDF — multiple pages for audit',
  required = false,
  error = null,
}: {
  value: PendingDocument[]
  onChange: (next: PendingDocument[]) => void
  defaultDocType?: DocumentDocType
  label?: string
  description?: string
  required?: boolean
  error?: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocumentDocType>(defaultDocType)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function localDocFromFile(file: File, page: number): PendingDocument {
    let type =
      file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    if (!type || type === 'image/jpg') type = 'image/jpeg'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName =
      file.name?.trim() ||
      `kyc-photo-${stamp}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`
    return {
      file,
      file_name: fileName,
      content_type: type,
      doc_type: docType,
      page_number: page,
    }
  }

  async function onFilesSelected(files: FileList | null, fromCamera = false) {
    if (!files?.length) return
    setUploadError(null)
    setUploading(true)

    const added: PendingDocument[] = []
    try {
      let page = value.length
      const online = isBrowserOnline()

      for (const file of Array.from(files)) {
        page += 1
        const local = localDocFromFile(file, page)
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(local.content_type)) {
          throw new Error(`${file.name || 'File'}: use JPG, PNG, or PDF`)
        }
        if (file.size > 12 * 1024 * 1024) {
          throw new Error(`${file.name || 'File'}: max 12 MB per file`)
        }
        if (fromCamera && local.content_type.startsWith('image/')) {
          void savePhotoOnThisPhone(file)
        }

        if (!online) {
          added.push(local)
          continue
        }

        try {
          const prepared = await createDocumentUploadUrlAction({
            contentType: local.content_type,
            fileName: local.file_name,
          })
          if (!prepared.success) throw new Error(prepared.error)

          const put = await fetch(prepared.data.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': local.content_type },
            body: file,
          })
          if (!put.ok) throw new Error(`Upload failed for ${local.file_name}`)

          added.push({
            file_url: prepared.data.publicUrl,
            file_name: local.file_name,
            content_type: local.content_type,
            storage_key: prepared.data.key,
            doc_type: docType,
            page_number: page,
          })
        } catch (err) {
          if (isLikelyNetworkError(err)) {
            added.push(local)
          } else {
            throw err
          }
        }
      }
      onChange([...value, ...added])
      if (!online || added.some((doc) => doc.file && !doc.file_url)) {
        setUploadError(null)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index).map((d, i) => ({ ...d, page_number: i + 1 })))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>
            {label}
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
              {required ? '(required)' : '(optional)'}
            </span>
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-9 w-[140px]"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentDocType)}
            disabled={uploading}
          >
            <option value="kyc">KYC form</option>
            <option value="sales_form">Sales form</option>
            <option value="other">Other</option>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Add files
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept={ACCEPT_CAMERA}
            capture="environment"
            className="hidden"
            onChange={(e) => void onFilesSelected(e.target.files, true)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_FILES}
            multiple
            className="hidden"
            onChange={(e) => void onFilesSelected(e.target.files)}
          />
        </div>
      </div>

      {(error || uploadError) && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error || uploadError}
        </p>
      )}

      {value.length > 0 ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
          {value.map((doc, index) => {
            const href = doc.file_url
            return (
              <li
                key={`${doc.file_name}-${index}`}
                className="flex items-center gap-3 bg-background/60 px-3 py-2.5"
              >
                <DocThumb doc={doc} />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {doc.file_name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-medium">{doc.file_name}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Page {doc.page_number ?? index + 1} · {doc.doc_type.replace('_', ' ')} ·{' '}
                    {doc.content_type.includes('pdf') ? 'PDF' : 'Image'}
                    {doc.file && !doc.file_url ? ' · saved on this device' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive'
                  )}
                  onClick={() => removeAt(index)}
                  aria-label="Remove document"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/80 bg-secondary/20 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <Camera className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">Take photo</p>
            <p className="text-xs text-muted-foreground">Use device camera</p>
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/80 bg-secondary/20 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <Upload className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">Upload files</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, or PDF</p>
          </button>
        </div>
      )}
    </div>
  )
}
