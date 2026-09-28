/**
 * Projects API Route
 * 
 * Handles GET and POST requests for projects
 * 
 * GET /api/projects - Get all projects (with optional filters)
 * POST /api/projects - Create a new project
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getAllProjects,
  getActiveProjects,
  getMainProjects,
  createProject
} from '@/lib/db/projects'
import { getUserProjectIds } from '@/lib/db/project-users'
import { getAuthUser } from '@/lib/auth-server'
import { canAdminCompany } from '@/lib/authz'
import { Project } from '@/lib/types'

/**
 * GET /api/projects
 * 
 * Query parameters:
 * - status: 'active' | 'all' (default: 'active')
 * - type: 'main' | 'all' (default: 'all')
 * - includeDeleted: 'true' | 'false' (default: 'false', admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate before querying, so an unauthenticated request does not cost a
    // full project scan before being turned away.
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'active'
    const type = searchParams.get('type') || 'all'
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    let projects: Project[]

    // Get projects based on filters
    if (type === 'main') {
      // Get only main projects (no parent)
      projects = await getMainProjects()
    } else if (status === 'all') {
      // Get all projects (including inactive)
      projects = await getAllProjects(includeDeleted)
    } else {
      // Get only active projects (default)
      projects = await getActiveProjects()
    }

    // Project dropdowns must show ONLY projects the user has been added to —
    // for EVERY role (admin/top_management included). The admin project
    // management surfaces use /api/projects/hierarchy, which is intentionally
    // left role-based so admins can still manage all projects.
    const userProjectIds = await getUserProjectIds(authUser.employeeId)
    // Include projects the user is assigned to, plus their sub-projects
    const assignedSet = new Set(userProjectIds)
    projects = projects.filter(p =>
      assignedSet.has(p.projectId) ||
      (p.parentProjectId && assignedSet.has(p.parentProjectId))
    )

    // Assignment alone is not enough for a user who belongs to more than one
    // company: their projects in the other company were showing up in the
    // dropdowns and the mobile project filter regardless of which company the
    // session is acting in. Platform admins and pre-062 tokens keep the wide view.
    const sessionCompanyId = authUser.companyId
    if (sessionCompanyId && !authUser.isPlatformAdmin) {
      projects = projects.filter(p => !p.companyId || p.companyId === sessionCompanyId)
    }

    return NextResponse.json(projects, { status: 200 })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects
 * 
 * Create a new project
 * 
 * Request body:
 * {
 *   projectName: string (required)
 *   parentProjectId?: string (optional, for sub-projects)
 *   description?: string (optional)
 *   status?: 'Active' | 'Inactive' (default: 'Active')
 *   createdBy: string (required, employee ID)
 * }
 * 
 * Permissions: Only admin and top_management can create projects
 */
export async function POST(request: NextRequest) {
  try {
    // This route previously had no permission check at all — a "trust the
    // frontend" TODO — so any caller could create projects, and `createdBy` was
    // taken from the request body and therefore spoofable.
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.projectName) {
      return NextResponse.json(
        { error: 'Missing required field: projectName' },
        { status: 400 }
      )
    }

    // A sub-project inherits its parent's company; a top-level project belongs
    // to the company this session is acting in.
    const companyId = authUser.companyId
    if (!body.parentProjectId && !companyId) {
      return NextResponse.json(
        { error: 'No active company for this session. Sign in again or pick a company.' },
        { status: 400 }
      )
    }

    if (companyId && !(await canAdminCompany(authUser, companyId))) {
      return NextResponse.json(
        { error: 'You do not have permission to create projects in this company.' },
        { status: 403 }
      )
    }

    // Prepare project data. createdBy comes from the verified session.
    const projectData: Omit<Project, 'projectId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedBy'> = {
      projectName: body.projectName,
      companyId: companyId || undefined,
      parentProjectId: body.parentProjectId || undefined,
      description: body.description || undefined,
      status: body.status || 'Active',
      createdBy: authUser.employeeId,
      releaseEnabled: body.releaseEnabled ?? false,
      releaseChecklist: body.releaseChecklist ?? null
    }

    // Create project (validation happens in the database layer)
    const newProject = await createProject(projectData, authUser.employeeId)

    return NextResponse.json(newProject, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    
    // Return specific error messages
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}

