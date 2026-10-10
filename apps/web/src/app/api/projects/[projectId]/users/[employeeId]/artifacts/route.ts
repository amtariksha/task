/**
 * Project User Artifacts API Route
 *
 * Returns counts of tasks and bugs a user has within a specific project.
 * Used by the removal warning dialog.
 *
 * GET /api/projects/[projectId]/users/[employeeId]/artifacts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserArtifactCounts } from '@/lib/db/project-users'
import { requireProjectRead } from '@/lib/tenancy/project-guard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; employeeId: string }> }
) {
  try {
    const { projectId, employeeId } = await params

    // Same boundary as the member list these counts belong to; this route had
    // no check of its own.
    const auth = await requireProjectRead(request, projectId)
    if (!auth.ok) return auth.response

    const counts = await getUserArtifactCounts(projectId, employeeId)

    return NextResponse.json({
      success: true,
      data: counts,
    })
  } catch (error) {
    console.error('Failed to get artifact counts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch artifact counts' },
      { status: 500 }
    )
  }
}
