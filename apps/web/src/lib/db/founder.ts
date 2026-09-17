// Founder Start repository — reads, shared mappers and the transaction helper.
// Writes live in ./founder-writes; rules in lib/founder/compute-start.
import type { PoolClient } from 'pg'
import { getPool } from './config'
import type { StartThread } from '@/lib/founder/compute-start'

export type CheckinKind = 'closeout' | 'activity' | 'rank' | 'start'
export type CheckinSource = 'claude' | 'hook' | 'app' | 'manual'

export interface ResumePoint extends StartThread {
  createdAt: Date
  updatedAt: Date
}

export interface FounderCheckin {
  id: string
  checkinDate: string
  resumePointId: number | null
  kind: CheckinKind
  note: string | null
  nextAction: string | null
  source: CheckinSource
  createdAt: Date
}

export class FounderInputError extends Error {}

export const RESUME_POINT_SELECT = `
  SELECT rp.id, rp.label, rp.project_id, p.project_name, rp.next_action, rp.next_action_set_at,
         rp.rank, rp.waiting_on, rp.last_touched_at, rp.last_touched_source, rp.is_active,
         rp.created_at, rp.updated_at
    FROM founder_resume_points rp
    LEFT JOIN projects p ON p.project_id = rp.project_id`

const CHECKIN_SELECT = `
  SELECT id::text, checkin_date::text, resume_point_id, kind, note, next_action, source, created_at
    FROM founder_checkins`

export function mapResumePoint(row: any): ResumePoint {
  return {
    id: row.id,
    label: row.label,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    nextAction: row.next_action,
    nextActionSetAt: row.next_action_set_at,
    rank: row.rank,
    waitingOn: row.waiting_on,
    lastTouchedAt: row.last_touched_at,
    lastTouchedSource: row.last_touched_source,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCheckin(row: any): FounderCheckin {
  return {
    id: row.id,
    checkinDate: row.checkin_date,
    resumePointId: row.resume_point_id,
    kind: row.kind,
    note: row.note,
    nextAction: row.next_action,
    source: row.source,
    createdAt: row.created_at,
  }
}

export const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

// Unique-index violations carry the index name; turn them into readable errors.
export function rethrowConstraint(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string }
  if (pgError?.code === '23505' && pgError.constraint === 'uq_founder_resume_points_label') {
    throw new FounderInputError('A thread with this label already exists.')
  }
  if (pgError?.code === '23505' && pgError.constraint === 'uq_founder_resume_points_project') {
    throw new FounderInputError('That project is already linked to another thread.')
  }
  throw error
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('[founder] rollback failed:', rollbackError)
    })
    throw error
  } finally {
    client.release()
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listResumePoints(includeParked: boolean): Promise<ResumePoint[]> {
  const result = await getPool().query(
    `${RESUME_POINT_SELECT}
      WHERE ($1::boolean OR rp.is_active)
      ORDER BY rp.is_active DESC, rp.rank ASC NULLS LAST, lower(rp.label)`,
    [includeParked]
  )
  return result.rows.map(mapResumePoint)
}

export async function getResumePoint(id: number, client?: PoolClient): Promise<ResumePoint | null> {
  const result = await (client ?? getPool()).query(`${RESUME_POINT_SELECT} WHERE rp.id = $1`, [id])
  return result.rows[0] ? mapResumePoint(result.rows[0]) : null
}

export async function getResumePointsByIds(ids: number[], client?: PoolClient): Promise<ResumePoint[]> {
  if (ids.length === 0) return []
  const result = await (client ?? getPool()).query(`${RESUME_POINT_SELECT} WHERE rp.id = ANY($1::int[])`, [ids])
  const byId = new Map<number, ResumePoint>(result.rows.map((row: any) => [row.id, mapResumePoint(row)]))
  return ids.map((id) => byId.get(id)).filter((point): point is ResumePoint => point !== undefined)
}

export async function listCheckins(resumePointId: number | null, limit: number): Promise<FounderCheckin[]> {
  const result = await getPool().query(
    `${CHECKIN_SELECT}
      WHERE ($1::int IS NULL OR resume_point_id = $1)
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [resumePointId, limit]
  )
  return result.rows.map(mapCheckin)
}

/** Latest `limit` check-ins per thread, in one query. */
export async function recentCheckinsFor(ids: number[], limit: number): Promise<FounderCheckin[]> {
  if (ids.length === 0) return []
  const result = await getPool().query(
    `SELECT * FROM (
       SELECT id::text, checkin_date::text, resume_point_id, kind, note, next_action, source, created_at,
              row_number() OVER (PARTITION BY resume_point_id ORDER BY created_at DESC, id DESC) AS position
         FROM founder_checkins
        WHERE resume_point_id = ANY($1::int[])
     ) ranked
     WHERE position <= $2
     ORDER BY resume_point_id, created_at DESC`,
    [ids, limit]
  )
  return result.rows.map(mapCheckin)
}

export async function lastCloseoutDate(): Promise<string | null> {
  const result = await getPool().query(
    `SELECT max(checkin_date)::text AS last_date FROM founder_checkins WHERE kind = 'closeout'`
  )
  return result.rows[0]?.last_date ?? null
}

/** Today's latest Start brief written by Claude (its note has calendar/inbox lines the app lacks). */
export async function latestClaudeStart(todayIst: string): Promise<FounderCheckin | null> {
  const result = await getPool().query(
    `${CHECKIN_SELECT}
      WHERE kind = 'start' AND source = 'claude' AND checkin_date = $1::date
      ORDER BY created_at DESC
      LIMIT 1`,
    [todayIst]
  )
  return result.rows[0] ? mapCheckin(result.rows[0]) : null
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function insertCheckin(
  client: PoolClient,
  checkin: { resumePointId: number | null; kind: CheckinKind; note: string | null; nextAction: string | null; source: CheckinSource }
): Promise<void> {
  await client.query(
    `INSERT INTO founder_checkins (resume_point_id, kind, note, next_action, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [checkin.resumePointId, checkin.kind, checkin.note, checkin.nextAction, checkin.source]
  )
}
