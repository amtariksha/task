/**
 * API Route: /api/releases/apps/[appId]/versions/[versionId]
 * Method: DELETE (company admins) — remove a version that was entered by hand.
 *
 * Store-sourced rows cannot be removed: the next sync would bring them back,
 * and they are the record of what actually shipped.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { deleteManualVersion } from '@/lib/db/releaseApps'
import { canManageReleases, errorResponse, loadAppForSession, loadAppSummary } from '@/lib/releases/service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string; versionId: string }> }
) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const { appId, versionId } = await params
  const loaded = await loadAppForSession(auth.user, appId)
  if (!loaded.ok) return loaded.response
  if (!(await canManageReleases(auth.user, loaded.companyId))) {
    return errorResponse('Only company admins can remove versions.', 403)
  }

  const id = Number(versionId)
  if (!Number.isInteger(id) || id <= 0) return errorResponse('Version not found', 404)

  try {
    const removed = await deleteManualVersion(loaded.app.appId, id)
    if (!removed) return errorResponse('Only versions added by hand can be removed.', 404)
    return NextResponse.json({ success: true, app: await loadAppSummary(loaded.app.appId) })
  } catch (error) {
    console.error('❌ [Releases] Failed to remove version:', error)
    return errorResponse('Failed to remove version', 500)
  }
}
