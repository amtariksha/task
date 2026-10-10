/**
 * Who may create a project, and who may put one under a parent — by creating it
 * there (POST /api/projects) or by moving it there (PUT /api/projects/[projectId]).
 *
 * The parent was never checked against the company boundary. POST asked for an
 * admin of the SESSION company and then wrote the row into the PARENT's company,
 * so an admin of company A created sub-projects inside company B, and a token
 * with no company skipped the permission check altogether. PUT let a project be
 * moved under another company's project, which that company could then no longer
 * delete, and the hierarchy errors described its projects to an outsider.
 *
 * The rule, for both routes: putting a project under a parent is a management
 * action on the PARENT. The actor must pass the tenant boundary for it
 * (decideProjectRead) and then authz.canManageProject — a company admin of the
 * parent's company, or the parent's own manager. Platform admins cross the
 * boundary; it fails open for a parent or a token with no company, exactly as
 * authz.isSameCompany does.
 *
 * A move has one more condition that holds for everyone, platform admins
 * included: the child keeps its own company, so the new parent has to be in it.
 *
 * Kept free of database imports: lookups are injected so the rules run under
 * `node --test` (see __tests__/project-parent.test.mjs). ./project-guard.ts wires
 * in the real ones.
 */

import type { ItemActor, ProjectAccessDecision } from './item-access'

export interface ProjectParentDeps {
  /** project-guard.projectReadAccess: 404 for no such project, 403 across the tenant boundary. */
  readAccess: (actor: ItemActor, projectId: string) => Promise<ProjectAccessDecision>
  /** authz.canManageProject. */
  canManageProject: (actor: ItemActor, projectId: string) => Promise<boolean>
  /** authz.canAdminCompany. */
  canAdminCompany: (actor: ItemActor, companyId: string) => Promise<boolean>
  /** The project's company; `undefined` when there is no such project. */
  getProjectCompanyId: (projectId: string) => Promise<string | null | undefined>
}

/** The parts of a project a move reads. */
export interface ProjectParentFacts {
  projectId: string
  companyId: string | null
  parentProjectId: string | null
}

export type ProjectParentDecision =
  | { allowed: true }
  | { allowed: false; status: 400 | 403; message: string }

export type ParentIdInput =
  | { valid: true; parentId: string | null }
  | { valid: false }

export const NO_ACTIVE_COMPANY_MESSAGE = 'No active company for this session. Sign in again or pick a company.'
export const CREATE_NOT_ALLOWED_MESSAGE = 'You do not have permission to create projects in this company.'
export const PARENT_NOT_FOUND_MESSAGE = 'Parent project does not exist'
export const PARENT_OTHER_COMPANY_MESSAGE =
  'The parent project belongs to another company. A project can only be placed under a project of the company you are working in.'
export const PARENT_NOT_MANAGED_MESSAGE = 'You do not have permission to add sub-projects to this project.'
export const PARENT_COMPANY_MISMATCH_MESSAGE = 'A sub-project must belong to the same company as its parent project.'
export const INVALID_PARENT_ID_MESSAGE = 'parentProjectId must be a project ID or null'

const ALLOWED: ProjectParentDecision = { allowed: true }

function refuse(status: 400 | 403, message: string): ProjectParentDecision {
  return { allowed: false, status, message }
}

/**
 * `parentProjectId` as a request body carries it. null, '' and an absent field
 * all mean "no parent"; a value of any other type is rejected rather than read
 * as one of those.
 */
export function parentIdFromBody(value: unknown): ParentIdInput {
  if (value === null || value === undefined || value === '') return { valid: true, parentId: null }
  if (typeof value === 'string') return { valid: true, parentId: value }
  return { valid: false }
}

/** May the actor put a project under this parent? The boundary, then the manage role. */
async function decideParentUse(
  actor: ItemActor,
  parentProjectId: string,
  deps: ProjectParentDeps
): Promise<ProjectParentDecision> {
  const read = await deps.readAccess(actor, parentProjectId)
  if (!read.allowed) {
    return read.status === 404
      ? refuse(400, PARENT_NOT_FOUND_MESSAGE)
      : refuse(403, PARENT_OTHER_COMPANY_MESSAGE)
  }
  if (!(await deps.canManageProject(actor, parentProjectId))) {
    return refuse(403, PARENT_NOT_MANAGED_MESSAGE)
  }
  return ALLOWED
}

/**
 * POST /api/projects. A top-level project belongs to the session company and
 * needs an admin of it, as before. A sub-project needs that too, and then the
 * right to manage its parent.
 *
 * The session-company check runs first, so someone who cannot create projects
 * at all is told only that. It is skipped for a token with no company, which
 * used to leave a sub-project with no check at all. The parent's manage rule
 * now always applies, and such a token must also administer the parent's
 * company — the one the project lands in — because a `manager` row on the
 * parent is enough to manage it but not to create projects.
 */
export async function decideProjectCreate(
  actor: ItemActor,
  parentProjectId: string | null,
  deps: ProjectParentDeps
): Promise<ProjectParentDecision> {
  if (!parentProjectId && !actor.companyId) return refuse(400, NO_ACTIVE_COMPANY_MESSAGE)
  if (actor.companyId && !(await deps.canAdminCompany(actor, actor.companyId))) {
    return refuse(403, CREATE_NOT_ALLOWED_MESSAGE)
  }
  if (!parentProjectId) return ALLOWED

  const parentUse = await decideParentUse(actor, parentProjectId, deps)
  if (!parentUse.allowed || actor.companyId) return parentUse

  const parentCompanyId = await deps.getProjectCompanyId(parentProjectId)
  if (parentCompanyId && !(await deps.canAdminCompany(actor, parentCompanyId))) {
    return refuse(403, CREATE_NOT_ALLOWED_MESSAGE)
  }
  return ALLOWED
}

/**
 * PUT /api/projects/[projectId] when the body names a parent. The caller has
 * already passed canManageProject for the project itself.
 *
 * A parent that is not changing is not checked: the web form resends it on every
 * edit, and a project already sitting under another company's project has to
 * stay editable so it can be moved out. Moving to the top level needs nothing
 * more either.
 */
export async function decideProjectReparent(
  actor: ItemActor,
  project: ProjectParentFacts,
  newParentId: string | null,
  deps: ProjectParentDeps
): Promise<ProjectParentDecision> {
  if (newParentId === project.parentProjectId) return ALLOWED
  if (newParentId === null) return ALLOWED

  const parentUse = await decideParentUse(actor, newParentId, deps)
  if (!parentUse.allowed) return parentUse

  // updateProject does not re-home the child, so a parent in another company
  // would leave a sub-project its parent's company cannot see but must delete
  // first. Fails open when either side has no company.
  const parentCompanyId = await deps.getProjectCompanyId(newParentId)
  if (project.companyId && parentCompanyId && project.companyId !== parentCompanyId) {
    return refuse(400, PARENT_COMPANY_MISMATCH_MESSAGE)
  }
  return ALLOWED
}
