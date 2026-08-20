import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customerDocuments } from '@/lib/db/schema'
import type { CustomerDocument, DocumentUploadInput } from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

function mapDoc(row: typeof customerDocuments.$inferSelect): CustomerDocument {
  return {
    id: row.id,
    customer_id: row.customerId,
    sale_id: row.saleId ?? undefined,
    doc_type: row.docType as CustomerDocument['doc_type'],
    file_name: row.fileName,
    content_type: row.contentType,
    file_url: row.fileUrl,
    storage_key: row.storageKey,
    page_number: row.pageNumber,
    uploaded_by_user_id: row.uploadedByUserId ?? undefined,
    created_at: row.createdAt,
  }
}

export async function listCustomerDocuments(customerId: string): Promise<CustomerDocument[]> {
  const rows = await db
    .select()
    .from(customerDocuments)
    .where(eq(customerDocuments.customerId, customerId))
    .orderBy(desc(customerDocuments.createdAt))
  return rows.map(mapDoc)
}

export async function listSaleDocuments(saleId: string): Promise<CustomerDocument[]> {
  const rows = await db
    .select()
    .from(customerDocuments)
    .where(eq(customerDocuments.saleId, saleId))
    .orderBy(customerDocuments.pageNumber)
  return rows.map(mapDoc)
}

export async function createCustomerDocuments(input: {
  customer_id: string
  sale_id?: string
  documents: DocumentUploadInput[]
  uploaded_by_user_id?: string
}): Promise<CustomerDocument[]> {
  if (!input.documents.length) return []

  const existing = await db.select({ id: customerDocuments.id }).from(customerDocuments)
  const ids = existing.map((r) => r.id)
  const created: CustomerDocument[] = []

  for (let i = 0; i < input.documents.length; i++) {
    const doc = input.documents[i]
    const id = nextId('DOC', [...ids, ...created.map((c) => c.id)], 6)
    const [row] = await db
      .insert(customerDocuments)
      .values({
        id,
        customerId: input.customer_id,
        saleId: input.sale_id || null,
        docType: doc.doc_type,
        fileName: doc.file_name.trim(),
        contentType: doc.content_type,
        fileUrl: doc.file_url,
        storageKey: doc.storage_key || '',
        pageNumber: doc.page_number ?? i + 1,
        uploadedByUserId: input.uploaded_by_user_id || null,
      })
      .returning()
    created.push(mapDoc(row))
  }

  return created
}
