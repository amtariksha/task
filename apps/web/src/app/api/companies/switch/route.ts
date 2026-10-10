import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmployeeId } from '@/lib/db/users'
import { isMemberOfCompany, setDefaultCompany } from '@/lib/db/companies'
import { requireAuth, issueAuthToken } from '@/lib/auth-server'

/**
 * POST /api/companies/switch  { companyId }
 *
 * Re-issues the session token scoped to another company the caller belongs to.
 * Membership is checked server-side: the companyId in the request is a request,
 * not an assertion, so a user cannot switch into a tenant they are not part of.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { companyId } = await request.json()
    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json({ success: false, error: 'companyId is required' }, { status: 400 })
    }

    const isMember = await isMemberOfCompany(auth.user.employeeId, companyId)
    if (!isMember && !auth.user.isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: 'You are not a member of that company.' },
        { status: 403 }
      )
    }

    const user = await getUserByEmployeeId(auth.user.employeeId)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Remember the choice so the next sign-in lands in the same place.
    if (isMember) {
      await setDefaultCompany(auth.user.employeeId, companyId)
    }

    return issueAuthToken(
      { ...user, companyId, isPlatformAdmin: auth.user.isPlatformAdmin },
      { source: 'company-switch' }
    )
  } catch (error) {
    console.error('Failed to switch company:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to switch company' },
      { status: 500 }
    )
  }
}
