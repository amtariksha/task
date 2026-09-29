/**
 * A company's people.
 *
 * GET    — list members with their company role
 * POST   — add an existing user to this company
 * PATCH  — change a member's company role
 * DELETE — remove a member
 *
 * All four need company-admin authority over THIS company. Membership is what
 * makes a company's projects, users and settings visible, so it is a privilege in
 * its own right — the same reason project membership is guarded.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { canAdminCompany, isCompanyMember } from '@/lib/authz'
import {
  addUserToCompany,
  countCompanyAdmins,
  getCompanyById,
  getCompanyMembers,
  getCompanyRole,
  removeUserFromCompany,
  setCompanyRole,
  type CompanyRole,
} from '@/lib/db/companies'
import { getUserByEmployeeId } from '@/lib/db/users'

const VALID_COMPANY_ROLES: CompanyRole[] = ['company_admin', 'member']

const forbidden = (message: string) =>
  NextResponse.json({ success: false, error: message }, { status: 403 })

const badRequest = (message: string) =>
  NextResponse.json({ success: false, error: message }, { status: 400 })

/** Shared preamble: the company must exist, and the caller must administer it. */
async function requireCompanyAdmin(request: NextRequest, companyId: string) {
  const auth = await requireAuth(request)
  if (!auth.ok) return { ok: false as const, response: auth.response }

  if (!(await getCompanyById(companyId))) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 }),
    }
  }
  if (!(await canAdminCompany(auth.user, companyId))) {
    return { ok: false as const, response: forbidden('You do not administer this company.') }
  }
  return { ok: true as const, user: auth.user }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { companyId } = await params
    if (!(await getCompanyById(companyId))) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 })
    }
    // Reading the member list needs membership, not admin: people should be able
    // to see who is in their own company.
    if (!(await isCompanyMember(auth.user, companyId))) {
      return forbidden('You do not belong to this company.')
    }

    const members = await getCompanyMembers(companyId)
    return NextResponse.json(
      { success: true, data: members },
      // Names and email addresses, scoped to one company — never a shared cache.
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('Failed to list company members:', error)
    return NextResponse.json({ success: false, error: 'Failed to list members' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params
    const guard = await requireCompanyAdmin(request, companyId)
    if (!guard.ok) return guard.response

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : ''
    const companyRole: CompanyRole =
      body.companyRole === 'company_admin' ? 'company_admin' : 'member'
    const makeDefault = body.makeDefault === true

    if (!employeeId) return badRequest('employeeId is required.')
    if (body.companyRole !== undefined && !VALID_COMPANY_ROLES.includes(body.companyRole as CompanyRole)) {
      return badRequest(`companyRole must be one of: ${VALID_COMPANY_ROLES.join(', ')}`)
    }

    // The user has to exist. addUserToCompany would otherwise insert a membership
    // row for a typo and leave an unreachable company member behind.
    const user = await getUserByEmployeeId(employeeId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: `No user with employee ID ${employeeId}.` },
        { status: 404 }
      )
    }

    await addUserToCompany(employeeId, companyId, companyRole, makeDefault)
    const members = await getCompanyMembers(companyId)
    return NextResponse.json({ success: true, data: members })
  } catch (error) {
    console.error('Failed to add company member:', error)
    return NextResponse.json({ success: false, error: 'Failed to add member' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params
    const guard = await requireCompanyAdmin(request, companyId)
    if (!guard.ok) return guard.response

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : ''
    const companyRole = body.companyRole as CompanyRole

    if (!employeeId) return badRequest('employeeId is required.')
    if (!VALID_COMPANY_ROLES.includes(companyRole)) {
      return badRequest(`companyRole must be one of: ${VALID_COMPANY_ROLES.join(', ')}`)
    }

    // Demoting the last admin would leave the company with nobody who can add
    // users, edit its settings or promote anyone back.
    if (companyRole === 'member' && (await getCompanyRole(employeeId, companyId)) === 'company_admin') {
      if ((await countCompanyAdmins(companyId)) <= 1) {
        return badRequest(
          'This is the company’s only admin. Promote someone else before changing this role.'
        )
      }
    }

    if (!(await setCompanyRole(employeeId, companyId, companyRole))) {
      return NextResponse.json(
        { success: false, error: `${employeeId} is not a member of this company.` },
        { status: 404 }
      )
    }

    const members = await getCompanyMembers(companyId)
    return NextResponse.json({ success: true, data: members })
  } catch (error) {
    console.error('Failed to set company role:', error)
    return NextResponse.json({ success: false, error: 'Failed to set company role' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params
    const guard = await requireCompanyAdmin(request, companyId)
    if (!guard.ok) return guard.response

    // Accept the employee ID from the query string as well: a DELETE body is
    // awkward for some clients, and the mobile app sends one and the web the other.
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const employeeId =
      (typeof body.employeeId === 'string' ? body.employeeId.trim() : '') ||
      (request.nextUrl.searchParams.get('employeeId') || '').trim()

    if (!employeeId) return badRequest('employeeId is required.')

    const currentRole = await getCompanyRole(employeeId, companyId)
    if (currentRole === null) {
      return NextResponse.json(
        { success: false, error: `${employeeId} is not a member of this company.` },
        { status: 404 }
      )
    }
    if (currentRole === 'company_admin' && (await countCompanyAdmins(companyId)) <= 1) {
      return badRequest(
        'This is the company’s only admin. Add another before removing them.'
      )
    }

    await removeUserFromCompany(employeeId, companyId)
    const members = await getCompanyMembers(companyId)
    return NextResponse.json({ success: true, data: members })
  } catch (error) {
    console.error('Failed to remove company member:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove member' }, { status: 500 })
  }
}
