import { customers, Customer } from '@/data/mockData'

export async function getCustomers(filters?: {
  search?: string
  state?: string
  business_type?: string
}): Promise<Customer[]> {
  let result = [...customers]

  if (filters?.search) {
    const search = filters.search.toLowerCase()
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.phone.includes(search)
    )
  }

  if (filters?.state) {
    result = result.filter((c) => c.state === filters.state)
  }

  if (filters?.business_type) {
    result = result.filter((c) => c.business_type === filters.business_type)
  }

  return result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  return customers.find((c) => c.id === id) || null
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const q = query.toLowerCase()
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q)
  )
}

export async function getTopCustomers(limit: number = 10): Promise<Customer[]> {
  return [...customers].sort((a, b) => b.total_purchases - a.total_purchases).slice(0, limit)
}

export async function getCustomerStats() {
  return {
    total_customers: customers.length,
    total_credit_extended: customers.reduce((sum, c) => sum + c.credit_limit, 0),
    total_outstanding: customers.reduce((sum, c) => sum + c.outstanding_balance, 0),
    avg_purchase_value: customers.reduce((sum, c) => sum + c.total_purchases, 0) / customers.length,
  }
}
