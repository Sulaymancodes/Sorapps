import 'server-only'
import { createDecipheriv } from 'node:crypto'

export const BEEBEE_DAY_TOKENS = [
  '7Days',
  '30Days',
  '60Days',
  '90Days',
  '180Days',
  '360Days',
  'UnLockCode',
  'LockCode',
  'ForeverCode',
] as const

export type BeebeeDayToken = (typeof BEEBEE_DAY_TOKENS)[number]

export type BeebeeActivationData = {
  sn: string
  days: string
  encrypt: string
  pin: string
  yearOfUse?: string
  conversionCode?: string
  raw: unknown
}

const DAY_BUCKETS = [7, 30, 60, 90, 180, 360] as const

export function isBeebeeJumpConfigured() {
  return Boolean(
    process.env.BEEBEEJUMP_API_URL?.trim()
    && process.env.BEEBEEJUMP_API_KEY?.trim()
    && process.env.BEEBEEJUMP_API_SECRET?.trim()
  )
}

export function toBeebeeDayToken(validityDays: number, forever = false): BeebeeDayToken {
  if (forever) return 'ForeverCode'
  const days = Math.max(1, Math.round(validityDays))
  const bucket = DAY_BUCKETS.find((value) => days <= value) ?? 360
  return `${bucket}Days`
}

function keyBuffer(raw: string, label: string) {
  const utf8 = Buffer.from(raw, 'utf8')
  if (utf8.length === 16 || utf8.length === 24 || utf8.length === 32) return utf8
  if (/^[0-9a-fA-F]+$/.test(raw) && [32, 48, 64].includes(raw.length)) {
    return Buffer.from(raw, 'hex')
  }
  throw new Error(`${label} must be 16, 24, or 32 bytes`)
}

function aesAlgorithm(key: Buffer) {
  if (key.length === 16) return 'aes-128-cbc'
  if (key.length === 24) return 'aes-192-cbc'
  return 'aes-256-cbc'
}

export function decryptBeebeePin(encrypt: string, key = process.env.BEEBEEJUMP_AES_KEY, iv = process.env.BEEBEEJUMP_AES_IV) {
  const cipherText = encrypt.trim()
  if (!cipherText) throw new Error('BeeBeeJump returned an empty activation payload')
  if (!key?.trim() || !iv?.trim()) {
    throw new Error('BEEBEEJUMP_AES_KEY and BEEBEEJUMP_AES_IV are required to read the device PIN')
  }

  const keyBytes = keyBuffer(key.trim(), 'BEEBEEJUMP_AES_KEY')
  const ivBytes = Buffer.from(iv.trim(), 'utf8')
  if (ivBytes.length !== 16) {
    throw new Error(
      `BEEBEEJUMP_AES_IV must be 16 bytes (got ${ivBytes.length}). If the IV contains #, wrap it in quotes in .env.local.`
    )
  }

  const decipher = createDecipheriv(aesAlgorithm(keyBytes), keyBytes, ivBytes)
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()])
  const pin = plain.toString('utf8').trim()
  if (!pin) throw new Error('BeeBeeJump PIN decrypted to an empty value')
  return pin
}

type BeebeeResponse = {
  returnCode?: number
  returnMessage?: string
  retrunMessage?: string
  data?: {
    sn?: string
    days?: string
    encrypt?: string
    yearOfUse?: string
    conversionCode?: string
  }
}

export async function fetchBeebeeActivation(input: {
  sn: string
  day: BeebeeDayToken
}): Promise<BeebeeActivationData> {
  if (!isBeebeeJumpConfigured()) {
    throw new Error('BeeBeeJump is not configured. Set BEEBEEJUMP_API_URL, BEEBEEJUMP_API_KEY, and BEEBEEJUMP_API_SECRET.')
  }

  const sn = input.sn.trim()
  if (!sn) throw new Error('Device serial number is required to request a BeeBeeJump PIN')

  const response = await fetch(process.env.BEEBEEJUMP_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sn,
      day: input.day,
      apiKey: process.env.BEEBEEJUMP_API_KEY,
      apiSecret: process.env.BEEBEEJUMP_API_SECRET,
    }),
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as BeebeeResponse | null
  if (!payload) {
    throw new Error(`BeeBeeJump HTTP ${response.status}: empty response`)
  }

  const message = payload.returnMessage || payload.retrunMessage || `HTTP ${response.status}`
  if (payload.returnCode !== 0 || !payload.data?.encrypt) {
    const reasons: Record<number, string> = {
      1: 'No data for this serial',
      2: 'No permission',
      3: 'Exceeded limit',
      4: 'Provider error',
    }
    throw new Error(
      `BeeBeeJump ${reasons[payload.returnCode ?? 4] || 'request failed'}: ${message}`
    )
  }

  const pin = decryptBeebeePin(payload.data.encrypt)
  return {
    sn: payload.data.sn || sn,
    days: payload.data.days || input.day,
    encrypt: payload.data.encrypt,
    pin,
    yearOfUse: payload.data.yearOfUse,
    conversionCode: payload.data.conversionCode,
    raw: payload,
  }
}
