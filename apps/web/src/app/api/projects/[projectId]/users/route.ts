/**
 * Project Users API Route
 *
 * Manages user assignments for a specific project.
 *
 * GET /api/projects/[projectId]/users - List assigned users
 * POST /api/projects/[projectId]/users - Assign a user to the project
 * PATCH /api/projects/[projectId]/users - Set a member's project role and/or requirements-edit flag
 * DELETE /api/projects/[projectId]/users - Remove a user from the project
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getProjectUsers,
  assignUserToProject,
  removeUserFromProject,
  setCanEditRequirements,
  setProjectRole,
  type ProjectRole,
} from '@/lib/db/project-users'
import { requireAuth } from '@/lib/auth-server'
import { canManageProject } from '@/lib/authz'

const VALID_PROJECT_ROLES: ProjectRole[] = ['manager', 'team_leader', 'member']

/**
 * GET /api/projects/[projectId]/users
 *
 * Returns all users assigned to the project with their details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { projectId } = await params
    const users = await getProjectUsers(projectId)

    return NextResponse.json({
      success: true,
      data: users,
    })
  } catch (error) {
    console.error('Failed to get project users:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch project users'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects/[projectId]/users
 *
 * Assign a user to the project
 * Body: { employeeId: string, canEditRequirements?: boolean }
 *
 * `assignedBy` is taken from the session; a value in the body is ignored.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // This route had NO authorization at all, so any signed-in user could add
    // anyone — themselves included — to any project in any company. Project
    // membership is what grants access to that project's tasks, bugs and stored
    // secrets, so this was a one-request privilege escalation.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response
    if (!(await canManageProject(auth.user, projectId))) {
      return NextResponse.json(
        { success: false, error: 'You do not manage this project.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { employeeId, canEditRequirements } = body
    const assignedBy = auth.user.employeeId

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'employeeId is required' },
        { status: 400 }
      )
    }

    if (canEditRequirements !== undefined && typeof canEditRequirements !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'canEditRequirements must be a boolean' },
        { status: 400 }
      )
    }

    // Pass through undefined so re-assigning without the field keeps the
    // existing flag instead of resetting it.
    const assignment = await assignUserToProject(
      projectId,
      employeeId,
      assignedBy,
      canEditRequirements
    )

    return NextResponse.json({
      success: true,
      data: assignment,
    })
  } catch (error) {
    console.error('Failed to assign user to project:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to assign user'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/projects/[projectId]/users
 *
 * Toggle the requirements-edit flag for an already-assigned user
 * Body: { employeeId: string, canEditRequirements: boolean }
 * Restricted to roles that manage projects.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { projectId } = await params

    // Only someone who manages THIS project may change roles or flags on it.
    // The global-role gate that used to sit in front of this also EXCLUDED a
    // project manager whose global role is plain 'employee', which is exactly the
    // person per-project roles exist for.
    if (!(await canManageProject(auth.user, projectId))) {
      return NextResponse.json(
        { success: false, error: 'You do not manage this project.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { employeeId, canEditRequirements, role } = body

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'employeeId is required' },
        { status: 400 }
      )
    }

    // Per-project role: manager / team_leader / member. This is what lets the
    // same person lead one project and simply belong to another.
    if (role !== undefined) {
      if (!VALID_PROJECT_ROLES.includes(role)) {
        return NextResponse.json(
          { success: false, error: `role must be one of: ${VALID_PROJECT_ROLES.join(', ')}` },
          { status: 400 }
        )
      }
      const roleUpdated = await setProjectRole(projectId, employeeId, role)
      if (!roleUpdated) {
        return NextResponse.json(
          { success: false, error: `User ${employeeId} is not assigned to project ${projectId}` },
          { status: 404 }
        )
      }
    }

    if (typeof canEditRequirements === 'boolean') {
      const updated = await setCanEditRequirements(projectId, employeeId, canEditRequirements)
      if (!updated) {
        return NextResponse.json(
          { success: false, error: `User ${employeeId} is not assigned to project ${projectId}` },
          { status: 404 }
        )
      }
    }

    if (role === undefined && typeof canEditRequirements !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Provide a role and/or canEditRequirements' },
        { status: 400 }
      )
    }

    const members = await getProjectUsers(projectId)
    return NextResponse.json({
      success: true,
      data: members.find((member) => member.employeeId === employeeId) ?? null,
    })
  } catch (error) {
    console.error('Failed to update requirements-edit flag:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update permission'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/projects/[projectId]/users
 *
 * Remove a user from the project
 * Body: { employeeId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { projectId } = await params

    // A global role was enough here, so any 'management' user could strip members
    // from any project in any company. Authority over a project is per project.
    if (!(await canManageProject(auth.user, projectId))) {
      return NextResponse.json(
        { success: false, error: 'You do not manage this project.' },
        { status: 403 }
      )
    }
    const body = await request.json()
    const { employeeId } = body

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'employeeId is required' },
        { status: 400 }
      )
    }

    await removeUserFromProject(projectId, employeeId)

    return NextResponse.json({
      success: true,
      message: `User ${employeeId} removed from project ${projectId}`,
    })
  } catch (error) {
    console.error('Failed to remove user from project:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove user'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
