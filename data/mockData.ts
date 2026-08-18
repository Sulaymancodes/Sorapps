import { sub } from 'date-fns'

export type {
  Customer,
  Product,
  PaymentType,
  SaleStatus,
  Sale,
  SaleItem,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentSchedule,
  Installment,
  PaymentReminder,
  InventoryMovement,
  Warranty,
  WarrantyClaim,
} from '@/lib/types/crm'

import type {
  Customer,
  Product,
  Sale,
  Invoice,
  Payment,
  PaymentSchedule,
  PaymentReminder,
  InventoryMovement,
  Warranty,
  WarrantyClaim,
  PaymentType,
  SaleItem,
  SaleStatus,
  Installment,
} from '@/lib/types/crm'

// Generate Mock Data
const NIGERIAN_STATES = [
  'Lagos',
  'Kano',
  'Rivers',
  'Katsina',
  'Jigawa',
  'Anambra',
  'Enugu',
  'Delta',
  'Oyo',
  'Edo',
  'Imo',
  'Osun',
  'Ogun',
]

const BUSINESS_TYPES = [
  'Retail Store',
  'Shopping Mall',
  'Restaurant',
  'Hotel',
  'Hospital',
  'School',
  'Factory',
  'Farm',
  'Office',
  'Household',
]

const PRODUCT_CATEGORIES = [
  'Solar Panels',
  'Inverters',
  'Batteries',
  'Charge Controllers',
  'Mounting Systems',
  'Cables & Connectors',
  'Safety Equipment',
  'Monitoring Systems',
  'Accessories',
  'Installation Services',
]

const PRODUCT_BRANDS = ['SunPower', 'Canadian Solar', 'JinkoSolar', 'Longi', 'First Solar', 'Victron', 'Growatt', 'MPPT']

const INSTALLMENT_WEEK_OPTIONS = [4, 6, 8, 12] as const

/** Deterministic PRNG so SSR and client render the same mock data */
function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const random = createSeededRandom(20260727)

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)]
}

function getRandomNumber(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

/** Fixed "now" for mock relative dates — avoids SSR/client drift */
const MOCK_NOW = new Date('2026-07-27T12:00:00.000Z')


// Generate customers
export const customers: Customer[] = Array.from({ length: 120 }, (_, i) => {
  const firstNames = ['Chioma', 'Kasim', 'Zainab', 'Tunde', 'Aisha', 'Bola', 'Amara', 'Ibrahim', 'Ngozi', 'Ahmed']
  const lastNames = ['Okonkwo', 'Adebayo', 'Hassan', 'Okafor', 'Muhammad', 'Ibrahim', 'Eze', 'Nwabueze', 'Adeyemi', 'Ojabo']
  const firstName = firstNames[i % firstNames.length]
  const lastName = lastNames[i % lastNames.length]
  const name = `${firstName} ${lastName}`

  return {
    id: `CUST${String(i + 1).padStart(4, '0')}`,
    name,
    email: `${name.toLowerCase().replace(/\s/g, '.')}@solarbiz.com`,
    phone: `+234${getRandomNumber(801, 809)}${getRandomNumber(1000000, 9999999)}`,
    nin: `${getRandomNumber(10000000000, 99999999999)}`,
    bvn: `${getRandomNumber(10000000000, 99999999999)}`,
    address: `${getRandomNumber(1, 1000)} Solar Street`,
    city: getRandomItem(['Lagos', 'Ibadan', 'Kano', 'Abuja', 'Enugu']),
    state: getRandomItem(NIGERIAN_STATES),
    lga: '',
    business_type: getRandomItem(BUSINESS_TYPES),
    credit_limit: getRandomNumber(500000, 5000000),
    total_purchases: getRandomNumber(500000, 10000000),
    outstanding_balance: getRandomNumber(0, 2000000),
    created_at: sub(MOCK_NOW, { days: getRandomNumber(1, 365) }),
  }
})

// Generate products
export const products: Product[] = Array.from({ length: 85 }, (_, i) => {
  const category = getRandomItem(PRODUCT_CATEGORIES)
  const brand = getRandomItem(PRODUCT_BRANDS)

  let name = ''
  let price = 0

  if (category === 'Solar Panels') {
    const wattage = [100, 200, 300, 400, 500][i % 5]
    name = `${brand} ${wattage}W Solar Panel`
    price = wattage * 500
  } else if (category === 'Inverters') {
    const capacity = [1, 2, 3, 5, 10][i % 5]
    name = `${brand} ${capacity}kW Inverter`
    price = capacity * 150000
  } else if (category === 'Batteries') {
    const capacity = [5, 10, 20, 50][i % 4]
    name = `${brand} ${capacity}kWh Battery`
    price = capacity * 200000
  } else if (category === 'Charge Controllers') {
    const amp = [30, 60, 100][i % 3]
    name = `${brand} ${amp}A MPPT Controller`
    price = amp * 15000
  } else {
    name = `${brand} ${category} - Model ${i + 1}`
    price = getRandomNumber(50000, 500000)
  }

  return {
    id: `PROD${String(i + 1).padStart(5, '0')}`,
    sku: `SKU-${String(i + 1).padStart(6, '0')}`,
    name,
    category,
    brand,
    description: `Professional grade ${category.toLowerCase()} for solar installations`,
    price,
    cost: price * 0.6,
    stock: getRandomNumber(0, 100),
    unit: 'pcs',
  }
})

// Generate sales — each sale is either full payment or weekly installment
export const sales: Sale[] = Array.from({ length: 200 }, (_, i) => {
  const customer = getRandomItem(customers)
  const numItems = getRandomNumber(1, 5)
  const items: SaleItem[] = Array.from({ length: numItems }, () => {
    const product = getRandomItem(products)
    const quantity = getRandomNumber(1, 20)
    return {
      product_id: product.id,
      quantity,
      unit_price: product.price,
      total: product.price * quantity,
    }
  })

  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const discount = getRandomNumber(0, 10)
  const discountAmount = (subtotal * discount) / 100
  const vat = ((subtotal - discountAmount) * 7.5) / 100
  const transport = getRandomNumber(10000, 100000)
  const totalAmount = Math.round(subtotal - discountAmount + vat + transport)
  const cost = items.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.product_id)
    return sum + (prod?.cost || 0) * item.quantity
  }, 0)
  const profit = totalAmount - cost * 0.6 - transport

  const payment_type: PaymentType = i % 5 === 0 || i % 5 === 1 ? 'full' : 'installment'
  const installment_weeks =
    payment_type === 'installment' ? getRandomItem([...INSTALLMENT_WEEK_OPTIONS]) : undefined

  // Derive status + amount_paid after schedules; placeholder for now
  return {
    id: `SALE${String(i + 1).padStart(6, '0')}`,
    customer_id: customer.id,
    date: sub(MOCK_NOW, { days: getRandomNumber(0, 120) }),
    status: 'pending_payment' as SaleStatus,
    payment_type,
    installment_weeks,
    total_amount: totalAmount,
    amount_paid: 0,
    discount_percent: discount,
    vat_amount: vat,
    transport_cost: transport,
    items,
    profit,
    notes: `${payment_type === 'full' ? 'Full payment' : `${installment_weeks}-week installment`} — ${customer.business_type}`,
  }
})

// Generate invoices linked 1:1 with sales
export const invoices: Invoice[] = sales.map((sale, i) => ({
  id: `INV${String(i + 1).padStart(6, '0')}`,
  invoice_number: `INV-2024-${String(i + 1).padStart(5, '0')}`,
  sale_id: sale.id,
  customer_id: sale.customer_id,
  issue_date: sale.date,
  due_date:
    sale.payment_type === 'full'
      ? new Date(sale.date.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(sale.date.getTime() + (sale.installment_weeks || 4) * 7 * 24 * 60 * 60 * 1000),
  status: 'sent' as Invoice['status'],
  total_amount: sale.total_amount,
  paid_amount: 0,
  items: sale.items.map((item) => {
    const product = products.find((p) => p.id === item.product_id)!
    return {
      product_id: item.product_id,
      description: product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    }
  }),
}))

// Build installment schedules + unique payments
const _payments: Payment[] = []
const _schedules: PaymentSchedule[] = []
let paymentCounter = 0

sales.forEach((sale, saleIndex) => {
  const invoice = invoices[saleIndex]
  const weeks = sale.payment_type === 'full' ? 1 : sale.installment_weeks || 4
  const baseAmount = Math.floor(sale.total_amount / weeks)
  const remainder = sale.total_amount - baseAmount * weeks

  // How many weekly installments have been paid so far
  const paidWeeks =
    sale.payment_type === 'full'
      ? getRandomItem([0, 1, 1, 1]) // mostly paid in full
      : getRandomNumber(0, weeks)

  const installments: Installment[] = Array.from({ length: weeks }, (_, weekIdx) => {
    const week_number = weekIdx + 1
    const amount = weekIdx === weeks - 1 ? baseAmount + remainder : baseAmount
    const due_date = new Date(sale.date.getTime() + weekIdx * 7 * 24 * 60 * 60 * 1000)
    const isPaid = weekIdx < paidWeeks
    const isOverdue = !isPaid && due_date.getTime() < MOCK_NOW.getTime()

    const installment: Installment = {
      id: `INST${String(saleIndex + 1).padStart(5, '0')}-W${String(week_number).padStart(2, '0')}`,
      week_number,
      amount,
      due_date,
      paid_date: isPaid ? new Date(due_date.getTime() + getRandomNumber(0, 2) * 24 * 60 * 60 * 1000) : undefined,
      status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending',
      reminder: !isPaid && Math.abs(due_date.getTime() - MOCK_NOW.getTime()) < 14 * 24 * 60 * 60 * 1000,
    }

    if (isPaid) {
      paymentCounter += 1
      _payments.push({
        id: `PAY${String(paymentCounter).padStart(8, '0')}`,
        invoice_id: invoice.id,
        sale_id: sale.id,
        customer_id: sale.customer_id,
        installment_id: installment.id,
        amount,
        date: installment.paid_date!,
        method: getRandomItem(['bank_transfer', 'cash', 'cheque', 'card']),
        reference: `REF${getRandomNumber(100000, 999999)}`,
        bank: 'GTBank',
        status: 'success',
        receipt: `REC${getRandomNumber(100000, 999999)}`,
        payment_type: sale.payment_type,
        week_number,
      })
    }

    return installment
  })

  const paid_amount = installments
    .filter((inst) => inst.status === 'paid')
    .reduce((sum, inst) => sum + inst.amount, 0)

  const nextPending = installments.find((inst) => inst.status !== 'paid')

  sale.amount_paid = paid_amount
  if (paid_amount <= 0) sale.status = 'pending_payment'
  else if (paid_amount >= sale.total_amount) sale.status = getRandomItem(['paid', 'completed'])
  else sale.status = 'partial'

  invoice.paid_amount = paid_amount
  if (paid_amount <= 0) invoice.status = nextPending?.status === 'overdue' ? 'overdue' : 'sent'
  else if (paid_amount >= sale.total_amount) invoice.status = 'paid'
  else invoice.status = nextPending?.status === 'overdue' ? 'overdue' : 'partial'

  _schedules.push({
    id: `SCH${String(saleIndex + 1).padStart(6, '0')}`,
    sale_id: sale.id,
    invoice_id: invoice.id,
    customer_id: sale.customer_id,
    payment_type: sale.payment_type,
    installment_weeks: sale.installment_weeks,
    total_amount: sale.total_amount,
    paid_amount,
    installments,
    next_due_date: nextPending?.due_date,
  })
})

export const payments: Payment[] = _payments
export const paymentSchedules: PaymentSchedule[] = _schedules

export const paymentReminders: PaymentReminder[] = paymentSchedules.flatMap((schedule) =>
  schedule.installments
    .filter((inst) => inst.status !== 'paid' && inst.reminder)
    .map((inst) => {
      const daysUntil = Math.ceil((inst.due_date.getTime() - MOCK_NOW.getTime()) / (1000 * 60 * 60 * 24))
      const status: PaymentReminder['status'] =
        daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due_today' : 'due_soon'
      const customerName = customers.find((c) => c.id === schedule.customer_id)?.name || 'Customer'
      return {
        id: `REM-${inst.id}`,
        sale_id: schedule.sale_id,
        customer_id: schedule.customer_id,
        installment_id: inst.id,
        week_number: inst.week_number,
        amount: inst.amount,
        due_date: inst.due_date,
        status,
        message:
          status === 'overdue'
            ? `Overdue installment (Week ${inst.week_number}) for ${customerName}`
            : status === 'due_today'
              ? `Installment due today (Week ${inst.week_number}) for ${customerName}`
              : `Upcoming installment (Week ${inst.week_number}) for ${customerName} in ${daysUntil} days`,
      }
    })
)

// Generate warranties for completed / paid sales
export const warranties: Warranty[] = sales
  .filter((s) => s.status === 'completed' || s.status === 'paid')
  .slice(0, 50)
  .map((sale, i) => {
    const product = getRandomItem(sale.items)

    return {
      id: `WAR${String(i + 1).padStart(6, '0')}`,
      sale_id: sale.id,
      product_id: product.product_id,
      customer_id: sale.customer_id,
      serial_number: `SN${getRandomNumber(100000, 999999)}`,
      warranty_period_months: getRandomItem([12, 24, 36, 60]),
      start_date: sale.date,
      expiry_date: new Date(sale.date.getTime() + 365 * 24 * 60 * 60 * 1000 * 2),
      status: 'active',
    }
  })

// Generate inventory movements
export const inventoryMovements: InventoryMovement[] = Array.from({ length: 150 }, (_, i) => {
  const product = getRandomItem(products)
  return {
    id: `INV_MOV${String(i + 1).padStart(6, '0')}`,
    product_id: product.id,
    type: getRandomItem(['in', 'out', 'adjustment']),
    quantity: getRandomNumber(1, 50),
    reference: `REF${getRandomNumber(100000, 999999)}`,
    date: sub(MOCK_NOW, { days: getRandomNumber(0, 90) }),
    notes: 'Inventory movement',
  }
})
