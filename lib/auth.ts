import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

function normalizeOrigin(url: string) {
  return url.replace(/\/$/, '')
}

function originFromHost(host?: string | null) {
  if (!host) return null
  const cleaned = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!cleaned) return null
  return `https://${cleaned}`
}

const siteUrl = normalizeOrigin(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000')

const trustedOrigins = Array.from(
  new Set(
    [
      siteUrl,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      originFromHost(process.env.VERCEL_URL),
      originFromHost(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      originFromHost(process.env.NEXT_PUBLIC_APP_URL),
      // Explicit production alias for this project
      'https://sorappscrm.vercel.app',
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',')
        .map((origin) => normalizeOrigin(origin.trim()))
        .filter(Boolean) ?? []),
    ].filter((origin): origin is string => Boolean(origin))
  )
)

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  baseURL: siteUrl,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'staff',
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
