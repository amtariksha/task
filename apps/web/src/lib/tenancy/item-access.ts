/**
 * Who may read one task, one bug, or one project's requirements over GraphQL.
 *
 * /api/graphql is exempt from the proxy auth gate (it carries the public `login`
 * mutation), and the `task` and `bug` resolvers ran their project-access gate only
 * when a session was present — so an unauthenticated request returned any
 * company's task or bug by id. A signed-in `admin` or `top_management` user skipped
 * the gate entirely, with no company check. These are the rules the REST detail
 * routes already apply, kept in one place:
 *
 *   task          /api/tasks/[taskId] canAccessTask
 *   bug           /api/bugs/[bugId] canAccessBug
 *                 tenant boundary first (authz.isSameCompany), then the global
 *                 admin/top_management role, then the item's own people, then
 *                 project membership.
 *   requirements  no REST route; authz.canViewProject with the same tenant
 *                 boundary in front, so a project's requirements are visible to
 *                 exactly the sessions that can see its tasks and bugs.
 *
 * The tenant boundary fails open for a record with no company (legacy rows
 * migration 063 could not resolve) and for a token with no company (issued before
 * 062), exactly as authz.isSameCompany does. Platform admins cross it.
 *
 * Kept free of database imports: lookups are injected so the rules run under
 * `node --test` (see __tests__/item-access.test.mjs). graphql/resolvers.ts and
 * graphql/requirement-resolvers.ts wire in the real ones.
 */

export interface ItemActor {
  employeeId: string
  /** Global users.role — the legacy admin/top_management shortcut. */
  role?: string
  /** Company this session is acting in. */
  companyId?: string | null
  isPlatformAdmin?: boolean
}

export type Row = Record<string, unknown>

export interface ItemAccessDeps {
  /** authz.isPlatformAdmin: the token claim when present, else the database. */
  isPlatformAdmin: (actor: ItemActor) => Promise<boolean>
  isProjectMember: (projectId: string, employeeId: string) => Promise<boolean>
}

export interface TaskReadDeps extends ItemAccessDeps {
  loadTask: (taskId: string) => Promise<Row | null>
}

export interface BugReadDeps extends ItemAccessDeps {
  loadBug: (bugId: string) => Promise<Row | null>
}

export interface ProjectAccessDeps extends ItemAccessDeps {
  /** The project's company; `undefined` when there is no such project. */
  getProjectCompanyId: (projectId: string) => Promise<string | null | undefined>
  /** authz.canAdminCompany. */
  canAdminCompany: (actor: ItemActor, companyId: string) => Promise<boolean>
}

/** The parts of a task row the access rule reads. */
export interface TaskAccessFacts {
  companyId: string | null
  projectId: string | null
  assignees: string[]
  assignedBy: string | null
  supporters: string[]
}

/** The parts of a bug row the access rule reads. */
export interface BugAccessFacts {
  companyId: string | null
  projectId: string | null
  assignedTo: string | null
  reportedBy: string | null
}

export type ItemRead =
  | { status: 'found'; row: Row }
  | { status: 'not_found' }
  | { status: 'forbidden' }

/** Legacy global roles that see every item inside their company. */
const LEGACY_ADMIN_ROLES = ['admin', 'top_management']

function hasLegacyAdminRole(actor: ItemActor): boolean {
  return !!actor.role && LEGACY_ADMIN_ROLES.includes(actor.role)
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * `assigned_to` and `support` arrive as lib/db/tasks rowToTask receives them: a
 * JSONB array, or JSON text the driver did not parse. Text that is empty, 'null'
 * or not JSON parses to nothing, as it does there.
 */
function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'null') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function idArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** canAccessTask matches an assignee in an array, or a single parsed string. */
function assigneeIds(value: unknown): string[] {
  const parsed = parsedJson(value)
  return typeof parsed === 'string' ? [parsed] : idArray(parsed)
}

/** canAccessTask matches a supporter only in an array. */
function supporterIds(value: unknown): string[] {
  return idArray(parsedJson(value))
}

export function taskAccessFacts(row: Row): TaskAccessFacts {
  return {
    companyId: textOrNull(row.company_id),
    projectId: textOrNull(row.project_id),
    assignees: assigneeIds(row.assigned_to),
    assignedBy: textOrNull(row.assigned_by),
    supporters: supporterIds(row.support),
  }
}

export function bugAccessFacts(row: Row): BugAccessFacts {
  return {
    companyId: textOrNull(row.company_id),
    projectId: textOrNull(row.project_id),
    assignedTo: textOrNull(row.assigned_to),
    reportedBy: textOrNull(row.reported_by),
  }
}

/** authz.isSameCompany, with the platform-admin lookup injected. */
export async function isSameCompany(
  actor: ItemActor,
  recordCompanyId: string | null | undefined,
  deps: Pick<ItemAccessDeps, 'isPlatformAdmin'>
): Promise<boolean> {
  if (!recordCompanyId) return true
  if (!actor.companyId) return true
  if (actor.companyId === recordCompanyId) return true
  return deps.isPlatformAdmin(actor)
}

/** canAccessTask in /api/tasks/[taskId]. */
export async function canViewTask(actor: ItemActor, task: TaskAccessFacts, deps: ItemAccessDeps): Promise<boolean> {
  // Tenant boundary BEFORE the role check: no role or assignment grants access to
  // another company's task.
  if (!(await isSameCompany(actor, task.companyId, deps))) return false
  if (hasLegacyAdminRole(actor)) return true
  if (task.assignees.includes(actor.employeeId)) return true
  if (task.assignedBy === actor.employeeId) return true
  if (task.supporters.includes(actor.employeeId)) return true
  if (task.projectId) return deps.isProjectMember(task.projectId, actor.employeeId)
  return false
}

/** canAccessBug in /api/bugs/[bugId]. */
export async function canViewBug(actor: ItemActor, bug: BugAccessFacts, deps: ItemAccessDeps): Promise<boolean> {
  if (!(await isSameCompany(actor, bug.companyId, deps))) return false
  if (hasLegacyAdminRole(actor)) return true
  if (bug.reportedBy === actor.employeeId) return true
  if (bug.assignedTo === actor.employeeId) return true
  if (bug.projectId) return deps.isProjectMember(bug.projectId, actor.employeeId)
  return false
}

/**
 * authz.canViewProject, behind the tenant boundary. Replaces a global
 * admin/top_management shortcut that opened every company's requirements.
 *
 * One difference from canViewProject: a platform admin is let in up front, as
 * projectSecrets/secret-access does, so a project with no company stays
 * reachable for them. canViewProject only consults admin rights when the project
 * has a company. A soft-deleted project still resolves, so archiving does not
 * change who sees it.
 */
export async function canViewProjectRequirements(
  actor: ItemActor,
  projectId: string,
  deps: ProjectAccessDeps
): Promise<boolean> {
  const projectCompanyId = await deps.getProjectCompanyId(projectId)
  if (projectCompanyId === undefined) return false
  if (await deps.isPlatformAdmin(actor)) return true
  if (!(await isSameCompany(actor, projectCompanyId, deps))) return false
  if (projectCompanyId && (await deps.canAdminCompany(actor, projectCompanyId))) return true
  return deps.isProjectMember(projectId, actor.employeeId)
}

/** The `task(taskId)` query: the row, or why the caller gets none. */
export async function readTask(actor: ItemActor, taskId: string, deps: TaskReadDeps): Promise<ItemRead> {
  const row = await deps.loadTask(taskId)
  if (!row) return { status: 'not_found' }
  if (!(await canViewTask(actor, taskAccessFacts(row), deps))) return { status: 'forbidden' }
  return { status: 'found', row }
}

/** The `bug(bugId)` query: the row, or why the caller gets none. */
export async function readBug(actor: ItemActor, bugId: string, deps: BugReadDeps): Promise<ItemRead> {
  const row = await deps.loadBug(bugId)
  if (!row) return { status: 'not_found' }
  if (!(await canViewBug(actor, bugAccessFacts(row), deps))) return { status: 'forbidden' }
  return { status: 'found', row }
}
