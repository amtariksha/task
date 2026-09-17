// Founder Start repository — writes: thread CRUD, close-out, ranking, hook
// ingestion and the Karmayog-derived touch. Reads live in ./founder.
import type { PoolClient } from 'pg'
import { getPool } from './config'
import {
  FounderInputError,
  RESUME_POINT_SELECT,
  blankToNull,
  getResumePoint,
  getResumePointsByIds,
  insertCheckin,
  mapResumePoint,
  rethrowConstraint,
  withTransaction,
  type ResumePoint,
} from './founder'

export interface ResumePointPatch {
  label?: string
  projectId?: string | null
  nextAction?: string | null
  waitingOn?: string | null
  isActive?: boolean
}

export interface CloseoutEntry {
  resumePointId?: number | null
  label?: string | null
  note?: string | null
  nextAction?: string | null
  waitingOn?: string | null
  hasWaitingOn: boolean
}

export interface ActivityEntry {
  label: string | null
  projectId: string | null
  summary: string
  occurredAt: Date
}

const INGEST_DEDUPE_MINUTES = 20

async function assertProjectExists(client: PoolClient, projectId: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM projects WHERE project_id = $1 AND deleted_at IS NULL`,
    [projectId]
  )
  if (result.rowCount === 0) throw new FounderInputError('Project not found.')
}

export async function createResumePoint(label: string, projectId: string | null): Promise<ResumePoint> {
  return withTransaction(async (client) => {
    if (projectId) await assertProjectExists(client, projectId)
    try {
      const inserted = await client.query(
        `INSERT INTO founder_resume_points (label, project_id) VALUES ($1, $2) RETURNING id`,
        [label, projectId]
      )
      return (await getResumePoint(inserted.rows[0].id, client)) as ResumePoint
    } catch (error) {
      return rethrowConstraint(error)
    }
  })
}

export async function updateResumePoint(id: number, patch: ResumePointPatch): Promise<ResumePoint | null> {
  return withTransaction(async (client) => {
    if (patch.projectId) await assertProjectExists(client, patch.projectId)
    const assignments: string[] = []
    const values: unknown[] = []
    const set = (column: string, value: unknown) => {
      values.push(value)
      assignments.push(`${column} = $${values.length}`)
    }
    if (patch.label !== undefined) set('label', patch.label)
    if (patch.projectId !== undefined) set('project_id', patch.projectId)
    if (patch.waitingOn !== undefined) set('waiting_on', blankToNull(patch.waitingOn))
    if (patch.isActive !== undefined) set('is_active', patch.isActive)
    // Ranks are relative to the other active threads; a parked thread keeps
    // its other data but comes back unranked (avoids duplicate ranks).
    if (patch.isActive === false) assignments.push('rank = NULL')
    if (patch.nextAction !== undefined) {
      set('next_action', blankToNull(patch.nextAction))
      assignments.push(`next_action_set_at = now()`, `last_touched_at = now()`, `last_touched_source = 'manual'`)
    }
    if (assignments.length > 0) {
      values.push(id)
      try {
        await client.query(
          `UPDATE founder_resume_points SET ${assignments.join(', ')} WHERE id = $${values.length}`,
          values
        )
      } catch (error) {
        rethrowConstraint(error)
      }
    }
    return getResumePoint(id, client)
  })
}

/**
 * Resolve a thread by case-insensitive label, creating it when absent. A new
 * thread is linked to a project only when exactly one live project carries
 * that name and no other thread already uses it.
 */
export async function findOrCreateByLabel(
  client: PoolClient,
  label: string,
  preferredProjectId: string | null = null
): Promise<number> {
  const existing = await client.query(
    `SELECT id FROM founder_resume_points WHERE lower(label) = lower($1)`,
    [label]
  )
  if (existing.rows[0]) return existing.rows[0].id

  const projectId = preferredProjectId ?? (await uniqueProjectForLabel(client, label))
  const inserted = await client.query(
    `INSERT INTO founder_resume_points (label, project_id)
     VALUES ($1, (SELECT $2::varchar WHERE NOT EXISTS (
       SELECT 1 FROM founder_resume_points WHERE project_id = $2::varchar)))
     ON CONFLICT ((lower(label))) DO UPDATE SET label = founder_resume_points.label
     RETURNING id`,
    [label, projectId]
  )
  return inserted.rows[0].id
}

async function uniqueProjectForLabel(client: PoolClient, label: string): Promise<string | null> {
  const matches = await client.query(
    `SELECT project_id FROM projects
      WHERE lower(project_name) = lower($1) AND deleted_at IS NULL AND COALESCE(status, '') <> 'Deleted'
      LIMIT 2`,
    [label]
  )
  return matches.rowCount === 1 ? matches.rows[0].project_id : null
}

async function applyCloseoutEntry(client: PoolClient, entry: CloseoutEntry): Promise<number> {
  const resumePointId = entry.resumePointId
    ? entry.resumePointId
    : await findOrCreateByLabel(client, (entry.label ?? '').trim())
  const nextAction = blankToNull(entry.nextAction)

  // No next action still counts as a touch: keep the old one, record the note.
  const updated = await client.query(
    `UPDATE founder_resume_points
        SET next_action = COALESCE($2, next_action),
            next_action_set_at = CASE WHEN $2::text IS NULL THEN next_action_set_at ELSE now() END,
            waiting_on = CASE WHEN $3::boolean THEN $4 ELSE waiting_on END,
            last_touched_at = now(),
            last_touched_source = 'closeout'
      WHERE id = $1
      RETURNING next_action`,
    [resumePointId, nextAction, entry.hasWaitingOn, blankToNull(entry.waitingOn)]
  )
  if (updated.rowCount === 0) throw new FounderInputError(`Thread ${resumePointId} not found.`)

  await insertCheckin(client, {
    resumePointId,
    kind: 'closeout',
    note: blankToNull(entry.note),
    nextAction: updated.rows[0].next_action,
    source: 'app',
  })
  return resumePointId
}

export async function applyCloseout(entries: CloseoutEntry[]): Promise<ResumePoint[]> {
  return withTransaction(async (client) => {
    const ids: number[] = []
    for (const entry of entries) {
      ids.push(await applyCloseoutEntry(client, entry))
    }
    return getResumePointsByIds(ids, client)
  })
}

/** Rank 1..n in the given order; every other active thread becomes unranked. */
export async function setRanks(orderedIds: number[]): Promise<ResumePoint[]> {
  return withTransaction(async (client) => {
    const active = await client.query(
      `SELECT id, label FROM founder_resume_points WHERE is_active AND id = ANY($1::int[])`,
      [orderedIds]
    )
    if (active.rowCount !== orderedIds.length) {
      throw new FounderInputError('Ranking includes an unknown or parked thread.')
    }
    await client.query(
      `UPDATE founder_resume_points SET rank = NULL
        WHERE is_active AND rank IS NOT NULL AND NOT (id = ANY($1::int[]))`,
      [orderedIds]
    )
    await client.query(
      `UPDATE founder_resume_points rp SET rank = ordered.position::int
         FROM unnest($1::int[]) WITH ORDINALITY AS ordered(id, position)
        WHERE rp.id = ordered.id AND rp.rank IS DISTINCT FROM ordered.position::int`,
      [orderedIds]
    )
    const labelById = new Map<number, string>(active.rows.map((row: any) => [row.id, row.label]))
    await insertCheckin(client, {
      resumePointId: null,
      kind: 'rank',
      note: orderedIds.map((id) => labelById.get(id)).join(' > ') || '(all unranked)',
      nextAction: null,
      source: 'app',
    })
    const result = await client.query(`${RESUME_POINT_SELECT} WHERE rp.is_active ORDER BY rp.rank ASC NULLS LAST, lower(rp.label)`)
    return result.rows.map(mapResumePoint)
  })
}

async function resolveIngestThread(client: PoolClient, entry: ActivityEntry): Promise<number | null> {
  if (entry.projectId) {
    const byProject = await client.query(
      `SELECT id FROM founder_resume_points WHERE project_id = $1`,
      [entry.projectId]
    )
    if (byProject.rows[0]) return byProject.rows[0].id
  }
  const projectLabel = entry.projectId
    ? (await client.query(`SELECT project_name FROM projects WHERE project_id = $1 AND deleted_at IS NULL`, [entry.projectId])).rows[0]?.project_name
    : null
  const label = entry.label ?? projectLabel ?? null
  if (!label) return null
  return findOrCreateByLabel(client, label, projectLabel ? entry.projectId : null)
}

/** Hook ingestion. Returns how many entries were applied (duplicates within 20 min are skipped). */
export async function ingestActivity(entries: ActivityEntry[]): Promise<number> {
  return withTransaction(async (client) => {
    let applied = 0
    for (const entry of entries) {
      const resumePointId = await resolveIngestThread(client, entry)
      if (resumePointId === null) continue

      const duplicate = await client.query(
        `SELECT 1 FROM founder_checkins
          WHERE resume_point_id = $1 AND source = 'hook' AND note = $2
            AND created_at > now() - make_interval(mins => $3)`,
        [resumePointId, entry.summary, INGEST_DEDUPE_MINUTES]
      )
      if ((duplicate.rowCount ?? 0) > 0) continue

      // GREATEST ignores NULL, so a never-touched thread takes the hook time.
      await client.query(
        `UPDATE founder_resume_points
            SET last_touched_source = CASE WHEN last_touched_at IS NULL OR last_touched_at <= $2
                                           THEN 'hook' ELSE last_touched_source END,
                last_touched_at = GREATEST(last_touched_at, $2)
          WHERE id = $1`,
        [resumePointId, entry.occurredAt]
      )
      await insertCheckin(client, {
        resumePointId,
        kind: 'activity',
        note: entry.summary,
        nextAction: null,
        source: 'hook',
      })
      applied += 1
    }
    return applied
  })
}

/** Karmayog-derived touch — the only write on the Start read path. Idempotent. */
export async function touchFromKarmayog(id: number, touchedAt: Date): Promise<void> {
  await getPool().query(
    `UPDATE founder_resume_points
        SET last_touched_at = $2, last_touched_source = 'karmayog'
      WHERE id = $1 AND (last_touched_at IS NULL OR last_touched_at < $2)`,
    [id, touchedAt]
  )
}
