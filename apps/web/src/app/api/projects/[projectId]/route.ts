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
import { requireAuth } from '@/lib/auth-server'
import { canManageProject } from '@/lib/authz'
import { 
  getProjectById, 
  updateProject, 
  softDeleteProject,
  getSubProjects
} from '@/lib/db/projects'

/**
 * GET /api/projects/[projectId]
 * 
 * Get a specific project by ID
 * 
 * Query parameters:
 * - includeDeleted: 'true' | 'false' (default: 'false', admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const searchParams = request.nextUrl.searchParams
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    const project = await getProjectById(projectId, includeDeleted)

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Also get sub-projects if this is a main project
    const subProjects = await getSubProjects(projectId)

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
      { error: 'Failed to fetch project' },
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
    
    // Return specific error messages
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
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
    
    // Return specific error messages
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}

