export const KYC_UPLOAD_REQUIRED_MESSAGE = 'Upload a KYC or sales form before saving'

export function isKycOrSalesFormType(type?: string | null) {
  return type === 'kyc' || type === 'sales_form'
}

export function hasKycOrSalesFormDoc(
  docs: Array<{ doc_type?: string | null; docType?: string | null }> | null | undefined
) {
  return (docs || []).some((doc) => isKycOrSalesFormType(doc.doc_type || doc.docType))
}
