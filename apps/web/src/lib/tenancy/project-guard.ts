/**
 * Route-facing guard for reading a project. Wires the real database lookups into
 * `./item-access.ts` and returns the same discriminated result shape the other
 * auth helpers use, so handlers can early-return the response.
 *
 * GET /api/projects/[projectId] had no check of its own, and the member list
 * asked only for a session, so any signed-in user could read another company's
 * project, its sub-projects and its members by id.
 *
 * Server-side only.
 */

import 'server-only'
import { NextResponse } from 'next/server'
import { requireAuth, type AuthResult } from '../auth-server'
import { getProjectCompanyId } from '../db/projects'
import { isPlatformAdmin } from '../authz'
import {
  decideProjectRead,
  type ItemActor,
  type ProjectAccessDecision,
  type ProjectReadDeps,
} from './item-access'

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
