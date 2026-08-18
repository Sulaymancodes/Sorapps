import { randomInt } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { addDays } from 'date-fns'
import { db } from '@/lib/db'
import { activationCodes, customers, sales, warranties } from '@/lib/db/schema'
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
  device_serial: string
  message_body: string
  status: string
  validity_days: number
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
  validity_days?: number
  created_by_user_id?: string
}

function generateActivationCode(length = 6) {
  const max = 10 ** length
  return String(randomInt(0, max)).padStart(length, '0')
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
    device_serial: row.deviceSerial,
    message_body: row.messageBody,
    status: row.status,
    validity_days: row.validityDays,
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

  if (input.sale_id) {
    const saleRows = await db.select().from(sales).where(eq(sales.id, input.sale_id)).limit(1)
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
  }

  const phoneRaw = input.phone?.trim() || customer.phone
  const phone = normalizeNigerianPhone(phoneRaw)
  if (!phone) {
    throw new Error('Customer phone number is invalid for SMS delivery')
  }

  const validityDays = Math.max(1, Math.round(input.validity_days ?? 30))
  const code = generateActivationCode(6)
  const messageBody = buildActivationSmsBody({
    customerName: customer.name.split(/\s+/)[0] || customer.name,
    code,
    deviceSerial: deviceSerial || undefined,
    validityDays,
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
      saleId: input.sale_id || null,
      warrantyId: warrantyId || null,
      deviceSerial,
      messageBody,
      status: 'pending',
      validityDays,
      expiresAt,
      createdByUserId: input.created_by_user_id || null,
    })
    .returning()

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

  // Issue a fresh code on resend for security
  return sendActivationSms({
    customer_id: existing.customerId,
    sale_id: existing.saleId || undefined,
    warranty_id: existing.warrantyId || undefined,
    device_serial: existing.deviceSerial || undefined,
    phone: existing.phone,
    validity_days: existing.validityDays,
  })
}
