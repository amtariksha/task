/**
 * Who may change or delete a task.
 *
 * PUT, PATCH and DELETE /api/tasks/[taskId] have enforced this rule since the
 * authz work, but the GraphQL updateTask and deleteTask mutations only checked
 * that the caller was signed in. Task ids are sequential, so any user of any
 * company could rewrite or soft-delete every task in the deployment. Both paths
 * now call canModifyTask, so the rule cannot drift between them again.
 *
 * Creating a task is not gated here: POST /api/tasks requires a session and
 * nothing more, and GraphQL createTask matches it.
 *
 * Kept free of database imports: lib/authz.canEditWorkItem and the row lookup are
 * injected so the rules run under `node --test` (see __tests__/task-access.test.mjs).
 */

export const TASK_NOT_FOUND_MESSAGE = 'NOT_FOUND: Task not found.'
export const TASK_FORBIDDEN_MESSAGE = 'FORBIDDEN: You do not have permission to modify this task.'

/**
 * Same `WHERE task_id = $1` the GraphQL UPDATE and soft-delete write through, so
 * the row that is judged is the row that changes. Soft-deleted rows are not
 * excluded, as getTaskById does not exclude them for the REST route either.
 */
export const TASK_OWNERSHIP_SQL =
  'SELECT project_id, assigned_to, assigned_by, company_id FROM tasks WHERE task_id = $1'

export interface TaskActor {
  employeeId: string
  role?: string
  /** Company this session is acting in. */
  companyId?: string | null
  isPlatformAdmin?: boolean
}

/** The parts of a task the rule reads, shaped as lib/db/tasks returns them. */
export interface TaskOwnership {
  projectId?: string | null
  /** An array for multi-assignee tasks; a bare id on legacy rows. */
  assignedTo?: string[] | string | null
  assignedBy?: string | null
  companyId?: string | null
}

/** The work item lib/authz.canEditWorkItem judges. */
export interface WorkItemRef {
  projectId: string | null
  ownerEmployeeId: string | null
  companyId: string | null
}

export interface TaskAccessDeps {
  canEditWorkItem: (actor: TaskActor, item: WorkItemRef) => Promise<boolean>
}

export type Row = Record<string, unknown>

export interface TaskLookupDeps extends TaskAccessDeps {
  query: (text: string, values: unknown[]) => Promise<Row[]>
}

/**
 * May `actor` modify this task? Stricter than reading it — project membership is
 * enough to view a task, not to change it. Delegates to canEditWorkItem, so the
 * owner, a project manager or team leader, anyone above an assignee in the
 * reporting chain, or an admin of the task's company qualifies, with the tenant
 * boundary applied first.
 */
export async function canModifyTask(
  actor: TaskActor,
  task: TaskOwnership,
  deps: TaskAccessDeps
): Promise<boolean> {
  const projectId = task.projectId ?? null
  const companyId = task.companyId ?? null
  // The assigner stands in only when there is no assignee value at all — an
  // empty multi-assignee list leaves the task without an owner.
  const owner = Array.isArray(task.assignedTo)
    ? task.assignedTo[0] ?? null
    : task.assignedTo || task.assignedBy || null

  if (await deps.canEditWorkItem(actor, { projectId, ownerEmployeeId: owner, companyId })) {
    return true
  }

  // Multi-assignee tasks: any assignee may edit, and so may their manager.
  if (Array.isArray(task.assignedTo)) {
    for (const assignee of task.assignedTo) {
      if (assignee === actor.employeeId) return true
      if (await deps.canEditWorkItem(actor, { projectId, ownerEmployeeId: assignee, companyId })) {
        return true
      }
    }
  }
  return false
}

/**
 * tasks.assigned_to as lib/db/tasks rowToTask reads it: pg hands JSONB back
 * parsed, older rows may hold JSON text, and anything unreadable has no assignee.
 */
function parseAssignedTo(stored: unknown): string[] | string {
  if (!stored) return []
  if (Array.isArray(stored)) return stored
  if (typeof stored !== 'string') return []

  const trimmed = stored.trim()
  if (trimmed === '' || trimmed === 'null') return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return Array.isArray(parsed) || typeof parsed === 'string' ? parsed : []
  } catch {
    // rowToTask logs and treats an unparseable value as unassigned; so does this.
    return []
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function taskOwnershipFromRow(row: Row): TaskOwnership {
  return {
    projectId: nonEmptyString(row.project_id),
    assignedTo: parseAssignedTo(row.assigned_to),
    assignedBy: nonEmptyString(row.assigned_by),
    companyId: nonEmptyString(row.company_id),
  }
}

/** Throw NOT_FOUND or FORBIDDEN unless `actor` may modify task `taskId`. */
export async function assertCanModifyTask(
  actor: TaskActor,
  taskId: string,
  deps: TaskLookupDeps
): Promise<void> {
  const [row] = await deps.query(TASK_OWNERSHIP_SQL, [taskId])
  if (!row) throw new Error(TASK_NOT_FOUND_MESSAGE)
  if (!(await canModifyTask(actor, taskOwnershipFromRow(row), deps))) {
    throw new Error(TASK_FORBIDDEN_MESSAGE)
  }
}
