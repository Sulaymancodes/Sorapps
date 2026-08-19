import { NextRequest, NextResponse } from 'next/server'
import { runPaygoReminderSmsJob } from '@/lib/services/paygo-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Allow in development without secret; require in production
    if (process.env.NODE_ENV === 'production') return false
    return true
  }

  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true

  const querySecret = req.nextUrl.searchParams.get('secret')
  if (querySecret === secret) return true

  return false
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runPaygoReminderSmsJob()
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Reminder job failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
