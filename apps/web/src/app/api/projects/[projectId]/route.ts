/**
 * Individual Project API Route
 * 
 * Handles GET, PUT, and DELETE requests for a specific project
 * 
 * GET /api/projects/[projectId] - Get project by ID
 * PUT /api/projects/[projectId] - Update project
 * DELETE /api/projects/[projectId] - Soft delete project
 */

import { NextRequest, NextResponse } from 'next/server'
import { describeFailure } from '@/lib/api/client-error'
import { requireAuth } from '@/lib/auth-server'
import { canManageProject } from '@/lib/authz'
import { requireProjectRead } from '@/lib/tenancy/project-guard'
import { isInCompanyScope, projectListScope } from '@/lib/tenancy/list-scope'
import { 
  getProjectById, 
  updateProject, 
  softDeleteProject,
  getSubProjects
} from '@/lib/db/projects'

/**
 * GET /api/projects/[projectId]
 * 
 * Get a specific project by ID, with its sub-projects
 * 
 * Query parameters:
 * - includeDeleted: 'true' | 'false' (default: 'false'). Honoured only for
 *   someone who may manage the project; for anyone else a deleted project is
 *   a 404, as it is without the parameter.
 *
 * Permissions: requireProjectRead — a session working in the project's company,
 * or a platform admin. Project membership is not required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // This handler had no check at all, so any signed-in user could read another
    // company's project — name, description, status and sub-projects — by id.
    const auth = await requireProjectRead(request, projectId)
    if (!auth.ok) return auth.response

    // A soft-deleted project is for the people who can restore it. The parameter
    // was documented as admin only and honoured for everyone.
    const wantsDeleted = request.nextUrl.searchParams.get('includeDeleted') === 'true'
    const includeDeleted = wantsDeleted && (await canManageProject(auth.user, projectId))

    const project = await getProjectById(projectId, includeDeleted)

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      )
    }

    // Also get sub-projects if this is a main project. They share the parent's
    // company; one that has since been moved to another is not listed here.
    const scope = projectListScope(auth.user)
    const subProjects = (await getSubProjects(projectId)).filter((subProject) =>
      isInCompanyScope(scope, subProject.companyId)
    )

    return NextResponse.json(
      { 
        ...project,
        subProjects: subProjects 
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/projects/[projectId]
 * 
 * Update a project
 * 
 * Request body:
 * {
 *   projectName?: string
 *   parentProjectId?: string
 *   description?: string
 *   status?: 'Active' | 'Inactive'
 * }
 *
 * The actor is taken from the session; an `updatedBy` in the body is ignored.
 *
 * Permissions: canManageProject — a company admin of the project's company, or
 * the project's own manager.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    // Tolerate an absent or malformed body: every field is optional.
    const body = await request.json().catch(() => ({} as Record<string, unknown>))

    // This route carried a "TODO: Add permission check / trust the frontend"
    // comment, so any caller could edit any project, and the actor came from
    // the request body and was therefore spoofable. Both now come from the
    // verified session, and canManageProject applies the tenant boundary.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    // Existence first, so a missing project is a 404 rather than a 403 that
    // leaks nothing but reads like a permissions problem.
    const existingProject = await getProjectById(projectId)
    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (!(await canManageProject(auth.user, projectId))) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this project.' },
        { status: 403 }
      )
    }

    // Prepare updates (only include fields that are provided)
    const updates: any = {}
    if (body.projectName !== undefined) updates.projectName = body.projectName
    if (body.parentProjectId !== undefined) updates.parentProjectId = body.parentProjectId
    if (body.description !== undefined) updates.description = body.description
    if (body.status !== undefined) updates.status = body.status
    if (body.releaseEnabled !== undefined) updates.releaseEnabled = body.releaseEnabled
    if (body.releaseChecklist !== undefined) updates.releaseChecklist = body.releaseChecklist

    // Update project (validation happens in the database layer)
    const updatedProject = await updateProject(projectId, updates, auth.user.employeeId)

    // The project is spread at the top level for the existing web callers, with
    // `success` added because the mobile client reads that flag and treated the
    // absent field as a failure.
    return NextResponse.json({ ...updatedProject, success: true }, { status: 200 })
  } catch (error) {
    console.error('Error updating project:', error)

    // What the database layer's validation threw goes out as a 400; a driver
    // error is a 500 that says nothing about the schema.
    const { status, message } = describeFailure(error, 'Failed to update project', 400)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * DELETE /api/projects/[projectId]
 * 
 * Soft delete a project (mark as deleted, not physical delete)
 * 
 * Request body: none. The actor is taken from the session; a `deletedBy` in the
 * body is ignored.
 *
 * Permissions: canManageProject — a company admin of the project's company, or
 * the project's own manager.
 * 
 * Note: Cannot delete projects with sub-projects
 */
// PATCH handler (alias for PUT to support both methods)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  return PUT(request, { params })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // DELETE carries no body from either client, so parsing it unconditionally
    // threw and every delete came back 400 "Unexpected end of JSON input".
    // This route carried a "TODO: Add permission check / trust the frontend"
    // comment, so any caller could delete any project, and the actor came from
    // the request body and was therefore spoofable. Both now come from the
    // verified session, and canManageProject applies the tenant boundary.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const existingProject = await getProjectById(projectId)
    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    if (!(await canManageProject(auth.user, projectId))) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this project.' },
        { status: 403 }
      )
    }

    // Soft delete project (will fail if it has sub-projects)
    const success = await softDeleteProject(projectId, auth.user.employeeId)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Project deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting project:', error)

    // What the database layer's validation threw goes out as a 400; a driver
    // error is a 500 that says nothing about the schema.
    const { status, message } = describeFailure(error, 'Failed to delete project', 400)
    return NextResponse.json({ error: message }, { status })
  }
}

