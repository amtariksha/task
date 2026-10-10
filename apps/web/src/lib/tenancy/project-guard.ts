/**
 * Route-facing guards for reading a project and for putting one under a parent.
 * Wires the real database lookups into `./item-access.ts` and
 * `./project-parent.ts` and returns the same discriminated result shape the
 * other auth helpers use, so handlers can early-return the response.
 *
 * GET /api/projects/[projectId] had no check of its own, and the member list
 * asked only for a session, so any signed-in user could read another company's
 * project, its sub-projects and its members by id. POST /api/projects and PUT
 * /api/projects/[projectId] never checked the parent's company.
 *
 * Server-side only.
 */

import 'server-only'
import { NextResponse } from 'next/server'
import { requireAuth, type AuthResult } from '../auth-server'
import { getProjectCompanyId } from '../db/projects'
import { canAdminCompany, canManageProject, isPlatformAdmin } from '../authz'
import type { Project } from '../types'
import {
  decideProjectRead,
  type ItemActor,
  type ProjectAccessDecision,
  type ProjectReadDeps,
} from './item-access'
import {
  decideProjectCreate,
  decideProjectReparent,
  type ProjectParentDecision,
  type ProjectParentDeps,
  type ProjectParentFacts,
} from './project-parent'

const deps: ProjectReadDeps = {
  getProjectCompanyId,
  isPlatformAdmin,
}

/** May this actor read the project? For callers that already hold the session. */
export async function projectReadAccess(actor: ItemActor, projectId: string): Promise<ProjectAccessDecision> {
  return decideProjectRead(actor, projectId, deps)
}

/**
 * Require a session that may read this project: 401 without one, 404 when there
 * is no such project, 403 when it belongs to a company the session is not
 * working in.
 */
export async function requireProjectRead(request: Request, projectId: string): Promise<AuthResult> {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth

  const decision = await projectReadAccess(auth.user, projectId)
  if (!decision.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: decision.message },
        { status: decision.status }
      ),
    }
  }
  return auth
}

const parentDeps: ProjectParentDeps = {
  readAccess: projectReadAccess,
  canManageProject,
  canAdminCompany,
  getProjectCompanyId,
}

/** May this actor create a project — top-level, or under `parentProjectId`? */
export async function projectCreateAccess(
  actor: ItemActor,
  parentProjectId: string | null
): Promise<ProjectParentDecision> {
  return decideProjectCreate(actor, parentProjectId, parentDeps)
}

/**
 * May this actor change `project`'s parent to `newParentId`? For a caller that
 * has already passed canManageProject for the project itself.
 */
export async function projectReparentAccess(
  actor: ItemActor,
  project: Project,
  newParentId: string | null
): Promise<ProjectParentDecision> {
  const facts: ProjectParentFacts = {
    projectId: project.projectId,
    companyId: project.companyId ?? null,
    parentProjectId: project.parentProjectId ?? null,
  }
  return decideProjectReparent(actor, facts, newParentId, parentDeps)
}
