import { listWarranties } from '@/lib/services/warranties'
import { WarrantyPageClient } from './warranty-page-client'

export default async function WarrantyPage() {
  const warranties = await listWarranties()
  return <WarrantyPageClient warranties={warranties} />
}
