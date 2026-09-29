/**
 * Reveal ONE environment variable's value.
 *
 * The mobile vault shows key names and reveals a single value behind a biometric
 * prompt. Without this route the only way to see a value was
 * `GET /api/projects/[id]/env?reveal=true`, which decrypts the whole environment
 * — so a screen that wants one secret had to pull all of them, and the audit trail
 * could not tell the two apart.
 *
 * Reveals are rate limited per person: a stolen session should not be able to walk
 * every key in a project in seconds.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertProjectSecretAccess, NO_STORE_HEADERS } from '@/lib/projectSecrets/guard'
import {
  countRecentReveals,
  getEnvSecretValue,
  logCredentialAccess,
  type AccessClient,
  type SecretEnvironment,
} from '@/lib/db/credentials'

const ENVIRONMENTS: SecretEnvironment[] = ['development', 'staging', 'production']

function parseEnvironment(value: string | null): SecretEnvironment {
  return ENVIRONMENTS.includes(value as SecretEnvironment) ? (value as SecretEnvironment) : 'production'
}

/**
 * Deliberately generous for a person and tight for a script: a developer might
 * legitimately reveal a dozen values while wiring something up, but not 40.
 */
const REVEAL_WINDOW_MINUTES = 10
const REVEAL_LIMIT_PER_WINDOW = 40

/** What the caller says it is, narrowed to the values the audit column accepts. */
function parseClient(value: string | null): AccessClient {
  if (value === 'mobile' || value === 'web' || value === 'api') return value
  return 'api'
}

/** The caller's address as far as the proxy reports it. Best effort. */
function callerIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim().slice(0, 64)
  return request.headers.get('x-real-ip')?.slice(0, 64) ?? undefined
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; key: string }> }
) {
  const { projectId, key: rawKey } = await params
  const key = decodeURIComponent(rawKey)
  const environment = parseEnvironment(request.nextUrl.searchParams.get('environment'))

  const auth = await assertProjectSecretAccess(request, projectId, 'reveal')
  if (!auth.ok) return auth.response

  try {
    const recent = await countRecentReveals(auth.user.employeeId, REVEAL_WINDOW_MINUTES)
    if (recent >= REVEAL_LIMIT_PER_WINDOW) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many secrets revealed in the last ${REVEAL_WINDOW_MINUTES} minutes. Try again shortly.`,
        },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(REVEAL_WINDOW_MINUTES * 60) } }
      )
    }

    const secret = await getEnvSecretValue(projectId, environment, key)
    if (!secret) {
      return NextResponse.json(
        { success: false, error: 'No such key in this environment' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }

    // Logged BEFORE the response: the audit row is the point, and a reveal that
    // reached the client without one would be invisible.
    await logCredentialAccess(projectId, auth.user.employeeId, 'reveal', {
      keyName: key,
      client: parseClient(request.headers.get('X-Client')),
      ip: callerIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(
      { success: true, data: { ...secret, environment } },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error('Failed to reveal env secret:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to reveal this value' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
