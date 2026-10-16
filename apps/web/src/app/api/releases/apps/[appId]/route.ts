/**
 * API Route: /api/releases/apps/[appId]
 * Methods (company admins only):
 *   PATCH   change the name or store links; the app is re-synced from the new links
 *   DELETE  remove the app from the Releases tab (soft delete; history is kept)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { softDeleteReleaseApp, updateReleaseApp } from '@/lib/db/releaseApps'
import { applyListings, fetchListings } from '@/lib/releases/sync'
import {
  canManageReleases,
  errorResponse,
  isUniqueViolation,
  listingProblem,
  loadAppForSession,
  loadAppSummary,
  parseReleaseAppBody,
} from '@/lib/releases/service'
import type { ReleaseAppResponse } from '@/lib/releases/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const { appId } = await params
  const loaded = await loadAppForSession(auth.user, appId)
  if (!loaded.ok) return loaded.response
  if (!(await canManageReleases(auth.user, loaded.companyId))) {
    return errorResponse('Only company admins can edit apps on Releases.', 403)
  }

  const parsed = parseReleaseAppBody(await request.json().catch(() => null))
  if (!parsed.ok) return errorResponse(parsed.error, 400)

  try {
    const fetched = await fetchListings(parsed.input)
    const problem = listingProblem(fetched)
    if (problem) return errorResponse(problem, 422)

    const updated = await updateReleaseApp(loaded.app.appId, {
      ...parsed.input,
      name: parsed.input.name || loaded.app.name,
    })
    if (!updated) return errorResponse('App not found', 404)
    await applyListings(updated.appId, fetched)

    const body: ReleaseAppResponse = { success: true, app: (await loadAppSummary(updated.appId))! }
    return NextResponse.json(body)
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse('That store listing is already on the Releases tab.', 409)
    }
    console.error('❌ [Releases] Failed to update app:', error)
    return errorResponse('Failed to update app', 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const { appId } = await params
  const loaded = await loadAppForSession(auth.user, appId)
  if (!loaded.ok) return loaded.response
  if (!(await canManageReleases(auth.user, loaded.companyId))) {
    return errorResponse('Only company admins can remove apps from Releases.', 403)
  }

  try {
    await softDeleteReleaseApp(loaded.app.appId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ [Releases] Failed to remove app:', error)
    return errorResponse('Failed to remove app', 500)
  }
}
