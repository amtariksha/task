/**
 * API Route: /api/releases/apps/[appId]/versions
 * Method: POST (company admins) — record a past version by hand.
 *
 * Google publishes no version history, so Android versions released before the
 * app was added here are only known if someone enters them. iOS history comes
 * from the App Store, but a manual entry is allowed for either platform.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { addManualVersion } from '@/lib/db/releaseApps'
import {
  canManageReleases,
  errorResponse,
  loadAppForSession,
  loadAppSummary,
  parseManualVersionBody,
} from '@/lib/releases/service'

const PLATFORM_LABEL = { ios: 'iOS', android: 'Android' } as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const { appId } = await params
  const loaded = await loadAppForSession(auth.user, appId)
  if (!loaded.ok) return loaded.response
  if (!(await canManageReleases(auth.user, loaded.companyId))) {
    return errorResponse('Only company admins can add versions.', 403)
  }

  const parsed = parseManualVersionBody(await request.json().catch(() => null))
  if (!parsed.ok) return errorResponse(parsed.error, 400)

  const { platform, version, releasedAt, notes } = parsed.input
  const hasPlatform = platform === 'ios' ? !!loaded.app.iosAppId : !!loaded.app.androidPackage
  if (!hasPlatform) {
    return errorResponse(`Add a ${platform === 'ios' ? 'App Store' : 'Play Store'} link to this app first.`, 400)
  }

  try {
    const created = await addManualVersion(
      loaded.app.appId,
      platform,
      { version, releasedAt, notes },
      auth.user.employeeId
    )
    if (!created) {
      return errorResponse(`${PLATFORM_LABEL[platform]} ${version} is already recorded.`, 409)
    }
    return NextResponse.json({ success: true, app: await loadAppSummary(loaded.app.appId) }, { status: 201 })
  } catch (error) {
    console.error('❌ [Releases] Failed to add version:', error)
    return errorResponse('Failed to add version', 500)
  }
}
