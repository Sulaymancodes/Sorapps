import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { Button } from '@/components/ui/button'
import { getCustomer } from '@/lib/services/customers'

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const customer = await getCustomer(id)

  if (!customer) notFound()

  return (
    <PageShell>
      <PageHeader
        title="Edit customer"
        description={`Updating ${customer.name}`}
        actions={
          <Link href="/customers">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <CustomerForm mode="edit" customer={customer} />
    </PageShell>
  )
}
