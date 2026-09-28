import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

/**
 * API gate — CORS plus a FAIL-CLOSED authentication check.
 *
 * Authentication used to be per-route and opt-in, and roughly half of the ~100
 * API routes never called requireAuth. Unauthenticated callers could read and
 * delete tasks, bugs, projects and leave records, enumerate any manager's
 * reports, rewrite permissions, and trigger real emails to arbitrary addresses.
 * Opt-in security fails silently every time someone adds a route and forgets,
 * which is exactly what had happened.
 *
 * Everything under /api now requires a valid session unless it appears in
 * PUBLIC_API_ROUTES below. Per-route requireAuth/requireRole calls remain and
 * still do the finer-grained work (role, company and ownership checks) — this
 * is a floor, not a replacement for them.
 *
 * Runs on the Node.js runtime because jsonwebtoken needs node:crypto.
 */
export const runtime = 'nodejs'

/** Routes that must work without a session. Keep this list short and obvious. */
const PUBLIC_API_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
  '/api/health',
  // GraphQL is ONE endpoint carrying both public and private operations — the
  // mobile app signs in through the `login` mutation here (see
  // apps/mobile/src/config/graphql-queries.ts LOGIN_MUTATION). Gating the
  // transport would make mobile login impossible, so authorization for GraphQL
  // lives in the resolvers, which receive the verified user via context.
  '/api/graphql',
  // App version management endpoint for mobile app startup version checks and API key updates
  '/api/settings/app-management',
])

/**
 * Cron endpoints are invoked by the scheduler, not a user, so they carry a
 * shared secret rather than a session. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`.
 */
const CRON_PREFIX = '/api/cron/'

/**
 * Diagnostic and email-test endpoints. These send real mail and dump schema
 * details, so they are disabled outright in production rather than merely
 * requiring a session.
 */
const DEV_ONLY_ROUTES = [
  '/api/debug-email',
  '/api/test-email',
  '/api/verify-email',
  '/api/simple-test',
  '/api/test',
  '/api/diagnostic/',
  '/api/cache/test',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_API_ROUTES.has(pathname)
}

function isDevOnly(pathname: string): boolean {
  return DEV_ONLY_ROUTES.some((route) =>
    route.endsWith('/') ? pathname.startsWith(route) : pathname === route
  )
}

/** Bearer token (mobile / API clients) or the httpOnly cookie (web). */
function extractToken(request: NextRequest): string | null {
  const header = request.headers.get('Authorization')
  if (header?.startsWith('Bearer ')) return header.substring(7)
  return request.cookies.get('token')?.value ?? null
}

function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ success: false, error: message }, { status: 401 })
}

function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
  response.headers.set('Access-Control-Max-Age', '86400')
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Preflight carries no credentials — answer it before the auth check.
  if (request.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 200 }))
  }

  if (isDevOnly(pathname)) {
    if (process.env.NODE_ENV === 'production') {
      return withCors(NextResponse.json({ success: false, error: 'Not found' }, { status: 404 }))
    }
    return withCors(NextResponse.next())
  }

  if (pathname.startsWith(CRON_PREFIX)) {
    const cronSecret = process.env.CRON_SECRET
    // Without a configured secret these stay closed rather than open.
    if (!cronSecret) return withCors(unauthorized('Cron secret is not configured'))
    if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
      return withCors(unauthorized('Invalid cron credentials'))
    }
    return withCors(NextResponse.next())
  }

  if (isPublic(pathname)) {
    return withCors(NextResponse.next())
  }

  const token = extractToken(request)
  if (!token) return withCors(unauthorized())

  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 16) {
    // Never fall back to an implicit key — refuse instead.
    console.error('JWT_SECRET is not configured; rejecting API request')
    return withCors(
      NextResponse.json({ success: false, error: 'Server auth misconfigured' }, { status: 500 })
    )
  }

  try {
    jwt.verify(token, secret)
  } catch {
    return withCors(unauthorized('Session expired or invalid'))
  }

  return withCors(NextResponse.next())
}

export const config = {
  matcher: '/api/:path*',
}
