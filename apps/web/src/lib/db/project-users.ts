/**
 * Project-Users Service
 *
 * Manages the junction between projects and users for access control.
 * Users assigned to a project can see it; admin/top_management see all projects.
 *
 * IMPORTANT: Server-side only - do not use 'use client' directive
 */

import { query, queryOne, withRetry } from './config'
import { countMemberArtifacts } from '../projects/member-artifact-counts'

interface ProjectUserRow {
  id: number
  project_id: string
  employee_id: string
  assigned_by: string
  assigned_at: string
  can_edit_requirements: boolean
  /** Project-scoped role (migration 062). Distinct from the user's global role. */
  role: string
  created_at: string
  updated_at: string
}

interface ProjectUserWithUserRow extends ProjectUserRow {
  user_name: string
  user_email: string
  user_role: string
  user_department: string
  user_status: string
}

/** Authority INSIDE one project. Distinct from users.role, which is global. */
export type ProjectRole = 'manager' | 'team_leader' | 'member'

export interface ProjectUser {
  projectId: string
  employeeId: string
  assignedBy: string
  assignedAt: string
  canEditRequirements: boolean
  role: ProjectRole
}

export interface ProjectUserWithUser extends ProjectUser {
  userName: string
  userEmail: string
  userRole: string
  userDepartment: string
  userStatus: string
}

function rowToProjectUser(row: ProjectUserRow): ProjectUser {
  return {
    projectId: row.project_id,
    employeeId: row.employee_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    canEditRequirements: row.can_edit_requirements ?? false,
    role: (row.role as ProjectRole) ?? 'member',
  }
}

function rowToProjectUserWithUser(row: ProjectUserWithUserRow): ProjectUserWithUser {
  return {
    projectId: row.project_id,
    employeeId: row.employee_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    canEditRequirements: row.can_edit_requirements ?? false,
    role: (row.role as ProjectRole) ?? 'member',
    userName: row.user_name,
    userEmail: row.user_email,
    userRole: row.user_role,
    userDepartment: row.user_department,
    userStatus: row.user_status,
  }
}

/**
 * Get all users assigned to a project (with user details)
 */
export async function getProjectUsers(projectId: string): Promise<ProjectUserWithUser[]> {
  return withRetry(async () => {
    const rows = await query<ProjectUserWithUserRow[]>(
      `SELECT pu.*, u.name as user_name, u.email as user_email,
              u.role as user_role, u.department as user_department, u.status as user_status
       FROM project_users pu
       JOIN users u ON pu.employee_id = u.employee_id
       WHERE pu.project_id = $1
       ORDER BY u.name ASC`,
      [projectId]
    )
    return rows.map(rowToProjectUserWithUser)
  })
}

/**
 * A user's role in one project, or null when they are not a member.
 * This is the per-project authority the global users.role column cannot express:
 * the same person can manage one project and simply be a member of another.
 */
export async function getProjectRole(projectId: string, employeeId: string): Promise<ProjectRole | null> {
  return withRetry(async () => {
    const row = await queryOne<{ role: string }>(
      'SELECT role FROM project_users WHERE project_id = $1 AND employee_id = $2',
      [projectId, employeeId]
    )
    return (row?.role as ProjectRole) ?? null
  })
}

/** Set a member's role within a project. */
export async function setProjectRole(
  projectId: string,
  employeeId: string,
  role: ProjectRole
): Promise<boolean> {
  return withRetry(async () => {
    const rows = await query<{ project_id: string }[]>(
      `UPDATE project_users SET role = $3, updated_at = NOW()
        WHERE project_id = $1 AND employee_id = $2
        RETURNING project_id`,
      [projectId, employeeId, role]
    )
    return rows.length > 0
  })
}

/** Projects where this user holds the given role (defaults to manager). */
export async function getProjectIdsWithRole(
  employeeId: string,
  role: ProjectRole = 'manager'
): Promise<string[]> {
  return withRetry(async () => {
    const rows = await query<{ project_id: string }[]>(
      'SELECT project_id FROM project_users WHERE employee_id = $1 AND role = $2',
      [employeeId, role]
    )
    return rows.map((row) => row.project_id)
  })
}

/**
 * Get all project IDs a user is assigned to
 */
export async function getUserProjectIds(employeeId: string): Promise<string[]> {
  return withRetry(async () => {
    const rows = await query<{ project_id: string }[]>(
      'SELECT project_id FROM project_users WHERE employee_id = $1',
      [employeeId]
    )
    return rows.map(row => row.project_id)
  })
}

/**
 * Assign a user to a project
 * Uses ON CONFLICT to handle duplicate assignments gracefully
 */
export async function assignUserToProject(
  projectId: string,
  employeeId: string,
  assignedBy: string,
  canEditRequirements?: boolean
): Promise<ProjectUser> {
  return withRetry(async () => {
    // On re-assignment, only overwrite the edit flag when the caller passed it
    // explicitly — legacy callers that omit it must not reset a granted flag.
    const row = await queryOne<ProjectUserRow>(
      `INSERT INTO project_users (project_id, employee_id, assigned_by, can_edit_requirements)
       VALUES ($1, $2, $3, COALESCE($4, FALSE))
       ON CONFLICT (project_id, employee_id)
       DO UPDATE SET updated_at = NOW(),
                     can_edit_requirements = COALESCE($4, project_users.can_edit_requirements)
       RETURNING *`,
      [projectId, employeeId, assignedBy, canEditRequirements ?? null]
    )
    if (!row) {
      throw new Error(`Failed to assign user ${employeeId} to project ${projectId}`)
    }
    return rowToProjectUser(row)
  })
}

/**
 * Toggle the per-assignment requirements-edit flag for an assigned user.
 * Returns the updated assignment, or null when the user is not assigned.
 */
export async function setCanEditRequirements(
  projectId: string,
  employeeId: string,
  canEdit: boolean
): Promise<ProjectUser | null> {
  return withRetry(async () => {
    const row = await queryOne<ProjectUserRow>(
      `UPDATE project_users
       SET can_edit_requirements = $3, updated_at = NOW()
       WHERE project_id = $1 AND employee_id = $2
       RETURNING *`,
      [projectId, employeeId, canEdit]
    )
    return row ? rowToProjectUser(row) : null
  })
}

/**
 * Check the per-assignment requirements-edit flag.
 * False when the user is not assigned to the project at all.
 */
export async function canEditRequirements(
  employeeId: string,
  projectId: string
): Promise<boolean> {
  return withRetry(async () => {
    const row = await queryOne<{ can_edit_requirements: boolean }>(
      'SELECT can_edit_requirements FROM project_users WHERE employee_id = $1 AND project_id = $2',
      [employeeId, projectId]
    )
    return row?.can_edit_requirements ?? false
  })
}

/**
 * Remove a user from a project
 */
export async function removeUserFromProject(
  projectId: string,
  employeeId: string
): Promise<boolean> {
  return withRetry(async () => {
    const result = await query(
      'DELETE FROM project_users WHERE project_id = $1 AND employee_id = $2',
      [projectId, employeeId]
    )
    return true
  })
}

/**
 * Check if a user is assigned to a project
 */
export async function isUserAssignedToProject(
  projectId: string,
  employeeId: string
): Promise<boolean> {
  return withRetry(async () => {
    const row = await queryOne<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM project_users WHERE project_id = $1 AND employee_id = $2) as exists',
      [projectId, employeeId]
    )
    return row?.exists ?? false
  })
}

/**
 * Bulk assign users to a project
 */
export async function bulkAssignUsersToProject(
  projectId: string,
  employeeIds: string[],
  assignedBy: string
): Promise<ProjectUser[]> {
  if (employeeIds.length === 0) return []

  return withRetry(async () => {
    // Build VALUES clause for bulk insert
    const values: string[] = []
    const params: string[] = []
    let paramIndex = 1

    for (const employeeId of employeeIds) {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`)
      params.push(projectId, employeeId, assignedBy)
      paramIndex += 3
    }

    const rows = await query<ProjectUserRow[]>(
      `INSERT INTO project_users (project_id, employee_id, assigned_by)
       VALUES ${values.join(', ')}
       ON CONFLICT (project_id, employee_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      params
    )
    return rows.map(rowToProjectUser)
  })
}

/**
 * Get artifact counts for a user within a project
 * Used for the removal warning dialog
 */
export async function getUserArtifactCounts(
  projectId: string,
  employeeId: string
): Promise<{ taskCount: number; bugCount: number }> {
  return withRetry(() => countMemberArtifacts(projectId, employeeId, { queryOne }))
}
