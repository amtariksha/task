/**
 * API Route: /api/releases/apps
 * Purpose: the Releases tab — every app the company ships, with the version live
 *          in each store now, the one before it, and the full history.
 * Methods:
 *   GET   any signed-in member of the session company
 *   POST  company admins — add an app from its App Store and/or Play Store link
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { createReleaseApp, listReleaseApps, listReleaseAppVersions } from '@/lib/db/releaseApps'
import { applyListings, fetchListings } from '@/lib/releases/sync'
import {
  NO_COMPANY_ERROR,
  canManageReleases,
  errorResponse,
  isUniqueViolation,
  listingProblem,
  loadAppSummary,
  nameFromListings,
  parseReleaseAppBody,
  sessionCompanyId,
  summarizeApp,
} from '@/lib/releases/service'
import type { ReleaseAppResponse, ReleasesListResponse } from '@/lib/releases/types'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const companyId = sessionCompanyId(auth.user)
  if (!companyId) return errorResponse(NO_COMPANY_ERROR, 400)

  try {
    const [apps, canManage] = await Promise.all([
      listReleaseApps(companyId),
      canManageReleases(auth.user, companyId),
    ])
    const versions = await listReleaseAppVersions(apps.map((app) => app.appId))

    const body: ReleasesListResponse = {
      success: true,
      apps: apps.map((app) => summarizeApp(app, versions)),
      canManage,
    }
    return NextResponse.json(body)
  } catch (error) {
    console.error('❌ [Releases] Failed to list apps:', error)
    return errorResponse('Failed to load releases', 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const companyId = sessionCompanyId(auth.user)
  if (!companyId) return errorResponse(NO_COMPANY_ERROR, 400)
  if (!(await canManageReleases(auth.user, companyId))) {
    return errorResponse('Only company admins can add apps to Releases.', 403)
  }

  const parsed = parseReleaseAppBody(await request.json().catch(() => null))
  if (!parsed.ok) return errorResponse(parsed.error, 400)

  try {
    // Read the stores first: a link that resolves to nothing is refused before
    // anything is saved, and a blank name is filled from the listing.
    const fetched = await fetchListings(parsed.input)
    const problem = listingProblem(fetched)
    if (problem) return errorResponse(problem, 422)

    const name = parsed.input.name || nameFromListings(fetched)
    if (!name) return errorResponse("The store didn't give an app name. Enter one.", 422)

    const app = await createReleaseApp(companyId, { ...parsed.input, name }, auth.user.employeeId)
    await applyListings(app.appId, fetched)

    const summary = await loadAppSummary(app.appId)
    const body: ReleaseAppResponse = { success: true, app: summary! }
    return NextResponse.json(body, { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorResponse('That store listing is already on the Releases tab.', 409)
    }
    console.error('❌ [Releases] Failed to add app:', error)
    return errorResponse('Failed to add app', 500)
  }
}
