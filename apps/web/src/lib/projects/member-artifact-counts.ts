/**
 * What a member holds in a project: the task and bug counts behind the
 * remove-member warning (GET /api/projects/[projectId]/users/[employeeId]/artifacts).
 *
 * tasks.assigned_to is a JSONB array of employee ids (migration 019);
 * bugs.assigned_to is a single id. The task count was written for a Postgres
 * array — `$2 = ANY(assigned_to)` — which Postgres rejects on JSONB, so the route
 * answered 500 for every caller and the warning never showed a number.
 *
 * Soft-deleted items are left out, as every task and bug list leaves them out: a
 * count the manager cannot reconcile with any screen is worse than none.
 *
 * Kept free of database imports: the query runner is injected so the SQL runs
 * under `node --test` (see __tests__/member-artifact-counts.test.mjs).
 * db/project-users.ts wires in the pool.
 */

export interface SqlQuery {
  text: string
  values: unknown[]
}

export interface MemberArtifactCounts {
  taskCount: number
  bugCount: number
}

/** node-postgres returns COUNT(*) (bigint) as a string. */
export interface CountRow {
  count: string | number
}

export interface MemberArtifactDeps {
  queryOne: (text: string, values: unknown[]) => Promise<CountRow | null>
}

/**
 * A subproject's items carry the main project in project_id and the subproject in
 * subproject_id (migration 028), and members are managed on both kinds of page, so
 * the id may be either. A main project still counts its subprojects' items.
 */
const IN_PROJECT = '(project_id = $1 OR subproject_id = $1)'

/** Tasks in the project that list the member among their assignees. */
export function buildMemberTaskCountQuery(projectId: string, employeeId: string): SqlQuery {
  return {
    // `?` (is this string an element of the array) can use idx_tasks_assigned_to_gin
    text: `SELECT COUNT(*) AS count FROM tasks
       WHERE ${IN_PROJECT} AND deleted_at IS NULL AND assigned_to::jsonb ? $2`,
    values: [projectId, employeeId],
  }
}

/** Bugs in the project assigned to the member. */
export function buildMemberBugCountQuery(projectId: string, employeeId: string): SqlQuery {
  return {
    text: `SELECT COUNT(*) AS count FROM bugs
       WHERE ${IN_PROJECT} AND deleted_at IS NULL AND assigned_to = $2`,
    values: [projectId, employeeId],
  }
}

function toCount(row: CountRow | null): number {
  return Number.parseInt(String(row?.count ?? '0'), 10)
}

export async function countMemberArtifacts(
  projectId: string,
  employeeId: string,
  deps: MemberArtifactDeps
): Promise<MemberArtifactCounts> {
  const tasks = buildMemberTaskCountQuery(projectId, employeeId)
  const bugs = buildMemberBugCountQuery(projectId, employeeId)

  const taskRow = await deps.queryOne(tasks.text, tasks.values)
  const bugRow = await deps.queryOne(bugs.text, bugs.values)

  return { taskCount: toCount(taskRow), bugCount: toCount(bugRow) }
}
