import { desc, eq } from 'drizzle-orm'
import { addDays } from 'date-fns'
import { db } from '@/lib/db'
import { activationCodes, customers, sales, warranties } from '@/lib/db/schema'
import { calculateValidityDays, getPaygoBaseValidityDays } from '@/lib/paygo/validity'
import { fetchBeebeeActivation, toBeebeeDayToken } from '@/lib/services/beebeejump'
import { getExpectedAmountForSale } from '@/lib/services/payments'
import { saveSaleUnlockPin } from '@/lib/services/sales'
import { nextId } from '@/lib/utils/ids'
import {
  buildActivationSmsBody,
  normalizeNigerianPhone,
  sendBulkSms,
} from '@/lib/sms/bulksms'

export type ActivationRecord = {
  id: string
  code: string
  phone: string
  customer_id: string
  customer_name: string
  sale_id?: string
  warranty_id?: string
  payment_id?: string
  device_serial: string
  message_body: string
  status: string
  validity_days: number
  amount_paid: number
  expected_amount?: number
  is_partial: boolean
  expires_at: Date
  provider_message_id?: string
  error_message?: string
  sent_at?: Date
  created_at: Date
}

export type SendActivationInput = {
  customer_id: string
  sale_id?: string
  warranty_id?: string
  device_serial?: string
  phone?: string
  /** Explicit override; otherwise derived from amount_paid / expected */
  validity_days?: number
  amount_paid?: number
  expected_amount?: number
  payment_id?: string
  created_by_user_id?: string
  forever?: boolean
  existing_pin?: string
}

function mapRow(
  row: typeof activationCodes.$inferSelect,
  customerName = 'Customer'
): ActivationRecord {
  return {
    id: row.id,
    code: row.code,
    phone: row.phone,
    customer_id: row.customerId,
    customer_name: customerName,
    sale_id: row.saleId ?? undefined,
    warranty_id: row.warrantyId ?? undefined,
    payment_id: row.paymentId ?? undefined,
    device_serial: row.deviceSerial,
    message_body: row.messageBody,
    status: row.status,
    validity_days: row.validityDays,
    amount_paid: row.amountPaid,
    expected_amount: row.expectedAmount ?? undefined,
    is_partial: row.isPartial,
    expires_at: row.expiresAt,
    provider_message_id: row.providerMessageId ?? undefined,
    error_message: row.errorMessage ?? undefined,
    sent_at: row.sentAt ?? undefined,
    created_at: row.createdAt,
  }
}

export async function listActivations(limit = 50): Promise<ActivationRecord[]> {
  const rows = await db
    .select({
      activation: activationCodes,
      customerName: customers.name,
    })
    .from(activationCodes)
    .leftJoin(customers, eq(activationCodes.customerId, customers.id))
    .orderBy(desc(activationCodes.createdAt))
    .limit(limit)

  return rows.map((row) => mapRow(row.activation, row.customerName || 'Customer'))
}

export async function sendActivationSms(
  input: SendActivationInput
): Promise<{ activation: ActivationRecord }> {
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customer_id))
    .limit(1)
  const customer = customerRows[0]
  if (!customer) throw new Error('Customer not found')

  let saleId = input.sale_id
  if (saleId) {
    const saleRows = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
    if (!saleRows[0]) throw new Error('Sale not found')
    if (saleRows[0].customerId !== customer.id) {
      throw new Error('Sale does not belong to this customer')
    }
  }

  let deviceSerial = input.device_serial?.trim() || ''
  let warrantyId = input.warranty_id

  if (input.warranty_id) {
    const warrantyRows = await db
      .select()
      .from(warranties)
      .where(eq(warranties.id, input.warranty_id))
      .limit(1)
    const warranty = warrantyRows[0]
    if (!warranty) throw new Error('Warranty / device record not found')
    if (warranty.customerId !== customer.id) {
      throw new Error('Device does not belong to this customer')
    }
    if (!deviceSerial) deviceSerial = warranty.serialNumber
    warrantyId = warranty.id
    if (!saleId) saleId = warranty.saleId
  }

  const phoneRaw = input.phone?.trim() || customer.phone
  const phone = normalizeNigerianPhone(phoneRaw)
  if (!phone) {
    throw new Error('Customer phone number is invalid for SMS delivery')
  }

  let expectedAmount = input.expected_amount
  let amountPaid = input.amount_paid

  if (saleId && (expectedAmount == null || expectedAmount <= 0)) {
    const expected = await getExpectedAmountForSale(saleId)
    if (expected) expectedAmount = expected.expected_amount
  }

  let validityDays: number
  let isPartial = false

  if (
    typeof amountPaid === 'number' &&
    amountPaid > 0 &&
    typeof expectedAmount === 'number' &&
    expectedAmount > 0
  ) {
    const calc = calculateValidityDays({
      amount_paid: amountPaid,
      expected_amount: expectedAmount,
    })
    validityDays =
      typeof input.validity_days === 'number' && input.validity_days > 0
        ? Math.max(1, Math.round(input.validity_days))
        : calc.validity_days
    isPartial = calc.is_partial
  } else if (typeof input.validity_days === 'number' && input.validity_days > 0) {
    validityDays = Math.max(1, Math.round(input.validity_days))
  } else {
    validityDays = getPaygoBaseValidityDays()
  }

  amountPaid = Math.max(0, Math.round(amountPaid || 0))
  const expectedAmountValue =
    typeof expectedAmount === 'number' && expectedAmount > 0
      ? Math.round(expectedAmount)
      : null

  let forever = Boolean(input.forever)
  if (saleId && !forever) {
    const saleRows = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1)
    const sale = saleRows[0]
    if (sale?.paymentType === 'full' || sale?.status === 'paid') forever = true
  }

  if (!deviceSerial) {
    throw new Error('Device serial number is required to request a BeeBeeJump PIN')
  }

  const beebeeDay = toBeebeeDayToken(validityDays, forever)
  const reusedPin = input.existing_pin?.trim()
  let code = reusedPin || ''
  let beebeeRaw: unknown = { reused: true, day: beebeeDay }

  if (!reusedPin) {
    const beebee = await fetchBeebeeActivation({
      sn: deviceSerial,
      day: beebeeDay,
    })
    code = beebee.pin
    beebeeRaw = beebee.raw
  }
  if (forever) validityDays = Math.max(validityDays, 3650)

  const messageBody = buildActivationSmsBody({
    customerName: customer.name.split(/\s+/)[0] || customer.name,
    code,
    deviceSerial,
    validityDays,
    amountPaid: amountPaid || undefined,
    isPartial,
    forever,
  })

  const existing = await db.select({ id: activationCodes.id }).from(activationCodes)
  const id = nextId(
    'ACT',
    existing.map((r) => r.id),
    5
  )

  const expiresAt = addDays(new Date(), validityDays)

  const [created] = await db
    .insert(activationCodes)
    .values({
      id,
      code,
      phone,
      customerId: customer.id,
      saleId: saleId || null,
      warrantyId: warrantyId || null,
      paymentId: input.payment_id || null,
      deviceSerial,
      messageBody,
      status: 'pending',
      validityDays,
      amountPaid,
      expectedAmount: expectedAmountValue,
      isPartial,
      expiresAt,
      createdByUserId: input.created_by_user_id || null,
      providerResponse: JSON.stringify({ beebee: beebeeRaw, day: beebeeDay, reused: Boolean(reusedPin) }),
    })
    .returning()

  if (saleId) {
    await saveSaleUnlockPin(saleId, code)
  }

  const sms = await sendBulkSms({
    to: phone,
    body: messageBody,
    gateway: 'otp',
  })

  if (!sms.success) {
    await db
      .update(activationCodes)
      .set({
        status: 'failed',
        errorMessage: sms.error,
        providerResponse: JSON.stringify(sms.raw ?? { error: sms.error }),
      })
      .where(eq(activationCodes.id, created.id))

    throw new Error(sms.error || 'Failed to send activation SMS')
  }

  const [sent] = await db
    .update(activationCodes)
    .set({
      status: 'sent',
      sentAt: new Date(),
      providerMessageId: sms.messageId || null,
      providerResponse: JSON.stringify(sms.raw ?? {}),
      errorMessage: null,
    })
    .where(eq(activationCodes.id, created.id))
    .returning()

  return { activation: mapRow(sent || created, customer.name) }
}

export async function resendActivationSms(id: string): Promise<{ activation: ActivationRecord }> {
  const rows = await db.select().from(activationCodes).where(eq(activationCodes.id, id)).limit(1)
  const existing = rows[0]
  if (!existing) throw new Error('Activation record not found')

  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, existing.customerId))
    .limit(1)
  const customer = customerRows[0]
  if (!customer) throw new Error('Customer not found')

  return sendActivationSms({
    customer_id: existing.customerId,
    sale_id: existing.saleId || undefined,
    warranty_id: existing.warrantyId || undefined,
    device_serial: existing.deviceSerial || undefined,
    phone: existing.phone,
    validity_days: existing.validityDays,
    amount_paid: existing.amountPaid || undefined,
    expected_amount: existing.expectedAmount ?? undefined,
    payment_id: existing.paymentId || undefined,
  })
}

export async function issueActivationForSale(input: {
  sale_id: string
  customer_id: string
  amount_paid: number
  expected_amount?: number
  payment_type?: string
  phone?: string
  created_by_user_id?: string
  existing_pin?: string
}): Promise<{ activation: ActivationRecord }> {
  const warrantyRows = await db
    .select()
    .from(warranties)
    .where(eq(warranties.saleId, input.sale_id))

  const warranty = warrantyRows.find((row) => row.serialNumber.trim())
  if (!warranty) {
    throw new Error('Add the device serial on the sale before sending a BeeBeeJump PIN')
  }

  return sendActivationSms({
    customer_id: input.customer_id,
    sale_id: input.sale_id,
    warranty_id: warranty.id,
    device_serial: warranty.serialNumber,
    phone: input.phone,
    amount_paid: input.amount_paid,
    expected_amount: input.expected_amount,
    forever: input.payment_type === 'full',
    created_by_user_id: input.created_by_user_id,
    existing_pin: input.existing_pin,
  })
}
