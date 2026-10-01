import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  activationCodes,
  customers,
  deviceUnlocks,
  installments,
  inventoryMovements,
  invoiceItems,
  invoices,
  paymentSchedules,
  products,
  saleItems,
  sales,
  payments,
  warrantyClaims,
  warranties,
} from '@/lib/db/schema'
import { createCustomer, getCustomer, updateCustomer } from '@/lib/services/customers'
import type {
  Customer,
  Installment,
  Invoice,
  InvoiceDetail,
  PaymentReminder,
  PaymentSchedule,
  PaymentType,
  Sale,
  SaleInput,
  SaleItem,
  SaleStatus,
} from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'
import { serialLookupKey, parseDeviceSerials, soldSerialMessage } from '@/lib/utils/serial'
import { evaluateDeploymentArea, sameGpsPoint } from '@/lib/utils/gps'
import {
  buildInstallmentsByInterval,
  isValidIntervalDays,
  parseDateInput,
  startOfLocalDay,
  todayInLagos,
  toDateInputValue,
} from '@/lib/paygo/schedule'

/** Single paid-in-full installment for cash / full payment sales (not PAYGO). */
function buildFullPaymentInstallment(
  total: number,
  startDate: Date,
  saleIndexLabel: string
): Installment[] {
  const due = startOfLocalDay(startDate)
  const label = saleIndexLabel || '00000'
  return [
    {
      id: `INST${label}-W01`,
      week_number: 1,
      amount: Math.round(total),
      due_date: due,
      status: 'pending',
      reminder: false,
    },
  ]
}

function mapSale(
  row: typeof sales.$inferSelect,
  items: SaleItem[]
): Sale {
  return {
    id: row.id,
    customer_id: row.customerId,
    date: row.date,
    status: row.status as SaleStatus,
    payment_type: row.paymentType as PaymentType,
    payment_method: (row.paymentMethod || 'cash') as Sale['payment_method'],
    installment_weeks: row.installmentWeeks ?? undefined,
    installment_interval_days: row.installmentIntervalDays ?? undefined,
    plan_end_date: row.planEndDate ?? undefined,
    total_amount: row.totalAmount,
    amount_paid: row.amountPaid,
    discount_percent: row.discountPercent,
    vat_amount: row.vatAmount,
    transport_cost: row.transportCost,
    items,
    profit: row.profit,
    notes: row.notes,
    dares_type_of_payment: row.daresTypeOfPayment || '',
    dares_payment_plan: row.daresPaymentPlan || '',
    retail_cost_ngn: row.retailCostNgn || 0,
    cost_to_end_user_ngn: row.costToEndUserNgn || 0,
    downpayment_amount_ngn: row.downpaymentAmountNgn || 0,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    gps_captured_at: row.gpsCapturedAt ?? null,
    gps_locked: row.gpsLocked,
    gps_out_of_area: row.gpsOutOfArea,
    site_photo_url: row.sitePhotoUrl || '',
    unlock_pin: row.unlockPin || '',
    created_by_user_id: row.createdByUserId ?? undefined,
  }
}

function mapInvoice(
  row: typeof invoices.$inferSelect,
  items: Invoice['items']
): Invoice {
  return {
    id: row.id,
    invoice_number: row.invoiceNumber,
    sale_id: row.saleId,
    customer_id: row.customerId,
    issue_date: row.issueDate,
    due_date: row.dueDate,
    status: row.status as Invoice['status'],
    total_amount: row.totalAmount,
    paid_amount: row.paidAmount,
    items,
  }
}

function mapSchedule(
  row: typeof paymentSchedules.$inferSelect,
  instRows: (typeof installments.$inferSelect)[]
): PaymentSchedule {
  return {
    id: row.id,
    sale_id: row.saleId,
    invoice_id: row.invoiceId,
    customer_id: row.customerId,
    payment_type: row.paymentType as PaymentType,
    installment_weeks: row.installmentWeeks ?? undefined,
    installment_interval_days: row.installmentIntervalDays ?? undefined,
    plan_end_date: row.planEndDate ?? undefined,
    total_amount: row.totalAmount,
    paid_amount: row.paidAmount,
    next_due_date: row.nextDueDate ?? undefined,
    installments: instRows.map((inst) => ({
      id: inst.id,
      week_number: inst.weekNumber,
      amount: inst.amount,
      paid_amount: inst.paidAmount,
      due_date: inst.dueDate,
      paid_date: inst.paidDate ?? undefined,
      status: inst.status as Installment['status'],
      reminder: inst.reminder,
    })),
  }
}

export async function saveSaleUnlockPin(saleId: string, pin: string) {
  const value = pin.trim()
  if (!saleId || !value) return
  await db.update(sales).set({ unlockPin: value }).where(eq(sales.id, saleId))
}

export async function getSaleUnlockPin(saleId: string) {
  const [row] = await db
    .select({ unlockPin: sales.unlockPin })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1)
  return row?.unlockPin?.trim() || ''
}

export async function listSales(): Promise<Sale[]> {
  const saleRows = await db.select().from(sales).orderBy(desc(sales.date))
  if (!saleRows.length) return []

  const saleIds = saleRows.map((s) => s.id)
  const itemRows = await db.select().from(saleItems).where(inArray(saleItems.saleId, saleIds))

  const itemsBySale = new Map<string, SaleItem[]>()
  for (const item of itemRows) {
    const list = itemsBySale.get(item.saleId) ?? []
    list.push({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })
    itemsBySale.set(item.saleId, list)
  }

  return saleRows.map((row) => mapSale(row, itemsBySale.get(row.id) ?? []))
}

export type SaleEditLine = {
  product_id: string
  quantity: number
  serial_number: string
}

export type SaleForEdit = {
  sale: Sale
  customer: Customer
  items: SaleEditLine[]
}

export async function getSaleForEdit(id: string): Promise<SaleForEdit | null> {
  const saleId = id.trim()
  if (!saleId) return null

  const [saleRow] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!saleRow) return null

  const [customer, itemRows, warrantyRows] = await Promise.all([
    getCustomer(saleRow.customerId),
    db.select().from(saleItems).where(eq(saleItems.saleId, saleId)),
    db.select().from(warranties).where(eq(warranties.saleId, saleId)),
  ])
  if (!customer) return null

  const serialsByProduct = new Map<string, string[]>()
  for (const row of warrantyRows) {
    const list = serialsByProduct.get(row.productId) ?? []
    if (row.serialNumber?.trim()) list.push(row.serialNumber.trim())
    serialsByProduct.set(row.productId, list)
  }

  const mappedItems: SaleItem[] = itemRows.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total: item.total,
  }))

  const items: SaleEditLine[] =
    itemRows.length > 0
      ? itemRows.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          serial_number: (serialsByProduct.get(item.productId) || []).join(', '),
        }))
      : [
          {
            product_id: '',
            quantity: 1,
            serial_number: warrantyRows.map((w) => w.serialNumber).filter(Boolean).join(', '),
          },
        ]

  return {
    sale: mapSale(saleRow, mappedItems),
    customer,
    items,
  }
}

export async function listPaymentSchedules(): Promise<PaymentSchedule[]> {
  const scheduleRows = await db.select().from(paymentSchedules)
  if (!scheduleRows.length) return []

  const scheduleIds = scheduleRows.map((s) => s.id)
  const instRows = await db
    .select()
    .from(installments)
    .where(inArray(installments.scheduleId, scheduleIds))

  const bySchedule = new Map<string, (typeof installments.$inferSelect)[]>()
  for (const inst of instRows) {
    const list = bySchedule.get(inst.scheduleId) ?? []
    list.push(inst)
    bySchedule.set(inst.scheduleId, list)
  }

  return scheduleRows.map((row) =>
    mapSchedule(
      row,
      (bySchedule.get(row.id) ?? []).sort((a, b) => a.weekNumber - b.weekNumber)
    )
  )
}

export async function listInvoices(): Promise<Invoice[]> {
  const invoiceRows = await db.select().from(invoices).orderBy(desc(invoices.issueDate))
  if (!invoiceRows.length) return []

  const invoiceIds = invoiceRows.map((i) => i.id)
  const itemRows = await db
    .select()
    .from(invoiceItems)
    .where(inArray(invoiceItems.invoiceId, invoiceIds))

  const itemsByInvoice = new Map<string, Invoice['items']>()
  for (const item of itemRows) {
    const list = itemsByInvoice.get(item.invoiceId) ?? []
    list.push({
      product_id: item.productId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })
    itemsByInvoice.set(item.invoiceId, list)
  }

  return invoiceRows.map((row) => mapInvoice(row, itemsByInvoice.get(row.id) ?? []))
}

export type { InvoiceDetail }

export async function getInvoiceDetail(idOrNumber: string): Promise<InvoiceDetail | null> {
  const key = idOrNumber.trim()
  if (!key) return null

  const [byId] = await db.select().from(invoices).where(eq(invoices.id, key)).limit(1)
  const [byNumber] = byId
    ? [byId]
    : await db.select().from(invoices).where(eq(invoices.invoiceNumber, key)).limit(1)
  const invoiceRow = byNumber
  if (!invoiceRow) return null

  const [itemRows, customer, [saleRow], paymentRows] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceRow.id)),
    getCustomer(invoiceRow.customerId),
    db.select().from(sales).where(eq(sales.id, invoiceRow.saleId)).limit(1),
    db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceRow.id))
      .orderBy(desc(payments.date)),
  ])

  if (!customer || !saleRow) return null

  const invoice = mapInvoice(
    invoiceRow,
    itemRows.map((item) => ({
      product_id: item.productId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    }))
  )

  return {
    invoice,
    customer,
    sale: {
      id: saleRow.id,
      payment_type: saleRow.paymentType as PaymentType,
      payment_method: (saleRow.paymentMethod || 'cash') as Sale['payment_method'],
      status: saleRow.status as SaleStatus,
      notes: saleRow.notes,
    },
    payments: paymentRows.map((p) => ({
      id: p.id,
      amount: p.amount,
      date: p.date,
      method: p.method,
      reference: p.reference,
      status: p.status,
    })),
  }
}

export async function listPaymentReminders(
  customerList: Customer[]
): Promise<PaymentReminder[]> {
  const schedules = await listPaymentSchedules()
  const now = Date.now()
  const reminders: PaymentReminder[] = []

  for (const schedule of schedules) {
    for (const inst of schedule.installments) {
      if (inst.status === 'paid') continue

      const daysUntil = Math.ceil((inst.due_date.getTime() - now) / (1000 * 60 * 60 * 24))
      // Show overdue + anything due in the next 30 days
      if (daysUntil > 30) continue

      const status: PaymentReminder['status'] =
        daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'due_today' : 'due_soon'
      const customerName =
        customerList.find((c) => c.id === schedule.customer_id)?.name || 'Customer'

      reminders.push({
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
      })
    }
  }

  return reminders
}

function parseLineSerials(raw: string | undefined, qty: number): string[] {
  const parts = parseDeviceSerials(raw)
  if (parts.length === 0) {
    throw new Error('Enter a device serial number for every unit')
  }
  if (parts.length === 1 && qty === 1) return parts
  if (parts.length === qty) return parts
  throw new Error(
    `Serial count must match quantity (${qty}). Separate multiple serials with commas.`
  )
}

export async function createSale(
  input: SaleInput
): Promise<{ sale: Sale; invoice: Invoice; schedule: PaymentSchedule }> {
  if (!input.items.length) throw new Error('Add at least one product')
  if (
    !input.site_gps ||
    !Number.isFinite(input.site_gps.latitude) ||
    !Number.isFinite(input.site_gps.longitude)
  ) {
    throw new Error('Capture live GPS before saving this sale')
  }
  if (!input.site_gps.locked) {
    throw new Error('GPS capture must be locked before saving')
  }
  if (!input.site_photo_url?.trim()) {
    throw new Error('Upload a unit photo before saving this sale')
  }

  if (!(input.dares_type_of_payment || '').trim()) {
    throw new Error('Select DARES type of payment')
  }
  if (!(input.dares_payment_plan || '').trim()) {
    throw new Error('Select DARES payment plan')
  }
  const costToEndUser = Math.max(0, Math.round(Number(input.cost_to_end_user_ngn) || 0))
  if (costToEndUser <= 0) {
    throw new Error('Enter cost to end user (NGN)')
  }
  const downpayment = Math.max(0, Math.round(Number(input.downpayment_amount_ngn) || 0))
  if (input.payment_type === 'installment' && downpayment < 0) {
    throw new Error('Enter a valid downpayment amount')
  }

  // Validate PAYGO dates before any DB writes (avoids orphan customers on failure)
  let installment_interval_days: number | null = null
  let plan_end_date: Date | null = null
  let installment_weeks: number | null = null
  const startDay = todayInLagos()

  if (input.payment_type === 'installment') {
    const interval = Math.round(Number(input.installment_interval_days))
    if (!isValidIntervalDays(interval)) {
      throw new Error('Payment interval must be a whole number of days between 1 and 365')
    }
    installment_interval_days = interval

    if (!input.plan_end_date?.trim()) {
      throw new Error('Choose a plan end date')
    }
    const parsedEnd = parseDateInput(input.plan_end_date)
    if (Number.isNaN(parsedEnd.getTime())) {
      throw new Error('Invalid plan end date')
    }
    if (parsedEnd.getTime() <= startDay.getTime()) {
      throw new Error(
        `Plan end date must be after the sale date (sale date is ${toDateInputValue(startDay)}; pick a later end date)`
      )
    }
    plan_end_date = parsedEnd

    const spanDays = Math.round((plan_end_date.getTime() - startDay.getTime()) / 86400000)
    installment_weeks = Math.max(1, Math.ceil(spanDays / 7))
  }

  const gpsCheckForNewCustomer = input.new_customer
    ? evaluateDeploymentArea(input.site_gps.latitude, input.site_gps.longitude, {
        state: input.new_customer.state,
        lga: input.new_customer.lga,
      })
    : null

  return db.transaction(async (tx) => {
    let customerId = input.customer_id?.trim() || ''
    if (!customerId && input.new_customer) {
      const created = await createCustomer(
        {
          ...input.new_customer,
          latitude: input.site_gps.latitude,
          longitude: input.site_gps.longitude,
          gps_captured_at: new Date(input.site_gps.captured_at),
          gps_locked: true,
          gps_out_of_area: gpsCheckForNewCustomer?.out_of_area ?? input.site_gps.out_of_area,
          photo_url: input.site_photo_url.trim(),
        },
        tx
      )
      customerId = created.id
    }
    if (!customerId) throw new Error('Select or create a customer')

    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
    if (!customer) throw new Error('Customer not found')

    if (!(customer.gender || '').trim()) {
      throw new Error('Update this customer with gender before creating a claimable sale')
    }
    if (!(customer.customerCategory || '').trim()) {
      throw new Error('Update this customer with customer category before creating a claimable sale')
    }
    if (!(customer.customerType || '').trim()) {
      throw new Error('Update this customer with customer type before creating a claimable sale')
    }

    const gpsCheck =
      gpsCheckForNewCustomer ??
      evaluateDeploymentArea(input.site_gps.latitude, input.site_gps.longitude, {
        state: customer.state,
        lga: customer.lga || '',
      })
    const gpsOutOfArea = gpsCheck.out_of_area

    // DARES: installation GPS must be unique (even within the same compound)
    const priorGpsRows = await tx
      .select({
        id: sales.id,
        latitude: sales.latitude,
        longitude: sales.longitude,
      })
      .from(sales)
    for (const prior of priorGpsRows) {
      if (prior.latitude == null || prior.longitude == null) continue
      if (
        sameGpsPoint(
          input.site_gps.latitude,
          input.site_gps.longitude,
          prior.latitude,
          prior.longitude
        )
      ) {
        throw new Error(
          `Site GPS matches an existing installation (${prior.id}). Move a few meters and recapture — points cannot be identical.`
        )
      }
    }

    const qtyByProduct = new Map<string, number>()
    for (const line of input.items) {
      const qty = Math.max(1, Math.floor(line.quantity))
      qtyByProduct.set(line.product_id, (qtyByProduct.get(line.product_id) || 0) + qty)
    }

    const productIds = Array.from(qtyByProduct.keys())
    const productRows = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
    const productMap = new Map(productRows.map((p) => [p.id, p]))

    for (const [productId, qty] of qtyByProduct) {
      const product = productMap.get(productId)
      if (!product) throw new Error(`Product ${productId} not found`)
      if (product.stock < qty) {
        throw new Error(
          `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}, requested: ${qty}`
        )
      }
    }

    const items: SaleItem[] = input.items.map((line) => {
      const product = productMap.get(line.product_id)!
      const quantity = Math.max(1, Math.floor(line.quantity))
      return {
        product_id: product.id,
        quantity,
        unit_price: product.price,
        total: product.price * quantity,
      }
    })

    const subtotal = items.reduce((sum, item) => sum + item.total, 0)
    const discount_percent = Math.min(100, Math.max(0, input.discount_percent || 0))
    const discountAmount = (subtotal * discount_percent) / 100
    const afterDiscount = subtotal - discountAmount
    const vat_amount = 0
    const transport_cost = Math.max(0, Math.round(input.transport_cost || 0))
    const total_amount = Math.round(afterDiscount + vat_amount + transport_cost)
    const cost = items.reduce((sum, item) => {
      const product = productMap.get(item.product_id)
      return sum + (product?.cost || 0) * item.quantity
    }, 0)
    const profit = total_amount - cost - transport_cost

    const payment_type = input.payment_type
    const payment_method = input.payment_method || 'cash'
    const isFullyPaid = payment_type === 'full'
    const now = new Date()

    const existingSales = await tx.select({ id: sales.id }).from(sales)
    const existingInvoices = await tx.select({ id: invoices.id }).from(invoices)
    const existingSchedules = await tx.select({ id: paymentSchedules.id }).from(paymentSchedules)
    const existingMovements = await tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)

    const saleId = nextId(
      'SALE',
      existingSales.map((s) => s.id),
      6
    )
    const invoiceId = nextId(
      'INV',
      existingInvoices.map((i) => i.id),
      6
    )
    const scheduleId = nextId(
      'SCH',
      existingSchedules.map((s) => s.id),
      6
    )
    const invoiceNumber = `INV-${now.getFullYear()}-${invoiceId.replace(/\D/g, '').padStart(5, '0')}`
    const notes =
      input.notes.trim() ||
      (payment_type === 'full'
        ? `Full payment — ${customer.businessType}`
        : `PAYGO every ${installment_interval_days} days through ${plan_end_date!.toLocaleDateString('en-NG')} — ${customer.businessType}`)

    const retailCost = Math.max(
      0,
      Math.round(Number(input.retail_cost_ngn) || total_amount)
    )
    const amountPaidAtSale = isFullyPaid ? total_amount : downpayment

    for (const item of items) {
      const product = productMap.get(item.product_id)!
      if (!(product.modelNumber || '').trim() && !(product.sku || '').trim()) {
        throw new Error(`Product ${product.name} is missing an approved model number`)
      }
      if (!product.pvCapacityWp || product.pvCapacityWp <= 0) {
        throw new Error(
          `Product ${product.name} needs PV capacity (W) set in Products before claiming`
        )
      }
    }

    const [saleRow] = await tx
      .insert(sales)
      .values({
        id: saleId,
        customerId,
        date: now,
        status: isFullyPaid
          ? 'paid'
          : amountPaidAtSale > 0
            ? 'partial'
            : 'pending_payment',
        paymentType: payment_type,
        paymentMethod: payment_method,
        installmentWeeks: installment_weeks,
        installmentIntervalDays: installment_interval_days,
        planEndDate: plan_end_date,
        totalAmount: total_amount,
        amountPaid: amountPaidAtSale,
        discountPercent: discount_percent,
        vatAmount: vat_amount,
        transportCost: transport_cost,
        profit,
        notes,
        daresTypeOfPayment: (input.dares_type_of_payment || '').trim(),
        daresPaymentPlan: (input.dares_payment_plan || '').trim(),
        retailCostNgn: retailCost,
        costToEndUserNgn: costToEndUser,
        downpaymentAmountNgn: isFullyPaid ? total_amount : downpayment,
        latitude: input.site_gps.latitude,
        longitude: input.site_gps.longitude,
        gpsCapturedAt: new Date(input.site_gps.captured_at),
        gpsLocked: true,
        gpsOutOfArea: gpsOutOfArea,
        sitePhotoUrl: input.site_photo_url.trim(),
        createdByUserId: input.created_by_user_id || null,
      })
      .returning()

    await tx.insert(saleItems).values(
      items.map((item, idx) => ({
        id: `${saleId}-L${idx + 1}`,
        saleId,
        productId: item.product_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
      }))
    )

    const saleIndexLabel = saleId.replace(/\D/g, '').padStart(5, '0')
    const installmentList = (
      isFullyPaid
        ? buildFullPaymentInstallment(total_amount, startDay, saleIndexLabel)
        : buildInstallmentsByInterval({
            total: total_amount,
            startDate: startDay,
            endDate: plan_end_date!,
            intervalDays: installment_interval_days!,
            saleIndexLabel,
          })
    ).map((inst) =>
      isFullyPaid
        ? { ...inst, status: 'paid' as const, paid_date: now, reminder: false }
        : inst
    )

    const lastDue = installmentList[installmentList.length - 1]?.due_date ?? now

    const [invoiceRow] = await tx
      .insert(invoices)
      .values({
        id: invoiceId,
        invoiceNumber,
        saleId,
        customerId,
        issueDate: now,
        dueDate: isFullyPaid ? now : lastDue,
        status: isFullyPaid ? 'paid' : 'sent',
        totalAmount: total_amount,
        paidAmount: isFullyPaid ? total_amount : 0,
      })
      .returning()

    await tx.insert(invoiceItems).values(
      items.map((item, idx) => {
        const product = productMap.get(item.product_id)!
        return {
          id: `${invoiceId}-L${idx + 1}`,
          invoiceId,
          productId: item.product_id,
          description: product.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          total: item.total,
        }
      })
    )

    const [scheduleRow] = await tx
      .insert(paymentSchedules)
      .values({
        id: scheduleId,
        saleId,
        invoiceId,
        customerId,
        paymentType: payment_type,
        installmentWeeks: installment_weeks,
        installmentIntervalDays: installment_interval_days,
        planEndDate: plan_end_date,
        totalAmount: total_amount,
        paidAmount: amountPaidAtSale,
        nextDueDate: isFullyPaid ? null : installmentList[0]?.due_date ?? null,
      })
      .returning()

    await tx.insert(installments).values(
      installmentList.map((inst) => ({
        id: inst.id,
        scheduleId,
        weekNumber: inst.week_number,
        amount: inst.amount,
        paidAmount: isFullyPaid ? inst.amount : 0,
        dueDate: inst.due_date,
        paidDate: isFullyPaid ? now : null,
        status: inst.status,
        reminder: Boolean(inst.reminder),
      }))
    )

    if (isFullyPaid || (!isFullyPaid && downpayment > 0)) {
      const existingPaymentIds = await tx.select({ id: payments.id }).from(payments)
      const paymentId = nextId(
        'PAY',
        existingPaymentIds.map((r) => r.id),
        6
      )
      const primaryInst = installmentList[0]
      const payAmount = isFullyPaid ? total_amount : downpayment
      await tx.insert(payments).values({
        id: paymentId,
        invoiceId,
        saleId,
        customerId,
        scheduleId,
        installmentId: primaryInst?.id ?? null,
        amount: payAmount,
        date: now,
        method: payment_method,
        reference: paymentId,
        bank: '',
        status: 'success',
        paymentType: payment_type,
        weekNumber: primaryInst?.week_number ?? 1,
        isPartial: !isFullyPaid,
        expectedAmount: isFullyPaid ? total_amount : primaryInst?.amount ?? payAmount,
        notes: isFullyPaid ? 'Recorded at sale creation' : 'Downpayment at sale creation',
      })

      if (!isFullyPaid && primaryInst) {
        const paidOnFirst = Math.min(payAmount, primaryInst.amount)
        await tx
          .update(installments)
          .set({
            paidAmount: paidOnFirst,
            paidDate: paidOnFirst >= primaryInst.amount ? now : null,
            status:
              paidOnFirst >= primaryInst.amount
                ? 'paid'
                : paidOnFirst > 0
                  ? 'partial'
                  : 'pending',
          })
          .where(eq(installments.id, primaryInst.id))
      }
    }

    let movCounter = Math.max(
      0,
      ...existingMovements.map((m) => Number(m.id.replace(/\D/g, '')) || 0)
    )

    for (const [productId, quantity] of qtyByProduct) {
      movCounter += 1
      await tx.insert(inventoryMovements).values({
        id: `INV_MOV${String(movCounter).padStart(6, '0')}`,
        productId,
        type: 'out',
        quantity,
        reference: saleId,
        date: now,
        notes: `Sold via ${saleId}`,
      })

      await tx
        .update(products)
        .set({
          stock: sql`${products.stock} - ${quantity}`,
          updatedAt: now,
        })
        .where(eq(products.id, productId))
    }

    await tx
      .update(customers)
      .set({
        totalPurchases: sql`${customers.totalPurchases} + ${total_amount}`,
        outstandingBalance: isFullyPaid
          ? sql`${customers.outstandingBalance}`
          : sql`${customers.outstandingBalance} + ${total_amount}`,
      })
      .where(eq(customers.id, customer.id))

    // One warranty per sold unit — serial from the sale line when provided
    const existingWarranties = await tx.select({ id: warranties.id, serialNumber: warranties.serialNumber }).from(warranties)
    const usedSerials = new Set(
      existingWarranties.map((w) => serialLookupKey(w.serialNumber)).filter(Boolean)
    )

    const incomingSerials: string[] = []
    for (const line of input.items) {
      const qty = Math.max(1, Math.floor(line.quantity))
      incomingSerials.push(...parseLineSerials(line.serial_number, qty))
    }
    for (const serial of incomingSerials) {
      const key = serialLookupKey(serial)
      if (!key) throw new Error('Enter a device serial number for every unit')
      if (usedSerials.has(key)) {
        throw new Error(
          soldSerialMessage({
            serial,
            sale_id: '',
            customer_id: '',
            customer_name: '',
          })
        )
      }
      usedSerials.add(key)
    }

    let wtyCounter = Math.max(
      0,
      ...existingWarranties.map((w) => Number(w.id.replace(/\D/g, '')) || 0)
    )
    const warrantyRows: (typeof warranties.$inferInsert)[] = []
    let serialCursor = 0
    for (const item of items) {
      for (let unit = 0; unit < item.quantity; unit += 1) {
        wtyCounter += 1
        const startDate = now
        const expiryDate = new Date(startDate)
        expiryDate.setMonth(expiryDate.getMonth() + 24)
        const serialNumber = incomingSerials[serialCursor] || ''
        serialCursor += 1
        warrantyRows.push({
          id: `WTY${String(wtyCounter).padStart(5, '0')}`,
          saleId,
          productId: item.product_id,
          customerId,
          serialNumber,
          warrantyPeriodMonths: 24,
          startDate,
          expiryDate,
          status: 'active',
        })
      }
    }
    if (warrantyRows.length) {
      await tx.insert(warranties).values(warrantyRows)
    }

    const invoiceItemsMapped = items.map((item) => {
      const product = productMap.get(item.product_id)!
      return {
        product_id: item.product_id,
        description: product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      }
    })

    return {
      sale: mapSale(saleRow, items),
      invoice: mapInvoice(invoiceRow, invoiceItemsMapped),
      schedule: mapSchedule(
        scheduleRow,
        installmentList.map((inst) => ({
          id: inst.id,
          scheduleId,
          weekNumber: inst.week_number,
          amount: inst.amount,
          paidAmount: isFullyPaid ? inst.amount : 0,
          dueDate: inst.due_date,
          paidDate: isFullyPaid ? now : null,
          status: inst.status,
          reminder: Boolean(inst.reminder),
          reminderSmsSentAt: null,
          overdueSmsSentAt: null,
        }))
      ),
    }
  })
}

export async function updateSale(
  id: string,
  input: SaleInput
): Promise<{ sale: Sale }> {
  const saleId = id.trim()
  if (!saleId) throw new Error('Sale id is required')
  if (!input.items.length) throw new Error('Add at least one product')
  if (!input.new_customer) throw new Error('Customer details are required')
  if (!input.site_photo_url?.trim()) throw new Error('Keep or replace the unit photo')
  if (
    !input.site_gps ||
    !Number.isFinite(input.site_gps.latitude) ||
    !Number.isFinite(input.site_gps.longitude)
  ) {
    throw new Error('GPS is missing on this sale — recapture with a unit photo')
  }

  const costToEndUser = Math.max(0, Math.round(Number(input.cost_to_end_user_ngn) || 0))
  if (costToEndUser <= 0) {
    throw new Error('Enter cost to end user (NGN)')
  }

  const incomingSerials: string[] = []
  for (const line of input.items) {
    const qty = Math.max(1, Math.floor(line.quantity))
    incomingSerials.push(...parseLineSerials(line.serial_number, qty))
  }

  const [existingSale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
  if (!existingSale) throw new Error('Sale not found')

  await updateCustomer(existingSale.customerId, {
    ...input.new_customer,
    email: input.new_customer.email || '',
    phone: input.new_customer.phone || '',
    credit_limit: input.new_customer.credit_limit ?? 0,
  })

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1)
    if (!existing) throw new Error('Sale not found')
    const customerId = existing.customerId

    if (
      input.payment_type !== existing.paymentType &&
      existing.amountPaid > 0
    ) {
      throw new Error(
        'Payment type cannot be changed after money has been collected on this sale'
      )
    }

    const gpsCheck = evaluateDeploymentArea(input.site_gps.latitude, input.site_gps.longitude, {
      state: input.new_customer!.state,
      lga: input.new_customer!.lga || '',
    })

    const priorGpsRows = await tx
      .select({
        id: sales.id,
        latitude: sales.latitude,
        longitude: sales.longitude,
      })
      .from(sales)
    for (const prior of priorGpsRows) {
      if (prior.id === saleId) continue
      if (prior.latitude == null || prior.longitude == null) continue
      if (
        sameGpsPoint(
          input.site_gps.latitude,
          input.site_gps.longitude,
          prior.latitude,
          prior.longitude
        )
      ) {
        throw new Error(
          `Site GPS matches an existing installation (${prior.id}). Move a few meters and recapture.`
        )
      }
    }

    const oldItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId))
    const oldQtyByProduct = new Map<string, number>()
    for (const item of oldItems) {
      oldQtyByProduct.set(
        item.productId,
        (oldQtyByProduct.get(item.productId) || 0) + item.quantity
      )
    }

    const newQtyByProduct = new Map<string, number>()
    for (const line of input.items) {
      const qty = Math.max(1, Math.floor(line.quantity))
      newQtyByProduct.set(line.product_id, (newQtyByProduct.get(line.product_id) || 0) + qty)
    }

    const productIds = Array.from(
      new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()])
    )
    const productRows = await tx.select().from(products).where(inArray(products.id, productIds))
    const productMap = new Map(productRows.map((p) => [p.id, p]))

    for (const [productId, qty] of newQtyByProduct) {
      const product = productMap.get(productId)
      if (!product) throw new Error(`Product ${productId} not found`)
      const alreadyOnSale = oldQtyByProduct.get(productId) || 0
      if (product.stock + alreadyOnSale < qty) {
        throw new Error(
          `Insufficient stock for ${product.name}. Available: ${product.stock + alreadyOnSale} ${product.unit}, requested: ${qty}`
        )
      }
    }

    const items: SaleItem[] = input.items.map((line) => {
      const product = productMap.get(line.product_id)!
      const quantity = Math.max(1, Math.floor(line.quantity))
      return {
        product_id: product.id,
        quantity,
        unit_price: product.price,
        total: product.price * quantity,
      }
    })

    const subtotal = items.reduce((sum, item) => sum + item.total, 0)
    const discount_percent = Math.min(100, Math.max(0, input.discount_percent || 0))
    const afterDiscount = subtotal - (subtotal * discount_percent) / 100
    const transport_cost = Math.max(0, Math.round(input.transport_cost || 0))
    const total_amount = Math.round(afterDiscount + transport_cost)
    const cost = items.reduce((sum, item) => {
      const product = productMap.get(item.product_id)
      return sum + (product?.cost || 0) * item.quantity
    }, 0)
    const profit = total_amount - cost - transport_cost
    const payment_type = input.payment_type
    const payment_method = input.payment_method || existing.paymentMethod || 'cash'
    const amountPaid = existing.amountPaid
    const now = new Date()

    let installment_interval_days = existing.installmentIntervalDays
    let plan_end_date = existing.planEndDate
    let installment_weeks = existing.installmentWeeks
    if (payment_type === 'installment') {
      const interval = Math.round(Number(input.installment_interval_days || installment_interval_days || 7))
      if (!isValidIntervalDays(interval)) {
        throw new Error('Payment interval must be a whole number of days between 1 and 365')
      }
      installment_interval_days = interval
      if (input.plan_end_date?.trim()) {
        const parsedEnd = parseDateInput(input.plan_end_date)
        if (Number.isNaN(parsedEnd.getTime())) throw new Error('Invalid plan end date')
        plan_end_date = parsedEnd
      }
      if (plan_end_date) {
        const startDay = startOfLocalDay(existing.date)
        const spanDays = Math.round((plan_end_date.getTime() - startDay.getTime()) / 86400000)
        installment_weeks = Math.max(1, Math.ceil(spanDays / 7))
      }
    } else {
      installment_interval_days = null
      plan_end_date = null
      installment_weeks = null
    }

    const nextStatus: SaleStatus =
      existing.status === 'cancelled' || existing.status === 'completed'
        ? (existing.status as SaleStatus)
        : amountPaid >= total_amount
          ? 'paid'
          : amountPaid > 0
            ? 'partial'
            : 'pending_payment'

    const existingWarranties = await tx.select().from(warranties).where(eq(warranties.saleId, saleId))
    const otherWarranties = await tx
      .select({ id: warranties.id, serialNumber: warranties.serialNumber, saleId: warranties.saleId })
      .from(warranties)
    const usedSerials = new Set(
      otherWarranties
        .filter((w) => w.saleId !== saleId)
        .map((w) => serialLookupKey(w.serialNumber))
        .filter(Boolean)
    )
    for (const serial of incomingSerials) {
      const key = serialLookupKey(serial)
      if (!key) throw new Error('Enter a device serial number for every unit')
      if (usedSerials.has(key)) {
        throw new Error(soldSerialMessage({ serial, sale_id: '', customer_id: '', customer_name: '' }))
      }
      usedSerials.add(key)
    }

    const oldUnpaid = Math.max(0, existing.totalAmount - amountPaid)
    const newUnpaid = Math.max(0, total_amount - amountPaid)

    await tx
      .update(sales)
      .set({
        paymentType: payment_type,
        paymentMethod: payment_method,
        installmentWeeks: installment_weeks,
        installmentIntervalDays: installment_interval_days,
        planEndDate: plan_end_date,
        totalAmount: total_amount,
        discountPercent: discount_percent,
        transportCost: transport_cost,
        profit,
        notes:
          input.notes.trim() ||
          existing.notes ||
          (payment_type === 'full' ? 'Full payment' : 'Installment payment'),
        daresTypeOfPayment: (input.dares_type_of_payment || existing.daresTypeOfPayment || '').trim(),
        daresPaymentPlan: (input.dares_payment_plan || existing.daresPaymentPlan || '').trim(),
        retailCostNgn: Math.max(0, Math.round(Number(input.retail_cost_ngn) || total_amount)),
        costToEndUserNgn: costToEndUser,
        downpaymentAmountNgn: Math.max(0, Math.round(Number(input.downpayment_amount_ngn) || 0)),
        latitude: input.site_gps.latitude,
        longitude: input.site_gps.longitude,
        gpsCapturedAt: new Date(input.site_gps.captured_at),
        gpsLocked: true,
        gpsOutOfArea: gpsCheck.out_of_area,
        sitePhotoUrl: input.site_photo_url.trim(),
        status: nextStatus,
      })
      .where(eq(sales.id, saleId))

    await tx.delete(saleItems).where(eq(saleItems.saleId, saleId))
    await tx.insert(saleItems).values(
      items.map((item, idx) => ({
        id: `${saleId}-L${idx + 1}`,
        saleId,
        productId: item.product_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
      }))
    )

    const [invoice] = await tx.select().from(invoices).where(eq(invoices.saleId, saleId)).limit(1)
    if (invoice) {
      await tx
        .update(invoices)
        .set({
          totalAmount: total_amount,
          paidAmount: Math.min(invoice.paidAmount, total_amount),
          status:
            amountPaid >= total_amount ? 'paid' : invoice.status === 'cancelled' ? 'cancelled' : 'sent',
        })
        .where(eq(invoices.id, invoice.id))
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id))
      await tx.insert(invoiceItems).values(
        items.map((item, idx) => {
          const product = productMap.get(item.product_id)!
          return {
            id: `${invoice.id}-L${idx + 1}`,
            invoiceId: invoice.id,
            productId: item.product_id,
            description: product.name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total,
          }
        })
      )
    }

    await tx
      .update(paymentSchedules)
      .set({
        paymentType: payment_type,
        installmentWeeks: installment_weeks,
        installmentIntervalDays: installment_interval_days,
        planEndDate: plan_end_date,
        totalAmount: total_amount,
      })
      .where(eq(paymentSchedules.saleId, saleId))

    const existingMovements = await tx.select({ id: inventoryMovements.id }).from(inventoryMovements)
    let movCounter = Math.max(
      0,
      ...existingMovements.map((m) => Number(m.id.replace(/\D/g, '')) || 0)
    )
    const allProductIds = new Set([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()])
    for (const productId of allProductIds) {
      const delta = (newQtyByProduct.get(productId) || 0) - (oldQtyByProduct.get(productId) || 0)
      if (!delta) continue
      movCounter += 1
      await tx.insert(inventoryMovements).values({
        id: `INV_MOV${String(movCounter).padStart(6, '0')}`,
        productId,
        type: delta > 0 ? 'out' : 'in',
        quantity: Math.abs(delta),
        reference: `${saleId}-EDIT`,
        date: now,
        notes: `Stock adjusted after editing ${saleId}`,
      })
      await tx
        .update(products)
        .set({
          stock: delta > 0 ? sql`${products.stock} - ${delta}` : sql`${products.stock} + ${Math.abs(delta)}`,
          updatedAt: now,
        })
        .where(eq(products.id, productId))
    }

    await tx
      .update(customers)
      .set({
        totalPurchases: sql`GREATEST(0, ${customers.totalPurchases} - ${existing.totalAmount} + ${total_amount})`,
        outstandingBalance: sql`GREATEST(0, ${customers.outstandingBalance} - ${oldUnpaid} + ${newUnpaid})`,
      })
      .where(eq(customers.id, customerId))

    const warrantyIds = existingWarranties.map((w) => w.id)
    const claimed =
      warrantyIds.length > 0
        ? await tx
            .select({ warrantyId: warrantyClaims.warrantyId })
            .from(warrantyClaims)
            .where(inArray(warrantyClaims.warrantyId, warrantyIds))
        : []
    if (claimed.length && existingWarranties.length !== incomingSerials.length) {
      throw new Error(
        'This sale has warranty claims — product quantity cannot be changed. Edit serials only, or keep the same number of units.'
      )
    }

    if (existingWarranties.length === incomingSerials.length) {
      let cursor = 0
      for (const item of items) {
        for (let unit = 0; unit < item.quantity; unit += 1) {
          const row = existingWarranties[cursor]
          const serialNumber = incomingSerials[cursor] || row.serialNumber
          await tx
            .update(warranties)
            .set({
              productId: item.product_id,
              customerId,
              serialNumber,
            })
            .where(eq(warranties.id, row.id))
          cursor += 1
        }
      }
    } else {
      await tx.delete(warranties).where(eq(warranties.saleId, saleId))
      const allWty = await tx.select({ id: warranties.id }).from(warranties)
      let wtyCounter = Math.max(0, ...allWty.map((w) => Number(w.id.replace(/\D/g, '')) || 0))
      const warrantyRows: (typeof warranties.$inferInsert)[] = []
      let serialCursor = 0
      for (const item of items) {
        for (let unit = 0; unit < item.quantity; unit += 1) {
          wtyCounter += 1
          const startDate = existing.date
          const expiryDate = new Date(startDate)
          expiryDate.setMonth(expiryDate.getMonth() + 24)
          warrantyRows.push({
            id: `WTY${String(wtyCounter).padStart(5, '0')}`,
            saleId,
            productId: item.product_id,
            customerId,
            serialNumber: incomingSerials[serialCursor] || '',
            warrantyPeriodMonths: 24,
            startDate,
            expiryDate,
            status: 'active',
          })
          serialCursor += 1
        }
      }
      if (warrantyRows.length) await tx.insert(warranties).values(warrantyRows)
    }

    const firstSerial = incomingSerials[0]
    if (firstSerial) {
      await tx
        .update(deviceUnlocks)
        .set({ serialNumber: firstSerial })
        .where(eq(deviceUnlocks.saleId, saleId))
      await tx
        .update(activationCodes)
        .set({ deviceSerial: firstSerial })
        .where(eq(activationCodes.saleId, saleId))
    }

    const [saleRow] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1)
    return { sale: mapSale(saleRow!, items) }
  })
}

export async function deleteSale(id: string): Promise<{ deleted: boolean }> {
  const saleId = id.trim()
  if (!saleId) throw new Error('Sale id is required')

  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1)
    if (!sale) throw new Error('Sale not found')

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId))
    const now = new Date()

    const qtyByProduct = new Map<string, number>()
    for (const item of items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity)
    }

    const existingMovements = await tx.select({ id: inventoryMovements.id }).from(inventoryMovements)
    let movCounter = Math.max(
      0,
      ...existingMovements.map((m) => Number(m.id.replace(/\D/g, '')) || 0)
    )

    for (const [productId, quantity] of qtyByProduct) {
      movCounter += 1
      await tx.insert(inventoryMovements).values({
        id: `INV_MOV${String(movCounter).padStart(6, '0')}`,
        productId,
        type: 'in',
        quantity,
        reference: `${saleId}-DELETE`,
        date: now,
        notes: `Restocked after deleting ${saleId}`,
      })
      await tx
        .update(products)
        .set({
          stock: sql`${products.stock} + ${quantity}`,
          updatedAt: now,
        })
        .where(eq(products.id, productId))
    }

    const unpaid = Math.max(0, sale.totalAmount - sale.amountPaid)
    await tx
      .update(customers)
      .set({
        totalPurchases: sql`GREATEST(0, ${customers.totalPurchases} - ${sale.totalAmount})`,
        outstandingBalance: sql`GREATEST(0, ${customers.outstandingBalance} - ${unpaid})`,
      })
      .where(eq(customers.id, sale.customerId))

    // Remove linked inventory outs for this sale (restock movement kept as audit)
    await tx
      .delete(inventoryMovements)
      .where(eq(inventoryMovements.reference, saleId))

    await tx.delete(sales).where(eq(sales.id, saleId))
    return { deleted: true }
  })
}
