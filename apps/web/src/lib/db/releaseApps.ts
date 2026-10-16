// Releases tab — apps and their store version history (migration 066)
// Server-side only - do not use 'use client'

import { query, queryOne, execute, withRetry } from './config'
import type { ReleasePlatform, ReleaseVersionSource } from '@/lib/releases/types'

export type { ReleasePlatform, ReleaseVersionSource }

export interface ReleaseApp {
  appId: number
  companyId: string
  name: string
  iconUrl: string | null
  iosUrl: string | null
  iosAppId: string | null
  iosCountry: string | null
  iosSyncError: string | null
  androidUrl: string | null
  androidPackage: string | null
  androidSyncError: string | null
  lastSyncedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ReleaseAppVersion {
  id: number
  appId: number
  platform: ReleasePlatform
  version: string
  releasedAt: string | null
  releaseNotes: string | null
  source: ReleaseVersionSource
  firstSeenAt: string
  createdBy: string | null
}

export interface NewStoreVersion {
  version: string
  releasedAt: string | null
  notes: string | null
}

interface ReleaseAppRow {
  app_id: number
  company_id: string
  name: string
  icon_url: string | null
  ios_url: string | null
  ios_app_id: string | null
  ios_country: string | null
  ios_sync_error: string | null
  android_url: string | null
  android_package: string | null
  android_sync_error: string | null
  last_synced_at: Date | null
  created_by: string | null
  created_at: Date
  updated_at: Date
}

interface ReleaseAppVersionRow {
  id: number
  app_id: number
  platform: ReleasePlatform
  version: string
  released_at: Date | null
  release_notes: string | null
  source: ReleaseVersionSource
  first_seen_at: Date
  created_by: string | null
}

function iso(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function rowToApp(row: ReleaseAppRow): ReleaseApp {
  return {
    appId: row.app_id,
    companyId: row.company_id,
    name: row.name,
    iconUrl: row.icon_url,
    iosUrl: row.ios_url,
    iosAppId: row.ios_app_id,
    iosCountry: row.ios_country,
    iosSyncError: row.ios_sync_error,
    androidUrl: row.android_url,
    androidPackage: row.android_package,
    androidSyncError: row.android_sync_error,
    lastSyncedAt: iso(row.last_synced_at),
    createdBy: row.created_by,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

function rowToVersion(row: ReleaseAppVersionRow): ReleaseAppVersion {
  return {
    id: row.id,
    appId: row.app_id,
    platform: row.platform,
    version: row.version,
    releasedAt: iso(row.released_at),
    releaseNotes: row.release_notes,
    source: row.source,
    firstSeenAt: iso(row.first_seen_at)!,
    createdBy: row.created_by,
  }
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

export async function listReleaseApps(companyId: string): Promise<ReleaseApp[]> {
  return withRetry(async () => {
    const rows = await query<ReleaseAppRow[]>(
      `SELECT * FROM release_apps
        WHERE company_id = $1 AND deleted_at IS NULL
        ORDER BY name ASC, app_id ASC`,
      [companyId]
    )
    return rows.map(rowToApp)
  })
}

/** Every live app across companies — the cron sync walks this. */
export async function listAllReleaseApps(): Promise<ReleaseApp[]> {
  return withRetry(async () => {
    const rows = await query<ReleaseAppRow[]>(
      `SELECT * FROM release_apps WHERE deleted_at IS NULL ORDER BY app_id ASC`
    )
    return rows.map(rowToApp)
  })
}

export async function getReleaseApp(appId: number): Promise<ReleaseApp | null> {
  return withRetry(async () => {
    const row = await queryOne<ReleaseAppRow>(
      `SELECT * FROM release_apps WHERE app_id = $1 AND deleted_at IS NULL`,
      [appId]
    )
    return row ? rowToApp(row) : null
  })
}

export interface ReleaseAppInput {
  name: string
  iosUrl: string | null
  iosAppId: string | null
  iosCountry: string | null
  androidUrl: string | null
  androidPackage: string | null
}

export async function createReleaseApp(
  companyId: string,
  input: ReleaseAppInput,
  createdBy: string
): Promise<ReleaseApp> {
  const row = await queryOne<ReleaseAppRow>(
    `INSERT INTO release_apps
       (company_id, name, ios_url, ios_app_id, ios_country, android_url, android_package, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      companyId,
      input.name,
      input.iosUrl,
      input.iosAppId,
      input.iosCountry,
      input.androidUrl,
      input.androidPackage,
      createdBy,
    ]
  )
  return rowToApp(row!)
}

/**
 * Replace the editable fields. When a store link changes or is removed, that
 * platform's sync error is cleared with it — it described the old listing.
 */
export async function updateReleaseApp(appId: number, input: ReleaseAppInput): Promise<ReleaseApp | null> {
  const row = await queryOne<ReleaseAppRow>(
    `UPDATE release_apps
        SET name = $2,
            ios_url = $3,
            ios_sync_error = CASE WHEN ios_app_id IS DISTINCT FROM $4 THEN NULL ELSE ios_sync_error END,
            ios_app_id = $4,
            ios_country = $5,
            android_url = $6,
            android_sync_error = CASE WHEN android_package IS DISTINCT FROM $7 THEN NULL ELSE android_sync_error END,
            android_package = $7,
            updated_at = NOW()
      WHERE app_id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [
      appId,
      input.name,
      input.iosUrl,
      input.iosAppId,
      input.iosCountry,
      input.androidUrl,
      input.androidPackage,
    ]
  )
  return row ? rowToApp(row) : null
}

export async function softDeleteReleaseApp(appId: number): Promise<boolean> {
  const affected = await execute(
    `UPDATE release_apps SET deleted_at = NOW(), updated_at = NOW()
      WHERE app_id = $1 AND deleted_at IS NULL`,
    [appId]
  )
  return affected > 0
}

export interface SyncOutcome {
  iosError: string | null
  androidError: string | null
  /** Filled from the store listing only while the app still has no icon. */
  iconUrl: string | null
}

export async function recordReleaseAppSync(appId: number, outcome: SyncOutcome): Promise<void> {
  await execute(
    `UPDATE release_apps
        SET ios_sync_error = $2,
            android_sync_error = $3,
            icon_url = COALESCE(icon_url, $4),
            last_synced_at = NOW()
      WHERE app_id = $1`,
    [appId, outcome.iosError, outcome.androidError, outcome.iconUrl]
  )
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listReleaseAppVersions(appIds: number[]): Promise<ReleaseAppVersion[]> {
  if (appIds.length === 0) return []
  return withRetry(async () => {
    const rows = await query<ReleaseAppVersionRow[]>(
      `SELECT * FROM release_app_versions WHERE app_id = ANY($1::int[])`,
      [appIds]
    )
    return rows.map(rowToVersion)
  })
}

/**
 * Record what a store reported. A version already on file keeps its
 * first_seen_at; the store's date and notes win over a manual entry's, because
 * the store is the record of what actually shipped.
 */
export async function upsertStoreVersions(
  appId: number,
  platform: ReleasePlatform,
  source: Exclude<ReleaseVersionSource, 'manual'>,
  versions: NewStoreVersion[]
): Promise<void> {
  if (versions.length === 0) return

  const values: unknown[] = []
  const tuples = versions.map((entry) => {
    values.push(appId, platform, entry.version, entry.releasedAt, entry.notes, source)
    const base = values.length - 6
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
  })

  await execute(
    `INSERT INTO release_app_versions (app_id, platform, version, released_at, release_notes, source)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (app_id, platform, version) DO UPDATE
        SET released_at   = COALESCE(EXCLUDED.released_at, release_app_versions.released_at),
            release_notes = COALESCE(EXCLUDED.release_notes, release_app_versions.release_notes),
            source        = EXCLUDED.source`,
    values
  )
}

/** Returns null when that version is already recorded for the platform. */
export async function addManualVersion(
  appId: number,
  platform: ReleasePlatform,
  entry: NewStoreVersion,
  createdBy: string
): Promise<ReleaseAppVersion | null> {
  const row = await queryOne<ReleaseAppVersionRow>(
    `INSERT INTO release_app_versions
       (app_id, platform, version, released_at, release_notes, source, created_by)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6)
     ON CONFLICT (app_id, platform, version) DO NOTHING
     RETURNING *`,
    [appId, platform, entry.version, entry.releasedAt, entry.notes, createdBy]
  )
  return row ? rowToVersion(row) : null
}

/** Only hand-entered rows can be removed; store rows would come straight back on the next sync. */
export async function deleteManualVersion(appId: number, versionId: number): Promise<boolean> {
  const affected = await execute(
    `DELETE FROM release_app_versions WHERE id = $1 AND app_id = $2 AND source = 'manual'`,
    [versionId, appId]
  )
  return affected > 0
}
