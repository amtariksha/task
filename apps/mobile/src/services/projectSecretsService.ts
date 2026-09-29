/**
 * Project secrets on mobile — read only.
 *
 * The web app has had a credentials vault since migration 058; mobile had nothing,
 * so anyone away from a desk could not reach a connection string or an API key.
 *
 * Read-only by design: this app lists names and reveals ONE value at a time behind
 * a fresh biometric prompt. Creating, editing, deleting and bulk-exporting stay on
 * the web, where the server also requires project manager / team leader / company
 * admin authority (lib/projectSecrets/secret-access.ts).
 *
 * Nothing here caches a decrypted value. Every reveal is a fresh request, so it is
 * audited every time and no plaintext outlives the screen.
 */

import { apiRequest, type ApiResponse } from './apiClient'

export type SecretEnvironment = 'development' | 'staging' | 'production'

export const SECRET_ENVIRONMENTS: SecretEnvironment[] = ['development', 'staging', 'production']

export interface CredentialSummary {
  id: number
  name: string
  type: string
  metadata?: Record<string, unknown>
  updatedAt?: string
}

export interface EnvSecretName {
  id: number
  key: string
  environment: SecretEnvironment
  updatedAt: string
}

export interface ProjectSecretsOverview {
  credentials: CredentialSummary[]
  envSecrets: EnvSecretName[]
  /** Whether this user may change these on the web. Used only to word the UI. */
  canWrite: boolean
}

/** Marks a request as coming from the app, which the audit log records. */
const MOBILE_HEADERS = { 'X-Client': 'mobile' }

/**
 * Names only — never values. `?reveal=true` is deliberately not sent: it decrypts
 * the whole environment, which is exactly what a list screen must not do.
 */
export async function getProjectSecrets(projectId: string): Promise<ApiResponse<ProjectSecretsOverview>> {
  const [creds, env] = await Promise.all([
    apiRequest<CredentialSummary[]>(`/api/projects/${projectId}/credentials`, { headers: MOBILE_HEADERS }),
    apiRequest<EnvSecretName[]>(`/api/projects/${projectId}/env?environment=production`, { headers: MOBILE_HEADERS }),
  ])

  if (!creds.success) return { success: false, error: creds.error || 'Could not load this project’s secrets' }

  return {
    success: true,
    data: {
      credentials: Array.isArray(creds.data) ? creds.data : [],
      envSecrets: env.success && Array.isArray(env.data) ? env.data : [],
      canWrite: Boolean((creds as { canWrite?: boolean }).canWrite),
    },
  }
}

/** Env keys for one environment. Names only. */
export async function getEnvKeys(
  projectId: string,
  environment: SecretEnvironment
): Promise<ApiResponse<EnvSecretName[]>> {
  return apiRequest<EnvSecretName[]>(
    `/api/projects/${projectId}/env?environment=${environment}`,
    { headers: MOBILE_HEADERS }
  )
}

/**
 * Reveal ONE credential's value. Audited server-side, and rate limited per person,
 * so a stolen session cannot walk every secret in a project.
 */
export async function revealCredential(
  projectId: string,
  credentialId: number
): Promise<ApiResponse<{ name: string; value: string; type: string }>> {
  return apiRequest(`/api/projects/${projectId}/credentials/${credentialId}`, { headers: MOBILE_HEADERS })
}

/** Reveal ONE environment variable's value. */
export async function revealEnvValue(
  projectId: string,
  environment: SecretEnvironment,
  key: string
): Promise<ApiResponse<{ key: string; value: string; environment: SecretEnvironment }>> {
  return apiRequest(
    `/api/projects/${projectId}/env/${encodeURIComponent(key)}?environment=${environment}`,
    { headers: MOBILE_HEADERS }
  )
}
