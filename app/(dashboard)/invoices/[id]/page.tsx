import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { getInvoiceDetail } from '@/lib/services/sales'
import { InvoiceDetailClient } from './invoice-detail-client'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getInvoiceDetail(decodeURIComponent(id))
  if (!detail) notFound()

  return (
    <PageShell>
      <PageHeader
        title={detail.invoice.invoice_number}
        description={`Sale ${detail.sale.id} · ${detail.customer.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/invoices">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="size-4" />
                Invoices
              </Button>
            </Link>
          </div>
        }
      />
      <InvoiceDetailClient detail={detail} />
    </PageShell>
  )
}
