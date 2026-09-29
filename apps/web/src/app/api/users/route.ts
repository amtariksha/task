import { NextRequest, NextResponse } from 'next/server'
import { getAllUsers, getAllUsersIncludingInactive, getUsersByCompany, createUser, getNextEmployeeId } from '@/lib/db/users'
import { addUserToCompany, getCompanyById } from '@/lib/db/companies'
import { canManageUsers } from '@/lib/authz'
import { withTimeout } from '@/lib/db/config'
import { requireAuth, requireRole } from '@/lib/auth-server'
import { generateSecurePassword } from '@/lib/utils/password'

export async function GET(request: NextRequest) {
  try {
    // Any authenticated user may list users (assignee dropdowns, etc.).
    // Passwords are never returned (blanked in rowToUser).
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'

    // Scope to the caller's company. This endpoint backs every assignee
    // dropdown, so returning all users leaks names and emails across tenants.
    // Platform admins, and sessions predating migration 062 (no companyId
    // claim), keep the unscoped view.
    const companyId = auth.user.companyId
    const shouldScope = Boolean(companyId) && !auth.user.isPlatformAdmin

    const users = await withTimeout(
      shouldScope
        ? getUsersByCompany(companyId as string, includeInactive)
        : includeInactive
          ? getAllUsersIncludingInactive()
          : getAllUsers(),
      10000, // 10 second timeout
      'Failed to fetch users - database timeout'
    )

    const response = NextResponse.json({
      success: true,
      data: users,
      source: 'database',
      timestamp: Date.now()
    })

    // NEVER a shared cache: this response is scoped to the caller's company, so
    // `public, s-maxage=30` let a CDN or proxy hand one tenant's names and email
    // addresses to the next caller.
    response.headers.set('Cache-Control', 'private, no-store')

    return response
  } catch (error) {
    console.error('Failed to get users from database:', error)
    const errorMessage = error instanceof Error ? error.message : 'Database unavailable'

    const response = NextResponse.json({
      success: false,
      data: [],
      error: errorMessage,
      timestamp: Date.now()
    }, { status: 500 })

    response.headers.set('Cache-Control', 'private, no-store')

    return response
  }
}

/**
 * Global roles that could create users before the company tier existed. Only
 * consulted for a session with no company at all.
 */
const LEGACY_USER_ADMIN_ROLES = ['admin', 'top_management']

/** Turn a PostgreSQL error into something an admin can actually act on. */
function describeCreateUserError(error: unknown): { message: string; status: number } {
  const code = (error as { code?: string })?.code
  const detail = String((error as { detail?: string })?.detail || '')

  if (code === '23505') {
    if (detail.includes('email')) return { message: 'That email address already belongs to another user.', status: 409 }
    if (detail.includes('employee_id')) return { message: 'That employee ID is already taken.', status: 409 }
    return { message: 'A user with those details already exists.', status: 409 }
  }
  if (code === '23514') {
    return {
      message: 'The selected role is not one the database accepts. Allowed roles are: employee, management, top_management, admin.',
      status: 400,
    }
  }
  if (code === '23502') return { message: 'A required field was missing.', status: 400 }

  return {
    message: error instanceof Error ? error.message : 'Failed to create user',
    status: 500,
  }
}

export async function POST(request: NextRequest) {
  try {
    // canManageUsers, not a global role: a company_admin administers their own
    // company's people even with a plain `employee` global role, which is the whole
    // point of the company tier. The legacy global admins still pass through it.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const userData = await request.json()

    // The new user joins the company the caller is acting in — never one named
    // in the request body, which would let a company admin plant users in
    // another tenant. Platform admins may target a company explicitly.
    const targetCompanyId = auth.user.isPlatformAdmin && typeof userData.companyId === 'string'
      ? userData.companyId
      : auth.user.companyId

    if (targetCompanyId) {
      if (!(await canManageUsers(auth.user, targetCompanyId))) {
        return NextResponse.json(
          { success: false, error: 'You do not have permission to add users to this company.' },
          { status: 403 }
        )
      }
    } else if (!LEGACY_USER_ADMIN_ROLES.includes(auth.user.role) && !auth.user.isPlatformAdmin) {
      // No company context at all — a token issued before migration 062. Fall back
      // to the pre-tenancy rule rather than to nothing: without this branch,
      // dropping requireRole above would have let any signed-in user create users.
      return NextResponse.json(
        { success: false, error: 'You do not have permission to add users.' },
        { status: 403 }
      )
    }

    // An admin may leave the password blank; we generate a strong one and hand it
    // back so the caller can email it. generateTemporaryPassword() is deliberately
    // not used here — it produced a guessable `${employeeId}@2024`.
    const suppliedPassword = typeof userData.password === 'string' ? userData.password.trim() : ''
    const generatedPassword = suppliedPassword || generateSecurePassword(14)

    // Employee IDs are prefixed per company (companies.code), so a second
    // company numbers its people independently instead of sharing the 'AM' run.
    let employeeId: string | undefined = userData.employeeId?.trim() || undefined
    if (!employeeId && targetCompanyId) {
      const company = await getCompanyById(targetCompanyId)
      if (company?.code) employeeId = await getNextEmployeeId(company.code)
    }

    const user = await withTimeout(
      createUser({ ...userData, employeeId, password: generatedPassword }),
      15000, // 15 second timeout for create operations
      'Failed to create user - database timeout'
    )

    if (targetCompanyId) {
      await addUserToCompany(user.employeeId, targetCompanyId, 'member', true)
    }

    return NextResponse.json({
      success: true,
      data: user,
      // Returned once, so the create flow can email these credentials. The stored
      // value is a bcrypt hash and can never be read back.
      initialPassword: generatedPassword,
      passwordWasGenerated: !suppliedPassword,
      source: 'database'
    })
  } catch (error) {
    console.error('Failed to create user:', error)
    const { message, status } = describeCreateUserError(error)

    return NextResponse.json({
      success: false,
      error: message
    }, { status })
  }
}
