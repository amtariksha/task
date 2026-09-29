// Data access for the project credentials vault.
// All secret values are encrypted/decrypted here; callers never handle ciphertext.

import { query } from './config'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets'

export type CredentialType =
  | 'database' | 'ssh' | 'ssh_key' | 'firebase' | 'api_key' | 'encryption_key' | 'other'

export type SecretEnvironment = 'development' | 'staging' | 'production'
export type AccessAction = 'view' | 'reveal' | 'create' | 'update' | 'delete' | 'upload' | 'export'

export interface CredentialSummary {
  id: number
  projectId: string
  name: string
  type: CredentialType
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CredentialWithValue extends CredentialSummary {
  value: string
}

interface CredentialRow {
  id: number
  project_id: string
  name: string
  type: CredentialType
  value_encrypted: string
  metadata: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

function toSummary(row: CredentialRow): CredentialSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** List credential entries for a project (no secret values). */
export async function listCredentials(projectId: string): Promise<CredentialSummary[]> {
  const rows = await query<CredentialRow[]>(
    `SELECT * FROM project_credentials
     WHERE project_id = $1 AND deleted_at IS NULL
     ORDER BY type, name`,
    [projectId]
  )
  return rows.map(toSummary)
}

/** Fetch and decrypt a single credential's value. */
export async function getCredentialValue(
  projectId: string,
  id: number
): Promise<CredentialWithValue | null> {
  const rows = await query<CredentialRow[]>(
    `SELECT * FROM project_credentials
     WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
    [id, projectId]
  )
  const row = rows[0]
  if (!row) return null
  return { ...toSummary(row), value: decryptSecret(row.value_encrypted) }
}

export async function createCredential(
  projectId: string,
  input: { name: string; type: CredentialType; value: string; metadata?: Record<string, unknown> },
  createdBy: string
): Promise<CredentialSummary> {
  const rows = await query<CredentialRow[]>(
    `INSERT INTO project_credentials (project_id, name, type, value_encrypted, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [projectId, input.name, input.type, encryptSecret(input.value), JSON.stringify(input.metadata || {}), createdBy]
  )
  return toSummary(rows[0])
}

export async function updateCredential(
  projectId: string,
  id: number,
  patch: { name?: string; type?: CredentialType; value?: string; metadata?: Record<string, unknown> }
): Promise<CredentialSummary | null> {
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  if (patch.name !== undefined) { sets.push(`name = $${i++}`); params.push(patch.name) }
  if (patch.type !== undefined) { sets.push(`type = $${i++}`); params.push(patch.type) }
  if (patch.value !== undefined) { sets.push(`value_encrypted = $${i++}`); params.push(encryptSecret(patch.value)) }
  if (patch.metadata !== undefined) { sets.push(`metadata = $${i++}`); params.push(JSON.stringify(patch.metadata)) }

  if (sets.length === 0) {
    const existing = await getCredentialValue(projectId, id)
    return existing ? { ...existing, value: undefined as unknown as string } as CredentialSummary : null
  }

  sets.push(`updated_at = NOW()`)
  params.push(id, projectId)
  const rows = await query<CredentialRow[]>(
    `UPDATE project_credentials SET ${sets.join(', ')}
     WHERE id = $${i++} AND project_id = $${i++} AND deleted_at IS NULL
     RETURNING *`,
    params
  )
  return rows[0] ? toSummary(rows[0]) : null
}

export async function deleteCredential(projectId: string, id: number): Promise<boolean> {
  const rows = await query<CredentialRow[]>(
    `UPDATE project_credentials SET deleted_at = NOW()
     WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, projectId]
  )
  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Environment secrets
// ---------------------------------------------------------------------------

export interface EnvSecret {
  id: number
  key: string
  environment: SecretEnvironment
  value?: string
  updatedAt: string
}

interface EnvRow {
  id: number
  key: string
  environment: SecretEnvironment
  value_encrypted: string
  updated_at: string
}

/**
 * List env secrets for a project/environment. Decrypts values only when
 * `reveal` is true (e.g. authorized export); otherwise returns keys only.
 */
export async function listEnvSecrets(
  projectId: string,
  environment: SecretEnvironment,
  reveal = false
): Promise<EnvSecret[]> {
  const rows = await query<EnvRow[]>(
    `SELECT * FROM project_env_secrets
     WHERE project_id = $1 AND environment = $2
     ORDER BY key`,
    [projectId, environment]
  )
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    environment: r.environment,
    updatedAt: r.updated_at,
    value: reveal ? decryptSecret(r.value_encrypted) : undefined,
  }))
}

export async function upsertEnvSecret(
  projectId: string,
  environment: SecretEnvironment,
  key: string,
  value: string,
  createdBy: string
): Promise<void> {
  await query(
    `INSERT INTO project_env_secrets (project_id, environment, key, value_encrypted, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, environment, key)
     DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = NOW()`,
    [projectId, environment, key, encryptSecret(value), createdBy]
  )
}

export async function deleteEnvSecret(
  projectId: string,
  environment: SecretEnvironment,
  key: string
): Promise<boolean> {
  const rows = await query<Array<{ id: number }>>(
    `DELETE FROM project_env_secrets
     WHERE project_id = $1 AND environment = $2 AND key = $3
     RETURNING id`,
    [projectId, environment, key]
  )
  return rows.length > 0
}

/** Bulk upsert (used by .env upload). Returns count of keys written. */
export async function bulkUpsertEnvSecrets(
  projectId: string,
  environment: SecretEnvironment,
  entries: Record<string, string>,
  createdBy: string
): Promise<number> {
  const keys = Object.keys(entries)
  for (const key of keys) {
    await upsertEnvSecret(projectId, environment, key, entries[key], createdBy)
  }
  return keys.length
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Where a reveal came from. Recorded so devices can be told apart. */
export type AccessClient = 'web' | 'mobile' | 'api'

export interface AccessContext {
  credentialId?: number
  /** The env key revealed. Env secrets have no credentialId of their own. */
  keyName?: string
  client?: AccessClient
  ip?: string
  userAgent?: string
}

export async function logCredentialAccess(
  projectId: string,
  accessedBy: string,
  action: AccessAction,
  credentialIdOrContext?: number | AccessContext
): Promise<void> {
  // Called as (…, credentialId) from the existing routes and as (…, context) from
  // the ones that know more. Keeping both shapes avoids touching every call site
  // to add a field that is optional anyway.
  const context: AccessContext =
    typeof credentialIdOrContext === 'number'
      ? { credentialId: credentialIdOrContext }
      : credentialIdOrContext ?? {}

  try {
    await query(
      `INSERT INTO credential_access_log
         (project_id, credential_id, accessed_by, action, key_name, client, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        projectId,
        context.credentialId ?? null,
        accessedBy,
        action,
        context.keyName ?? null,
        context.client ?? null,
        context.ip ?? null,
        // Only ever used to distinguish devices; the column is 255.
        context.userAgent ? context.userAgent.slice(0, 255) : null,
      ]
    )
  } catch (error) {
    // Audit failures must not break the primary operation.
    console.error('Failed to write credential access log:', error)
  }
}

export interface AccessLogEntry {
  id: number
  projectId: string
  credentialId: number | null
  keyName: string | null
  accessedBy: string
  accessedByName?: string | null
  action: AccessAction
  client: AccessClient | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

/** Who looked at this project's secrets, newest first. */
export async function listCredentialAccessLog(
  projectId: string,
  limit = 100
): Promise<AccessLogEntry[]> {
  type LogRow = {
    id: number
    project_id: string
    credential_id: number | null
    key_name: string | null
    accessed_by: string
    accessed_by_name: string | null
    action: string
    client: string | null
    ip: string | null
    user_agent: string | null
    created_at: string
  }

  let rows: LogRow[]
  try {
    rows = await query<LogRow[]>(
      `SELECT l.id, l.project_id, l.credential_id, l.key_name, l.accessed_by,
              u.name AS accessed_by_name, l.action, l.client, l.ip, l.user_agent, l.created_at
         FROM credential_access_log l
         LEFT JOIN users u ON u.employee_id = l.accessed_by
        WHERE l.project_id = $1
        ORDER BY l.created_at DESC
        LIMIT $2`,
      [projectId, Math.min(Math.max(limit, 1), 500)]
    )
  } catch (error) {
    // 42703 = undefined_column: migration 065 has not run yet. Fall back to the
    // columns that have always existed rather than failing the page.
    if ((error as { code?: string })?.code !== '42703') throw error
    console.warn('credential_access_log detail columns are missing — run migration 065')
    const legacy = await query<Array<Omit<LogRow, 'key_name' | 'client' | 'ip' | 'user_agent'>>>(
      `SELECT l.id, l.project_id, l.credential_id, l.accessed_by,
              u.name AS accessed_by_name, l.action, l.created_at
         FROM credential_access_log l
         LEFT JOIN users u ON u.employee_id = l.accessed_by
        WHERE l.project_id = $1
        ORDER BY l.created_at DESC
        LIMIT $2`,
      [projectId, Math.min(Math.max(limit, 1), 500)]
    )
    rows = legacy.map((r) => ({ ...r, key_name: null, client: null, ip: null, user_agent: null }))
  }
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    credentialId: r.credential_id,
    keyName: r.key_name,
    accessedBy: r.accessed_by,
    accessedByName: r.accessed_by_name,
    action: r.action as AccessAction,
    client: (r.client as AccessClient) ?? null,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }))
}

/**
 * How many times this person has revealed a secret in the last `windowMinutes`.
 *
 * A reveal is the one action that puts a plaintext secret on a screen, so it is
 * worth rate limiting: without it, a stolen session can walk every key in a
 * project in seconds and the only trace is a burst of audit rows.
 */
export async function countRecentReveals(
  accessedBy: string,
  windowMinutes: number
): Promise<number> {
  const rows = await query<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM credential_access_log
      WHERE accessed_by = $1
        AND action IN ('reveal', 'export')
        AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [accessedBy, String(windowMinutes)]
  )
  return rows[0]?.n ?? 0
}

/** One env secret's decrypted value, or null when the key does not exist. */
export async function getEnvSecretValue(
  projectId: string,
  environment: SecretEnvironment,
  key: string
): Promise<{ key: string; value: string; updatedAt: string } | null> {
  const rows = await query<EnvRow[]>(
    `SELECT * FROM project_env_secrets
      WHERE project_id = $1 AND environment = $2 AND key = $3`,
    [projectId, environment, key]
  )
  const row = rows[0]
  if (!row) return null
  return { key: row.key, value: decryptSecret(row.value_encrypted), updatedAt: row.updated_at }
}
