import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  customers,
  installments,
  inventoryMovements,
  invoiceItems,
  invoices,
  paymentSchedules,
  products,
  saleItems,
  sales,
  warranties,
} from '@/lib/db/schema'
import { createCustomer } from '@/lib/services/customers'
import type {
  Customer,
  Installment,
  Invoice,
  PaymentReminder,
  PaymentSchedule,
  PaymentType,
  Sale,
  SaleInput,
  SaleItem,
  SaleStatus,
} from '@/lib/types/crm'
import { nextId } from '@/lib/utils/ids'

function buildInstallments(
  total: number,
  weeks: number,
  startDate: Date,
  saleIndexLabel: string
): Installment[] {
  const base = Math.floor(total / weeks)
  const remainder = total - base * weeks

  return Array.from({ length: weeks }, (_, weekIdx) => {
    const week_number = weekIdx + 1
    const amount = weekIdx === weeks - 1 ? base + remainder : base
    const due_date = new Date(startDate.getTime() + weekIdx * 7 * 24 * 60 * 60 * 1000)

    return {
      id: `INST${saleIndexLabel}-W${String(week_number).padStart(2, '0')}`,
      week_number,
      amount,
      due_date,
      status: 'pending' as const,
      reminder: true,
    }
  })
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
    installment_weeks: row.installmentWeeks ?? undefined,
    total_amount: row.totalAmount,
    amount_paid: row.amountPaid,
    discount_percent: row.discountPercent,
    vat_amount: row.vatAmount,
    transport_cost: row.transportCost,
    items,
    profit: row.profit,
    notes: row.notes,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    gps_captured_at: row.gpsCapturedAt ?? null,
    gps_locked: row.gpsLocked,
    gps_out_of_area: row.gpsOutOfArea,
    site_photo_url: row.sitePhotoUrl || '',
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
    total_amount: row.totalAmount,
    paid_amount: row.paidAmount,
    next_due_date: row.nextDueDate ?? undefined,
    installments: instRows.map((inst) => ({
      id: inst.id,
      week_number: inst.weekNumber,
      amount: inst.amount,
      due_date: inst.dueDate,
      paid_date: inst.paidDate ?? undefined,
      status: inst.status as Installment['status'],
      reminder: inst.reminder,
    })),
  }
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
    throw new Error('Upload a site photo before saving this sale')
  }

  let customerId = input.customer_id?.trim() || ''
  if (!customerId && input.new_customer) {
    const created = await createCustomer({
      ...input.new_customer,
      latitude: input.site_gps.latitude,
      longitude: input.site_gps.longitude,
      gps_captured_at: new Date(input.site_gps.captured_at),
      gps_locked: true,
      gps_out_of_area: input.site_gps.out_of_area,
      photo_url: input.site_photo_url.trim(),
    })
    customerId = created.id
  }
  if (!customerId) throw new Error('Select or create a customer')

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
    if (!customer) throw new Error('Customer not found')

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
    const isFullyPaid = payment_type === 'full'
    const installment_weeks =
      payment_type === 'installment'
        ? input.installment_weeks && [4, 6, 8, 12].includes(input.installment_weeks)
          ? input.installment_weeks
          : 4
        : null

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
    const now = new Date()
    const weeks = payment_type === 'full' ? 1 : installment_weeks || 4
    const invoiceNumber = `INV-${now.getFullYear()}-${invoiceId.replace(/\D/g, '').padStart(5, '0')}`
    const notes =
      input.notes.trim() ||
      `${payment_type === 'full' ? 'Full payment' : `${installment_weeks}-week installment`} — ${customer.businessType}`

    const [saleRow] = await tx
      .insert(sales)
      .values({
        id: saleId,
        customerId,
        date: now,
        status: isFullyPaid ? 'paid' : 'pending_payment',
        paymentType: payment_type,
        installmentWeeks: installment_weeks,
        totalAmount: total_amount,
        amountPaid: isFullyPaid ? total_amount : 0,
        discountPercent: discount_percent,
        vatAmount: vat_amount,
        transportCost: transport_cost,
        profit,
        notes,
        latitude: input.site_gps.latitude,
        longitude: input.site_gps.longitude,
        gpsCapturedAt: new Date(input.site_gps.captured_at),
        gpsLocked: true,
        gpsOutOfArea: Boolean(input.site_gps.out_of_area),
        sitePhotoUrl: input.site_photo_url.trim(),
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

    const [invoiceRow] = await tx
      .insert(invoices)
      .values({
        id: invoiceId,
        invoiceNumber,
        saleId,
        customerId,
        issueDate: now,
        dueDate: isFullyPaid ? now : new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000),
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

    const saleIndexLabel = saleId.replace(/\D/g, '').padStart(5, '0')
    const installmentList = buildInstallments(total_amount, weeks, now, saleIndexLabel).map(
      (inst) =>
        isFullyPaid
          ? { ...inst, status: 'paid' as const, paid_date: now, reminder: false }
          : inst
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
        totalAmount: total_amount,
        paidAmount: isFullyPaid ? total_amount : 0,
        nextDueDate: isFullyPaid ? null : installmentList[0]?.due_date ?? null,
      })
      .returning()

    await tx.insert(installments).values(
      installmentList.map((inst) => ({
        id: inst.id,
        scheduleId,
        weekNumber: inst.week_number,
        amount: inst.amount,
        dueDate: inst.due_date,
        paidDate: isFullyPaid ? now : null,
        status: inst.status,
        reminder: Boolean(inst.reminder),
      }))
    )

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
      existingWarranties.map((w) => w.serialNumber.trim().toLowerCase()).filter(Boolean)
    )

    const parseLineSerials = (raw: string | undefined, qty: number): string[] => {
      const parts = (raw || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (parts.length === 0) return Array.from({ length: qty }, () => '')
      if (parts.length === 1 && qty === 1) return parts
      if (parts.length === qty) return parts
      if (parts.length === 1 && qty > 1) {
        return [parts[0], ...Array.from({ length: qty - 1 }, () => '')]
      }
      throw new Error(
        `Serial count must match quantity (${qty}). Separate multiple serials with commas.`
      )
    }

    const incomingSerials: string[] = []
    for (const line of input.items) {
      const qty = Math.max(1, Math.floor(line.quantity))
      incomingSerials.push(...parseLineSerials(line.serial_number, qty))
    }
    for (const serial of incomingSerials) {
      if (!serial) continue
      const key = serial.toLowerCase()
      if (usedSerials.has(key)) {
        throw new Error(`Serial number already registered: ${serial}`)
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
          dueDate: inst.due_date,
          paidDate: isFullyPaid ? now : null,
          status: inst.status,
          reminder: Boolean(inst.reminder),
        }))
      ),
    }
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
