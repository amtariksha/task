// Cross-company inputs for the founder Start screen (waiting items, team
// activity), the `settings.founder_start` row, and the founder roster.
// tasks/bugs/activity_log timestamps are UTC-naive, so windows are computed
// against `now() AT TIME ZONE 'UTC'`.
import { getPool } from './config'
import type { StartTeamActivity } from '@/lib/founder/compute-start'
import type { StartWaitingItem } from '@/lib/founder/start-format'

// Union of every "closed" set the codebase uses, plus the live data's values.
const TASK_TERMINAL_STATUSES = ['Done', 'Completed', 'Cancelled', 'Cancel', 'Stop', 'Closed']
const BUG_TERMINAL_STATUSES = ['Resolved', 'Closed']
const WAITING_LIMIT = 5
const ACTIVITY_TITLE_LIMIT = 3

export interface StartSettings {
  enabled: boolean
  hour: number
  minute: number
  tz: string
  pausedUntil: string | null
  lastSentDate: string | null
}

export const DEFAULT_START_SETTINGS: StartSettings = Object.freeze({
  enabled: true,
  hour: 9,
  minute: 0,
  tz: 'Asia/Kolkata',
  pausedUntil: null,
  lastSentDate: null,
})

const SETTINGS_KEY = 'founder_start'

/** Open tasks due within two days and open bugs assigned to the founder. */
export async function loadWaitingOnMe(employeeId: string, dueBy: string): Promise<StartWaitingItem[]> {
  const result = await getPool().query(
    `SELECT * FROM (
       SELECT 'task' AS kind, t.task_id AS id, t.name AS title, t.end_date::text AS due_date,
              p.project_name, t.status
         FROM tasks t
         LEFT JOIN projects p ON p.project_id = COALESCE(t.subproject_id, t.project_id)
        WHERE t.deleted_at IS NULL
          AND NOT (t.status = ANY($2::text[]))
          AND t.end_date IS NOT NULL AND t.end_date <= $3::date
          AND (
            t.assigned_to::jsonb ? $1 OR
            (CASE WHEN t.support IS NULL OR t.support::text = 'null' OR t.support::text = ''
                  THEN '[]'::jsonb ELSE t.support::jsonb END) ? $1
          )
       UNION ALL
       SELECT 'bug', b.bug_id, b.title, b.end_date::text, p.project_name, b.status
         FROM bugs b
         LEFT JOIN projects p ON p.project_id = COALESCE(b.subproject_id, b.project_id)
        WHERE b.deleted_at IS NULL
          AND NOT (b.status = ANY($4::text[]))
          AND b.assigned_to = $1
     ) waiting
     ORDER BY due_date ASC NULLS LAST, id
     LIMIT $5`,
    [employeeId, TASK_TERMINAL_STATUSES, dueBy, BUG_TERMINAL_STATUSES, WAITING_LIMIT]
  )
  return result.rows.map((row: any) => ({
    kind: row.kind,
    id: row.id,
    title: row.title ?? '',
    dueDate: row.due_date,
    projectName: row.project_name,
    status: row.status,
  }))
}

/**
 * Last-24h team activity per active thread with a project: task/bug rows
 * updated in the project tree (all descendants) plus their activity_log rows.
 */
export async function loadTeamActivity(): Promise<StartTeamActivity[]> {
  const result = await getPool().query(
    `WITH RECURSIVE tree AS (
       SELECT rp.id AS resume_point_id, rp.project_id
         FROM founder_resume_points rp
        WHERE rp.is_active AND rp.project_id IS NOT NULL
       UNION
       SELECT tree.resume_point_id, child.project_id
         FROM projects child
         JOIN tree ON child.parent_project_id = tree.project_id
        WHERE child.deleted_at IS NULL
     ),
     entities AS (
       SELECT DISTINCT tree.resume_point_id, 'task'::text AS entity_type, t.task_id AS entity_id,
              t.name AS title, t.updated_at
         FROM tasks t
         JOIN tree ON tree.project_id IN (t.project_id, t.subproject_id)
        WHERE t.deleted_at IS NULL
       UNION
       SELECT DISTINCT tree.resume_point_id, 'bug', b.bug_id, b.title, b.updated_at
         FROM bugs b
         JOIN tree ON tree.project_id IN (b.project_id, b.subproject_id)
        WHERE b.deleted_at IS NULL
     ),
     events AS (
       SELECT resume_point_id, entity_type, entity_id, title, updated_at AS happened_at
         FROM entities
        WHERE updated_at >= (now() AT TIME ZONE 'UTC') - interval '24 hours'
       UNION ALL
       SELECT e.resume_point_id, e.entity_type, e.entity_id, e.title, al.created_at
         FROM entities e
         JOIN activity_log al ON al.entity_type = e.entity_type AND al.entity_id = e.entity_id
        WHERE al.created_at >= (now() AT TIME ZONE 'UTC') - interval '24 hours'
     ),
     per_entity AS (
       SELECT resume_point_id, title, max(happened_at) AS last_at
         FROM events
        GROUP BY resume_point_id, entity_type, entity_id, title
     )
     SELECT totals.resume_point_id, totals.event_count, totals.latest_at,
            ARRAY(
              SELECT pe.title FROM per_entity pe
               WHERE pe.resume_point_id = totals.resume_point_id AND pe.title IS NOT NULL
               ORDER BY pe.last_at DESC
               LIMIT $1
            ) AS titles
       FROM (
         SELECT resume_point_id, count(*)::int AS event_count, max(happened_at) AS latest_at
           FROM events
          GROUP BY resume_point_id
       ) totals`,
    [ACTIVITY_TITLE_LIMIT]
  )
  return result.rows.map((row: any) => ({
    resumePointId: row.resume_point_id,
    count: row.event_count,
    titles: row.titles ?? [],
    latestAt: row.latest_at,
  }))
}

/** Active users who are founders: platform admins plus the env allow-list. */
export async function listFounderIds(allowList: string[]): Promise<string[]> {
  const result = await getPool().query(
    `SELECT employee_id FROM users
      WHERE status = 'active' AND (is_platform_admin = true OR employee_id = ANY($1::text[]))
      ORDER BY employee_id`,
    [allowList]
  )
  return result.rows.map((row: any) => row.employee_id)
}

function parseSettings(raw: unknown): StartSettings {
  const value = typeof raw === 'string' ? safeJson(raw) : raw
  const stored = value && typeof value === 'object' ? (value as Partial<StartSettings>) : {}
  return { ...DEFAULT_START_SETTINGS, ...stored }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    console.error('[founder] settings.founder_start is not valid JSON:', error)
    return null
  }
}

export async function getStartSettings(): Promise<StartSettings> {
  const result = await getPool().query(
    `SELECT value FROM settings WHERE key = $1 AND company_id IS NULL`,
    [SETTINGS_KEY]
  )
  return parseSettings(result.rows[0]?.value)
}

/**
 * Create the platform-level row if missing, then shallow-merge `patch` into it
 * in SQL (so a concurrent lastSentDate claim is never overwritten).
 */
export async function upsertStartSettings(patch: Partial<StartSettings>, createdBy: string): Promise<StartSettings> {
  const initial = { ...DEFAULT_START_SETTINGS, ...patch }
  const result = await getPool().query(
    `INSERT INTO settings (key, value, description, is_active, created_by, company_id)
     VALUES ($1, $2::jsonb, 'Founder Start push schedule (09:00 IST)', true, $3, NULL)
     ON CONFLICT (key) WHERE company_id IS NULL
     DO UPDATE SET value = settings.value || $4::jsonb, updated_at = CURRENT_TIMESTAMP
     RETURNING value`,
    [SETTINGS_KEY, JSON.stringify(initial), createdBy, JSON.stringify(patch)]
  )
  return parseSettings(result.rows[0]?.value)
}

/**
 * Atomically claim today's send. Returns false if another run already sent
 * today (Vercel may retry a cron invocation).
 */
export async function claimSendDate(todayIst: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE settings
        SET value = jsonb_set(value, '{lastSentDate}', to_jsonb($2::text)), updated_at = CURRENT_TIMESTAMP
      WHERE key = $1 AND company_id IS NULL
        AND (value->>'lastSentDate') IS DISTINCT FROM $2::text`,
    [SETTINGS_KEY, todayIst]
  )
  return (result.rowCount ?? 0) > 0
}

/** Undo a claim when the send itself failed, so a retry can go out. */
export async function releaseSendDate(todayIst: string, previous: string | null): Promise<void> {
  await getPool().query(
    // COALESCE: jsonb_set with a SQL NULL would null the whole value.
    `UPDATE settings SET value = jsonb_set(value, '{lastSentDate}', COALESCE(to_jsonb($3::text), 'null'::jsonb))
      WHERE key = $1 AND company_id IS NULL AND value->>'lastSentDate' = $2::text`,
    [SETTINGS_KEY, todayIst, previous]
  )
}
