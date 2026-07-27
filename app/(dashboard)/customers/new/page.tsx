'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { Button } from '@/components/ui/button'

export default function NewCustomerPage() {
  return (
    <PageShell>
      <PageHeader
        title="Add customer"
        description="Create a new account in your customer directory"
        actions={
          <Link href="/customers">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
        }
      />
      <CustomerForm mode="create" />
    </PageShell>
  )
}
