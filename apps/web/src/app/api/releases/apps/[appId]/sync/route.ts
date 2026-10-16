/**
 * API Route: /api/releases/apps/[appId]/sync
 * Method: POST — re-read the app's store listings now ("Refresh" on the card).
 *
 * Open to every member, since anyone can see the tab. Throttled per app so a
 * page full of people clicking Refresh sends the stores one request a minute,
 * not one per click; inside the window the stored summary is returned as is.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { syncReleaseApp } from '@/lib/releases/sync'
import { errorResponse, loadAppForSession, loadAppSummary } from '@/lib/releases/service'

const MIN_SYNC_INTERVAL_MS = 60_000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const { appId } = await params
  const loaded = await loadAppForSession(auth.user, appId)
  if (!loaded.ok) return loaded.response

  try {
    const lastSynced = loaded.app.lastSyncedAt ? Date.parse(loaded.app.lastSyncedAt) : 0
    const throttled = Date.now() - lastSynced < MIN_SYNC_INTERVAL_MS
    if (!throttled) await syncReleaseApp(loaded.app)

    const app = await loadAppSummary(loaded.app.appId)
    return NextResponse.json({ success: true, app, throttled })
  } catch (error) {
    console.error('❌ [Releases] Failed to sync app:', error)
    return errorResponse('Failed to refresh versions', 500)
  }
}
