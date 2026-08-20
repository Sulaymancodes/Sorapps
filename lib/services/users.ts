import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { db } from '@/lib/db'
import { account, user } from '@/lib/db/schema'
import { normalizeRole, type AppRole } from '@/lib/roles'
import { normalizeNigerianPhone, sendBulkSms } from '@/lib/sms/bulksms'

export type AppUser = {
  id: string
  name: string
  email: string
  phone: string
  role: AppRole
  assigned_state: string
  assigned_lga: string
  created_at: Date
}

function mapUser(row: typeof user.$inferSelect): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: normalizeRole(row.role),
    assigned_state: row.assignedState || '',
    assigned_lga: row.assignedLga || '',
    created_at: row.createdAt,
  }
}

export async function listAppUsers(): Promise<AppUser[]> {
  const rows = await db.select().from(user).orderBy(asc(user.name))
  return rows.map(mapUser)
}

export async function getAppUser(id: string): Promise<AppUser | null> {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ? mapUser(rows[0]) : null
}

function generatePassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export type CreateAgentInput = {
  name: string
  email: string
  phone: string
  assigned_state: string
  assigned_lga: string
  password?: string
  send_sms?: boolean
  role?: AppRole
}

export type CreateAgentResult = {
  user: AppUser
  password: string
  sms_sent: boolean
  sms_error?: string
}

export async function createAppUser(input: CreateAgentInput): Promise<CreateAgentResult> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const phone = input.phone.trim()
  const assignedState = input.assigned_state.trim()
  const assignedLga = input.assigned_lga.trim()
  const role = input.role || 'agent'

  if (!name) throw new Error('Name is required')
  if (!email.includes('@')) throw new Error('Valid email is required')
  if (role === 'agent') {
    if (!assignedState) throw new Error('Assign a state for the agent')
    if (!assignedLga) throw new Error('Assign an LGA for the agent')
  }
  if (phone && !normalizeNigerianPhone(phone)) {
    throw new Error('Enter a valid Nigerian phone number')
  }

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  if (existing.length) throw new Error('A user with this email already exists')

  const password = input.password?.trim() || generatePassword(10)
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const userId = crypto.randomUUID()
  const now = new Date()
  const passwordHash = await hashPassword(password)

  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role,
    phone,
    assignedState: role === 'agent' ? assignedState : '',
    assignedLga: role === 'agent' ? assignedLga : '',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  })

  const created = await getAppUser(userId)
  if (!created) throw new Error('Failed to create user')

  let smsSent = false
  let smsError: string | undefined
  if (input.send_sms !== false && phone) {
    const sms = await sendAgentCredentialsSms({
      phone,
      name,
      email,
      password,
    })
    smsSent = sms.success
    if (!sms.success) smsError = sms.error
  }

  return {
    user: created,
    password,
    sms_sent: smsSent,
    sms_error: smsError,
  }
}

export async function updateAppUserRole(
  id: string,
  role: AppRole,
  opts?: { assigned_state?: string; assigned_lga?: string }
): Promise<AppUser> {
  const existing = await getAppUser(id)
  if (!existing) throw new Error('User not found')

  const assignedState =
    role === 'agent' ? (opts?.assigned_state ?? existing.assigned_state).trim() : ''
  const assignedLga =
    role === 'agent' ? (opts?.assigned_lga ?? existing.assigned_lga).trim() : ''

  if (role === 'agent') {
    if (!assignedState) throw new Error('Assign a state when setting role to agent')
    if (!assignedLga) throw new Error('Assign an LGA when setting role to agent')
  }

  await db
    .update(user)
    .set({
      role,
      assignedState,
      assignedLga,
      updatedAt: new Date(),
    })
    .where(eq(user.id, id))

  const updated = await getAppUser(id)
  if (!updated) throw new Error('Failed to update user')
  return updated
}

export async function updateAgentTerritory(
  id: string,
  assignedState: string,
  assignedLga: string
): Promise<AppUser> {
  const existing = await getAppUser(id)
  if (!existing) throw new Error('User not found')
  if (!assignedState.trim() || !assignedLga.trim()) {
    throw new Error('State and LGA are required')
  }

  await db
    .update(user)
    .set({
      assignedState: assignedState.trim(),
      assignedLga: assignedLga.trim(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, id))

  const updated = await getAppUser(id)
  if (!updated) throw new Error('Failed to update territory')
  return updated
}

export async function resetAppUserPassword(
  id: string,
  opts?: { password?: string; send_sms?: boolean }
): Promise<{ password: string; sms_sent: boolean; sms_error?: string }> {
  const existing = await getAppUser(id)
  if (!existing) throw new Error('User not found')

  const password = opts?.password?.trim() || generatePassword(10)
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  const passwordHash = await hashPassword(password)

  const accounts = await db.select().from(account).where(eq(account.userId, id))
  const credential = accounts.find((a) => a.providerId === 'credential')
  if (credential) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, credential.id))
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  let smsSent = false
  let smsError: string | undefined
  if (opts?.send_sms !== false && existing.phone) {
    const sms = await sendAgentCredentialsSms({
      phone: existing.phone,
      name: existing.name,
      email: existing.email,
      password,
    })
    smsSent = sms.success
    if (!sms.success) smsError = sms.error
  }

  return { password, sms_sent: smsSent, sms_error: smsError }
}

export async function sendAgentCredentialsSms(input: {
  phone: string
  name: string
  email: string
  password: string
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || '').replace(
    /\/$/,
    ''
  )
  const loginHint = appUrl ? ` Login: ${appUrl}/login` : ''
  return sendBulkSms({
    to: input.phone,
    body: `Sorapps: Hi ${input.name}, your agent login is ready. Email: ${input.email} Password: ${input.password}.${loginHint} Keep this private.`,
  })
}
