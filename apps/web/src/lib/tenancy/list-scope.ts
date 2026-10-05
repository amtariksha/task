/**
 * Which company's rows the GraphQL list resolvers may return.
 *
 * The REST list routes were scoped to the session's company when work items got
 * their own company_id (migration 063), but the GraphQL resolvers behind the same
 * screens were not: `tasks` and `bugs` returned every company's rows to any
 * signed-in user, and the web Tasks and Bugs pages ask GraphQL first. These are
 * the rules those REST routes already apply, kept in one place so the two paths
 * cannot drift apart again:
 *
 *   tasks, bugs  /api/tasks, /api/bugs — company_id is the session's company or
 *                NULL. There is no platform-admin exception: those routes pass the
 *                session company for everyone, and a platform admin reaches
 *                another company's work through the company switcher.
 *   projects     /api/projects — the same company test, except that platform
 *                admins keep the wide view.
 *
 * NULL company_id rows are legacy items migration 063 could not resolve; they stay
 * visible, as they do over REST. A token with no companyId (issued before 062) is
 * not filtered at all — the same mid-rollout fail-open those routes allow.
 *
 * Kept free of database imports: the query runner is injected so the rules, and
 * the SQL they produce, run under `node --test` (see __tests__/list-scope.test.mjs).
 * graphql/resolvers.ts wires in the pool.
 */

export interface ScopeActor {
  employeeId: string
  /** Company this session is acting in. */
  companyId?: string | null
  isPlatformAdmin?: boolean
}

/** `{ all: true }` means no company filter applies. */
export type CompanyScope =
  | { all: true }
  | { all: false; companyId: string }

export type Row = Record<string, unknown>

export interface ListScopeDeps {
  query: (text: string, values: unknown[]) => Promise<Row[]>
}

export interface SqlQuery {
  text: string
  values: unknown[]
}

/** Arguments of the `tasks` GraphQL query. */
export interface TaskListFilters {
  assignedTo?: string[] | null
  assignedBy?: string[] | null
  status?: string[] | null
  priority?: string[] | null
  projectId?: string | null
  projectIds?: string[] | null
  subprojectId?: string | null
  limit?: number | null
  offset?: number | null
}

/** Arguments of the `bugs` GraphQL query. */
export interface BugListFilters {
  assignedTo?: string[] | null
  reportedBy?: string[] | null
  status?: string[] | null
  severity?: string[] | null
  category?: string[] | null
  type?: string[] | null
  projectId?: string | null
  projectIds?: string[] | null
  subprojectId?: string | null
  limit?: number | null
  offset?: number | null
}

const UNSCOPED: CompanyScope = { all: true }

/** Tasks and bugs: the rule getAllTasks / getAllBugs apply for /api/tasks and /api/bugs. */
export function workItemListScope(actor: ScopeActor): CompanyScope {
  return actor.companyId ? { all: false, companyId: actor.companyId } : UNSCOPED
}

/** Projects: the rule /api/projects applies on top of its assignment filter. */
export function projectListScope(actor: ScopeActor): CompanyScope {
  if (actor.isPlatformAdmin) return UNSCOPED
  return workItemListScope(actor)
}

export function isInCompanyScope(scope: CompanyScope, companyId: string | null | undefined): boolean {
  return scope.all || !companyId || companyId === scope.companyId
}

/** Hands out `$n` placeholders in the order values are added. */
function createParams() {
  const values: unknown[] = []
  return {
    values,
    add(value: unknown): string {
      values.push(value)
      return `$${values.length}`
    },
  }
}

type Params = ReturnType<typeof createParams>

/** Same clause getAllTasks / getAllBugs append. */
function companyClause(scope: CompanyScope, params: Params): string {
  if (scope.all) return ''
  const companyId = params.add(scope.companyId)
  return ` AND (company_id = ${companyId} OR company_id IS NULL)`
}

function hasItems(list: string[] | null | undefined): list is string[] {
  return Array.isArray(list) && list.length > 0
}

function paginationClause(filters: { limit?: number | null; offset?: number | null }, params: Params): string {
  let sql = ''
  if (filters.limit) sql += ` LIMIT ${params.add(filters.limit)}`
  if (filters.offset) sql += ` OFFSET ${params.add(filters.offset)}`
  return sql
}

export function buildTaskListQuery(actor: ScopeActor, filters: TaskListFilters): SqlQuery {
  const params = createParams()
  let text = 'SELECT * FROM tasks WHERE deleted_at IS NULL'
  text += companyClause(workItemListScope(actor), params)

  if (hasItems(filters.assignedTo)) {
    // assigned_to and support are JSONB arrays
    const assignees = params.add(filters.assignedTo)
    text += ` AND (
            assigned_to::jsonb ?| ${assignees} OR
            (CASE WHEN support IS NULL OR support::text = 'null' OR support::text = '' THEN '[]'::jsonb ELSE support::jsonb END) ?| ${assignees}
          )`
  }
  if (hasItems(filters.assignedBy)) text += ` AND assigned_by = ANY(${params.add(filters.assignedBy)})`
  if (hasItems(filters.status)) text += ` AND status = ANY(${params.add(filters.status)})`
  if (hasItems(filters.priority)) text += ` AND priority = ANY(${params.add(filters.priority)})`
  if (filters.projectId) text += ` AND project_id = ${params.add(filters.projectId)}`
  if (hasItems(filters.projectIds)) text += ` AND project_id = ANY(${params.add(filters.projectIds)})`
  if (filters.subprojectId) text += ` AND subproject_id = ${params.add(filters.subprojectId)}`

  // Completed/cancelled items at the bottom
  text += ` ORDER BY
          CASE
            WHEN status IN ('Done', 'Completed', 'Cancelled', 'Cancel') THEN 1
            ELSE 0
          END,
          updated_at DESC, task_id DESC`
  text += paginationClause(filters, params)

  return { text, values: params.values }
}

export function buildBugListQuery(actor: ScopeActor, filters: BugListFilters): SqlQuery {
  const params = createParams()
  let text = 'SELECT * FROM bugs WHERE deleted_at IS NULL'
  text += companyClause(workItemListScope(actor), params)

  if (hasItems(filters.assignedTo)) text += ` AND assigned_to = ANY(${params.add(filters.assignedTo)})`
  if (hasItems(filters.reportedBy)) text += ` AND reported_by = ANY(${params.add(filters.reportedBy)})`
  if (hasItems(filters.status)) text += ` AND status = ANY(${params.add(filters.status)})`
  if (hasItems(filters.severity)) text += ` AND severity = ANY(${params.add(filters.severity)})`
  if (hasItems(filters.category)) text += ` AND category = ANY(${params.add(filters.category)})`
  if (hasItems(filters.type)) text += ` AND type = ANY(${params.add(filters.type)})`
  if (filters.projectId) text += ` AND project_id = ${params.add(filters.projectId)}`
  if (hasItems(filters.projectIds)) text += ` AND project_id = ANY(${params.add(filters.projectIds)})`
  if (filters.subprojectId) text += ` AND subproject_id = ${params.add(filters.subprojectId)}`

  // Resolved/closed items at the bottom
  text += ` ORDER BY
          CASE
            WHEN status IN ('Resolved', 'Closed') THEN 1
            ELSE 0
          END,
          updated_at DESC`
  text += paginationClause(filters, params)

  return { text, values: params.values }
}

/** `User.tasks`: tasks the user is assigned to or supporting. */
export function buildUserTasksQuery(actor: ScopeActor, employeeId: string): SqlQuery {
  const params = createParams()
  const employee = params.add(employeeId)
  // assigned_to and support are JSONB arrays
  let text = `SELECT * FROM tasks
         WHERE deleted_at IS NULL
         AND (EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(assigned_to) AS elem
           WHERE elem = ${employee}
         ) OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(
             CASE WHEN support IS NULL OR support::text = 'null' OR support::text = '' THEN '[]'::jsonb ELSE support::jsonb END
           ) AS elem
           WHERE elem = ${employee}
         ))`
  text += companyClause(workItemListScope(actor), params)
  return { text, values: params.values }
}

/** `User.bugs`: bugs assigned to the user. */
export function buildUserBugsQuery(actor: ScopeActor, employeeId: string): SqlQuery {
  const params = createParams()
  let text = `SELECT * FROM bugs WHERE assigned_to = ${params.add(employeeId)} AND deleted_at IS NULL`
  text += companyClause(workItemListScope(actor), params)
  return { text, values: params.values }
}

/** `Project.tasks`. */
export function buildProjectTasksQuery(actor: ScopeActor, projectId: string): SqlQuery {
  const params = createParams()
  let text = `SELECT * FROM tasks WHERE project_id = ${params.add(projectId)} AND deleted_at IS NULL`
  text += companyClause(workItemListScope(actor), params)
  return { text, values: params.values }
}

async function run(built: SqlQuery, deps: ListScopeDeps): Promise<Row[]> {
  return deps.query(built.text, built.values)
}

export function listTasks(actor: ScopeActor, filters: TaskListFilters, deps: ListScopeDeps): Promise<Row[]> {
  return run(buildTaskListQuery(actor, filters), deps)
}

export function listBugs(actor: ScopeActor, filters: BugListFilters, deps: ListScopeDeps): Promise<Row[]> {
  return run(buildBugListQuery(actor, filters), deps)
}

export function listTasksOfUser(actor: ScopeActor, employeeId: string, deps: ListScopeDeps): Promise<Row[]> {
  return run(buildUserTasksQuery(actor, employeeId), deps)
}

export function listBugsOfUser(actor: ScopeActor, employeeId: string, deps: ListScopeDeps): Promise<Row[]> {
  return run(buildUserBugsQuery(actor, employeeId), deps)
}

export function listTasksOfProject(actor: ScopeActor, projectId: string, deps: ListScopeDeps): Promise<Row[]> {
  return run(buildProjectTasksQuery(actor, projectId), deps)
}

/**
 * `projects`. Filtered after the read, the way /api/projects does it. That route
 * also limits every role to assigned projects; the GraphQL query has deliberately
 * not done so (see resolvers.ts), and this module only adds the tenant boundary.
 */
export async function listProjects(actor: ScopeActor, deps: ListScopeDeps): Promise<Row[]> {
  const rows = await deps.query('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY project_name ASC', [])
  const scope = projectListScope(actor)
  return rows.filter((row) => isInCompanyScope(scope, typeof row.company_id === 'string' ? row.company_id : null))
}
