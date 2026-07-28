import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

const siteUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
const vercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  baseURL: siteUrl,
  // localhost and 127.0.0.1 are different origins to the browser
  trustedOrigins: [
    siteUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(vercelUrl ? [vercelUrl] : []),
  ],
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
