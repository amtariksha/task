/**
 * What the project page shows when GET /api/projects/[projectId] does not
 * return a project.
 *
 * The page treated every failure but a 404 as "Failed to fetch project", so a
 * project the session may not open read like an outage. A refusal now carries
 * the server's reason (see lib/tenancy/item-access PROJECT_OTHER_COMPANY_MESSAGE).
 *
 * No imports, so it runs under `node --test` (see __tests__/load-failure.test.mjs).
 */

export type ProjectLoadFailureKind = 'forbidden' | 'not_found' | 'error'

export interface ProjectLoadFailure {
  kind: ProjectLoadFailureKind
  message: string
}

export const PROJECT_ACCESS_REFUSED_MESSAGE = 'You do not have access to this project.'

function serverReason(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const reason = (body as { error?: unknown }).error
  return typeof reason === 'string' && reason !== '' ? reason : null
}

export function describeProjectLoadFailure(status: number, body: unknown): ProjectLoadFailure {
  if (status === 403) {
    return { kind: 'forbidden', message: serverReason(body) ?? PROJECT_ACCESS_REFUSED_MESSAGE }
  }
  if (status === 404) {
    return { kind: 'not_found', message: 'Project not found' }
  }
  // Other failures can carry database or driver text; do not show it.
  return { kind: 'error', message: 'Failed to fetch project' }
}
