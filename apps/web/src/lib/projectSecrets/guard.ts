/**
 * Route-facing guard for project secrets. Wires the real database lookups into
 * `./secret-access.ts` and returns the same discriminated result shape the other
 * auth helpers use, so handlers can early-return the response.
 *
 * Server-side only.
 */

import 'server-only'
import { NextResponse } from 'next/server'
import { requireAuth, type AuthResult } from '../auth-server'
import { getProjectById } from '../db/projects'
import { getProjectRole } from '../db/project-users'
import { getDefaultCompanyId } from '../db/companies'
import { canAdminCompany, isPlatformAdmin } from '../authz'
import {
  decideProjectSecretAccess,
  type ProjectSecretAccessDeps,
  type SecretAction,
} from './secret-access'

const deps: ProjectSecretAccessDeps = {
  getProjectCompanyId: async (projectId) => {
    // includeDeleted: secrets of an archived project must stay reachable for
    // rotation, and a missing project has to be distinguishable from a null
    // company — `undefined` means "no such project".
    const project = await getProjectById(projectId, true)
    if (!project) return undefined
    return (project as { companyId?: string | null }).companyId ?? null
  },
  getProjectRole,
  isPlatformAdmin,
  canAdminCompany,
  getDefaultCompanyId,
}

/**
 * Require a session allowed to perform `action` on this project's secrets.
 *
 * Replaces `auth-server.assertProjectSecretAccess`, which granted every global
 * admin access to every company's vault and made no distinction between reading
 * a secret and rewriting it.
 */
export async function assertProjectSecretAccess(
  request: Request,
  projectId: string,
  action: SecretAction
): Promise<AuthResult> {
  const auth = await requireAuth(request)
  if (!auth.ok) return auth

  const decision = await decideProjectSecretAccess(auth.user, projectId, action, deps)
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

/**
 * Boolean form, for telling a client what it may do rather than letting it find
 * out from a 403. Used by the list endpoints to send `canWrite`.
 */
export async function canProjectSecretAction(
  actor: Parameters<typeof decideProjectSecretAccess>[0],
  projectId: string,
  action: SecretAction
): Promise<boolean> {
  const decision = await decideProjectSecretAccess(actor, projectId, action, deps)
  return decision.allowed
}

/** Headers for any response that carries a decrypted secret. */
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
} as const
