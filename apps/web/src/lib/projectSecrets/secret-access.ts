/**
 * Who may see, reveal or change a project's stored secrets.
 *
 * The rule this replaces (`auth-server.assertProjectSecretAccess`) let any global
 * `admin` or `top_management` user through with no company check at all, so an
 * admin of one company could read every other company's database passwords, SSH
 * keys and API tokens. It also drew no line between reading a secret and
 * rewriting or deleting one: every project member had both.
 *
 * Kept free of database imports — lookups are injected so the rules run under
 * `node --test` (see __tests__/secret-access.test.mjs). `./guard.ts` wires in the
 * real lookups for route handlers.
 */

export const PROJECT_NOT_FOUND_MESSAGE = 'Project not found'
export const NO_PROJECT_ACCESS_MESSAGE = 'No access to this project'
export const NO_WRITE_ACCESS_MESSAGE =
  'Only a project manager, team leader or company admin can change project secrets'

/**
 * `view`   — list names/keys without values.
 * `reveal` — decrypt one credential or one environment's values.
 * `write`  — create, update, delete or bulk-upload.
 * `export` — download every value for an environment as a .env file.
 *
 * `export` is grouped with `write`, not with `reveal`: pulling a whole
 * environment out of the vault in one request is the most damaging read there is,
 * so it takes the same authority as changing it.
 */
export type SecretAction = 'view' | 'reveal' | 'write' | 'export'

/** Project roles that may change a project's secrets. */
const SECRET_WRITER_ROLES = ['manager', 'team_leader']

export interface SecretActor {
  employeeId: string
  /** Global users.role. Deliberately NOT consulted here — see the note below. */
  role?: string
  /** Company this session is acting in. */
  companyId?: string | null
  isPlatformAdmin?: boolean
}

export interface ProjectSecretAccessDeps {
  /**
   * The project's company, or `undefined` when there is no such project.
   * `null` means the project exists but predates migration 062's backfill.
   */
  getProjectCompanyId: (projectId: string) => Promise<string | null | undefined>
  getProjectRole: (projectId: string, employeeId: string) => Promise<string | null>
  isPlatformAdmin: (actor: SecretActor) => Promise<boolean>
  canAdminCompany: (actor: SecretActor, companyId: string) => Promise<boolean>
  getDefaultCompanyId: (employeeId: string) => Promise<string | null>
}

export type SecretAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; message: string }

const ALLOWED: SecretAccessDecision = { allowed: true }

function denied(status: 403 | 404, message: string): SecretAccessDecision {
  return { allowed: false, status, message }
}

function isWrite(action: SecretAction): boolean {
  return action === 'write' || action === 'export'
}

export async function decideProjectSecretAccess(
  actor: SecretActor,
  projectId: string,
  action: SecretAction,
  deps: ProjectSecretAccessDeps
): Promise<SecretAccessDecision> {
  const projectCompanyId = await deps.getProjectCompanyId(projectId)
  if (projectCompanyId === undefined) {
    return denied(404, PROJECT_NOT_FOUND_MESSAGE)
  }

  // Crossing tenants is what the platform-admin flag is for.
  if (await deps.isPlatformAdmin(actor)) return ALLOWED

  if (projectCompanyId) {
    // TENANT BOUNDARY, before any role check. A token issued before migration 062
    // carries no companyId; resolve the actor's default company rather than
    // failing open as authz.isSameCompany does — an unscoped session here would
    // read every tenant's credentials.
    const actorCompanyId = actor.companyId ?? (await deps.getDefaultCompanyId(actor.employeeId))
    if (!actorCompanyId || actorCompanyId !== projectCompanyId) {
      return denied(403, NO_PROJECT_ACCESS_MESSAGE)
    }
    if (await deps.canAdminCompany(actor, projectCompanyId)) return ALLOWED
  }
  // A project with NO company (a row migration 062's backfill could not resolve)
  // falls straight through to the project-role check below. There is deliberately
  // no global-role shortcut here: `users.role` is the old deployment-wide column,
  // so honouring it would let an 'admin' or 'top_management' user of ANY company
  // read and rewrite such a project's credentials without belonging to the project
  // or its company. authz.canManageProject and canViewProject have no such
  // shortcut either; secrets must not be looser than the project itself.

  const projectRole = await deps.getProjectRole(projectId, actor.employeeId)
  if (projectRole === null) return denied(403, NO_PROJECT_ACCESS_MESSAGE)

  if (isWrite(action) && !SECRET_WRITER_ROLES.includes(projectRole)) {
    return denied(403, NO_WRITE_ACCESS_MESSAGE)
  }

  return ALLOWED
}
