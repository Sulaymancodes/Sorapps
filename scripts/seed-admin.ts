import { config as loadEnv } from 'dotenv'
import { eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { db } from '../lib/db'
import { account, user } from '../lib/db/schema'

loadEnv({ path: '.env.local' })

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@sorapps.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'SorappsAdmin123!'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Sorapps Admin'

async function seed() {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, ADMIN_EMAIL),
  })

  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`)
    return
  }

  const userId = crypto.randomUUID()
  const now = new Date()
  const passwordHash = await hashPassword(ADMIN_PASSWORD)

  await db.insert(user).values({
    id: userId,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    emailVerified: true,
    role: 'admin',
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

  console.log('Seeded admin user')
  console.log(`  email:    ${ADMIN_EMAIL}`)
  console.log(`  password: ${ADMIN_PASSWORD}`)
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
