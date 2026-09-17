// Founder gate for the Start layer. Founder status is read from the database
// (plus an env allow-list), never from the JWT claim: GraphQL-login tokens carry
// no isPlatformAdmin claim and REST tokens can hold a stale one for 7 days.
import crypto from 'crypto'
import { isPlatformAdmin } from '@/lib/db/companies'

const DEFAULT_FOUNDER_IDS = ['AM-0001']

// Same messages as requireUser/requireRole in resolvers.ts, so clients handle
// them identically and a non-founder learns nothing about this module.
export const UNAUTHENTICATED_MESSAGE = 'UNAUTHENTICATED: You must be signed in.'
export const FORBIDDEN_MESSAGE = 'FORBIDDEN: You do not have permission to perform this action.'

export interface FounderSession {
  employeeId: string
  name: string
  role: string
}

interface ContextWithUser {
  user?: { employeeId?: string; name?: string; role?: string } | null
}

export function founderEmployeeIds(): string[] {
  const configured = (process.env.FOUNDER_EMPLOYEE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  return configured.length > 0 ? configured : DEFAULT_FOUNDER_IDS
}

export async function isFounderEmployee(employeeId: string | null | undefined): Promise<boolean> {
  if (!employeeId) return false
  if (founderEmployeeIds().includes(employeeId)) return true
  return isPlatformAdmin(employeeId)
}

export async function requireFounder(context: ContextWithUser): Promise<FounderSession> {
  const user = context?.user
  if (!user?.employeeId) {
    throw new Error(UNAUTHENTICATED_MESSAGE)
  }
  if (!(await isFounderEmployee(user.employeeId))) {
    throw new Error(FORBIDDEN_MESSAGE)
  }
  return { employeeId: user.employeeId, name: user.name ?? '', role: user.role ?? '' }
}

const digest = (value: string): Buffer => crypto.createHash('sha256').update(value).digest()

/**
 * Constant-time check of the hook ingest token against FOUNDER_INGEST_TOKEN.
 * Hashing first makes both buffers the same length, so the comparison leaks
 * neither content nor length. An unset env var rejects everything.
 */
export function verifyIngestToken(token: string | null | undefined): boolean {
  const expected = process.env.FOUNDER_INGEST_TOKEN
  if (!expected || !token) return false
  return crypto.timingSafeEqual(digest(token), digest(expected))
}
