export type SmsSendInput = {
  to: string
  body: string
  from?: string
  gateway?: 'direct-refund' | 'direct-corporate' | 'otp' | 'dual-backup'
}

export type SmsSendResult =
  | {
      success: true
      messageId?: string
      cost?: number
      raw: unknown
    }
  | {
      success: false
      error: string
      code?: string
      raw?: unknown
    }

/**
 * Normalize Nigerian phone numbers to BulkSMS format: 234XXXXXXXXXX
 */
export function normalizeNigerianPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!digits) return null

  if (digits.startsWith('234') && digits.length === 13) return digits
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`

  return null
}

function smsBaseUrl() {
  const mode = (process.env.BULK_SMS_MODE || 'live').toLowerCase()
  if (mode === 'sandbox') return 'https://www.bulksmsnigeria.com/api/sandbox/v2'
  return 'https://www.bulksmsnigeria.com/api/v2'
}

export async function sendBulkSms(input: SmsSendInput): Promise<SmsSendResult> {
  const apiToken = process.env.BULK_SMS_TOKEN
  if (!apiToken) {
    return { success: false, error: 'BULK_SMS_TOKEN is not configured' }
  }

  const to = normalizeNigerianPhone(input.to)
  if (!to) {
    return {
      success: false,
      error: 'Invalid Nigerian phone number. Use format 0701… or 234701…',
    }
  }

  const from = (input.from || process.env.BULK_SMS_SENDER || 'Sorapps').slice(0, 11)
  const gateway = input.gateway || 'otp'
  const url = `${smsBaseUrl()}/sms`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        body: input.body,
        gateway,
      }),
    })

    const result = (await response.json().catch(() => null)) as any

    if (!response.ok) {
      return {
        success: false,
        error:
          result?.error?.message ||
          result?.message ||
          `SMS API HTTP ${response.status}`,
        code: result?.error?.code || result?.code,
        raw: result,
      }
    }

    if (result?.status === 'error') {
      return {
        success: false,
        error: result.error?.message || result.message || 'Unknown SMS API error',
        code: result.error?.code || result.code,
        raw: result,
      }
    }

    return {
      success: true,
      messageId: result?.data?.message_id,
      cost: result?.data?.cost,
      raw: result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error sending SMS',
    }
  }
}

export function buildActivationSmsBody(params: {
  customerName: string
  code: string
  deviceSerial?: string
  validityDays?: number
  amountPaid?: number
  isPartial?: boolean
}) {
  const serialLine = params.deviceSerial ? ` Device: ${params.deviceSerial}.` : ''
  const validityLine =
    typeof params.validityDays === 'number'
      ? ` Valid for ${params.validityDays} day${params.validityDays === 1 ? '' : 's'}.`
      : ''
  const partialLine = params.isPartial ? ' Partial payment applied.' : ''

  return `Sorapps: Hello ${params.customerName}, your activation code is ${params.code}.${serialLine}${validityLine}${partialLine} Keep this code safe.`
}

export function buildPaygoReminderSmsBody(params: {
  customerName: string
  amount: number
  dueDateLabel: string
  weekNumber?: number
  daysUntil: number
}) {
  const week =
    typeof params.weekNumber === 'number' ? ` (week ${params.weekNumber})` : ''
  const when =
    params.daysUntil === 0
      ? 'today'
      : params.daysUntil === 1
        ? 'tomorrow'
        : `in ${params.daysUntil} days`

  return `Sorapps: Hello ${params.customerName}, PAYGO installment${week} of NGN ${params.amount.toLocaleString('en-NG')} is due ${when} (${params.dueDateLabel}). Please pay to keep your device active.`
}

export function buildPaygoOverdueSmsBody(params: {
  customerName: string
  amount: number
  dueDateLabel: string
  weekNumber?: number
  daysOverdue: number
}) {
  const week =
    typeof params.weekNumber === 'number' ? ` (week ${params.weekNumber})` : ''
  return `Sorapps: Hello ${params.customerName}, your PAYGO payment${week} of NGN ${params.amount.toLocaleString('en-NG')} was due on ${params.dueDateLabel} and is ${params.daysOverdue} day${params.daysOverdue === 1 ? '' : 's'} overdue. Please pay to restore service.`
}
