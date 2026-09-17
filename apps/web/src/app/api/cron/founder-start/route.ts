import { NextRequest, NextResponse } from 'next/server'
import { runFounderStartPush } from '@/lib/founder/start-push'

// Daily founder Start push (Vercel cron, 03:30 UTC = 09:00 IST). The time is set
// here by vercel.json only; the pause and once-a-day guard live in settings.founder_start.
export async function GET(request: NextRequest) {
  // middleware.ts already rejects /api/cron/* without this header; kept here like the other cron routes.
  const authHeader = request.headers.get('Authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const outcome = await runFounderStartPush(new Date())
    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    console.error('❌ Founder Start push failed:', error)
    return NextResponse.json(
      { success: false, error: 'Founder Start push failed' },
      { status: 500 }
    )
  }
}
