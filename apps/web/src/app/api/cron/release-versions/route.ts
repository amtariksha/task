import { NextRequest, NextResponse } from 'next/server'
import { listAllReleaseApps } from '@/lib/db/releaseApps'
import { syncReleaseApp } from '@/lib/releases/sync'

// Daily store sync for the Releases tab (Vercel cron, see vercel.json).
// Android history only grows from these runs — Google shows the current
// version alone — so a version replaced within a day can be missed.
// Apps run one after another: a handful of store requests, and no burst that
// would get the server's address rate-limited by either store.
export async function GET(request: NextRequest) {
  // proxy.ts already rejects /api/cron/* without this header; kept here like the other cron routes.
  const authHeader = request.headers.get('Authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const apps = await listAllReleaseApps()
    let synced = 0
    let withErrors = 0

    for (const app of apps) {
      try {
        const fetched = await syncReleaseApp(app)
        synced++
        if (fetched.ios?.error || fetched.android?.error) withErrors++
      } catch (error) {
        withErrors++
        console.error(`❌ [Releases cron] Sync failed for app ${app.appId}:`, error)
      }
    }

    return NextResponse.json({ success: true, apps: apps.length, synced, withErrors })
  } catch (error) {
    console.error('❌ [Releases cron] Failed:', error)
    return NextResponse.json({ success: false, error: 'Release version sync failed' }, { status: 500 })
  }
}
