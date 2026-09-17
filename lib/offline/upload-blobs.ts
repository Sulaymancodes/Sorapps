import {
  createDocumentUploadUrlAction,
  createSitePhotoUploadUrlAction,
} from '@/app/actions/uploads'
import type { DocumentUploadInput } from '@/lib/types/crm'
import type { PendingDocument } from '@/lib/offline/sale-drafts'

async function putFile(uploadUrl: string, file: Blob, contentType: string) {
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!put.ok) {
    throw new Error('Upload failed — check your connection and try again')
  }
}

export async function uploadSitePhotoFile(file: File) {
  const contentType = file.type || 'image/jpeg'
  const prepared = await createSitePhotoUploadUrlAction({
    contentType,
    fileName: file.name || 'site.jpg',
  })
  if (!prepared.success) throw new Error(prepared.error)
  await putFile(prepared.data.uploadUrl, file, contentType)
  return prepared.data.publicUrl
}

export async function uploadPendingDocuments(
  documents: PendingDocument[]
): Promise<DocumentUploadInput[]> {
  const uploaded: DocumentUploadInput[] = []
  for (const [index, doc] of documents.entries()) {
    if (doc.file_url) {
      uploaded.push({
        file_url: doc.file_url,
        file_name: doc.file_name,
        content_type: doc.content_type,
        storage_key: doc.storage_key,
        doc_type: doc.doc_type,
        page_number: doc.page_number ?? index + 1,
      })
      continue
    }
    if (!doc.file) continue
    const prepared = await createDocumentUploadUrlAction({
      contentType: doc.content_type,
      fileName: doc.file_name,
    })
    if (!prepared.success) throw new Error(prepared.error)
    await putFile(prepared.data.uploadUrl, doc.file, doc.content_type)
    uploaded.push({
      file_url: prepared.data.publicUrl,
      file_name: doc.file_name,
      content_type: doc.content_type,
      storage_key: prepared.data.key,
      doc_type: doc.doc_type,
      page_number: doc.page_number ?? index + 1,
    })
  }
  return uploaded
}
