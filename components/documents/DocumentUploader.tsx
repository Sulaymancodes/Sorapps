'use client'

import { useRef, useState } from 'react'
import { Camera, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { createDocumentUploadUrlAction } from '@/app/actions/uploads'
import type { DocumentDocType, DocumentUploadInput } from '@/lib/types/crm'
import { cn } from '@/lib/utils'

const ACCEPT_FILES = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.pdf'
const ACCEPT_CAMERA = 'image/*'

export function DocumentUploader({
  value,
  onChange,
  defaultDocType = 'kyc',
  label = 'KYC / sales documents',
  description = 'Take a photo or upload JPG, PNG, or PDF — multiple pages for audit',
}: {
  value: DocumentUploadInput[]
  onChange: (next: DocumentUploadInput[]) => void
  defaultDocType?: DocumentDocType
  label?: string
  description?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocumentDocType>(defaultDocType)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    setUploading(true)

    const uploaded: DocumentUploadInput[] = []
    try {
      let page = value.length
      for (const file of Array.from(files)) {
        let type =
          file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
        // Some mobile cameras omit type or use image/jpg
        if (!type || type === 'image/jpg') type = 'image/jpeg'
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type)) {
          throw new Error(`${file.name || 'File'}: use JPG, PNG, or PDF`)
        }
        if (file.size > 12 * 1024 * 1024) {
          throw new Error(`${file.name || 'File'}: max 12 MB per file`)
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName =
          file.name?.trim() ||
          `kyc-photo-${stamp}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`

        const prepared = await createDocumentUploadUrlAction({
          contentType: type,
          fileName,
        })
        if (!prepared.success) throw new Error(prepared.error)

        const put = await fetch(prepared.data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': type },
          body: file,
        })
        if (!put.ok) throw new Error(`Upload failed for ${fileName}`)

        page += 1
        uploaded.push({
          file_url: prepared.data.publicUrl,
          file_name: fileName,
          content_type: type,
          storage_key: prepared.data.key,
          doc_type: docType,
          page_number: page,
        })
      }
      onChange([...value, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
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
          <Label>{label}</Label>
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
            onChange={(e) => void onFilesSelected(e.target.files)}
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

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {value.length > 0 ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
          {value.map((doc, index) => (
            <li
              key={`${doc.file_url}-${index}`}
              className="flex items-center gap-3 bg-background/60 px-3 py-2.5"
            >
              {doc.content_type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.file_url}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {doc.file_name}
                </a>
                <p className="text-[11px] text-muted-foreground">
                  Page {doc.page_number ?? index + 1} · {doc.doc_type.replace('_', ' ')} ·{' '}
                  {doc.content_type.includes('pdf') ? 'PDF' : 'Image'}
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
          ))}
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
