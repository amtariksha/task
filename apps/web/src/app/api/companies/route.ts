import { NextRequest, NextResponse } from 'next/server'
import { getAllCompanies, getUserCompanies, createCompany, addUserToCompany } from '@/lib/db/companies'
import { requireAuth } from '@/lib/auth-server'
import { canManageCompanies } from '@/lib/authz'

/**
 * GET /api/companies
 *
 * By default returns only the companies the caller belongs to — this backs the
 * company switcher. Platform admins may pass ?all=true for the full list.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const wantsAll = request.nextUrl.searchParams.get('all') === 'true'

    if (wantsAll) {
      if (!(await canManageCompanies(auth.user))) {
        return NextResponse.json(
          { success: false, error: 'Only platform administrators may list all companies.' },
          { status: 403 }
        )
      }
      const companies = await getAllCompanies(true)
      return NextResponse.json({ success: true, data: companies })
    }

    const companies = await getUserCompanies(auth.user.employeeId)
    return NextResponse.json({ success: true, data: companies })
  } catch (error) {
    console.error('Failed to list companies:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to list companies' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/companies — platform administrators only.
 * The creator is enrolled as a company_admin so the new tenant is immediately
 * manageable without a second step.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    if (!(await canManageCompanies(auth.user))) {
      return NextResponse.json(
        { success: false, error: 'Only platform administrators may create companies.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''

    if (!name || !code) {
      return NextResponse.json(
        { success: false, error: 'A company name and code are required.' },
        { status: 400 }
      )
    }
    // The code becomes the employee-ID prefix (AM -> AM-0001), so keep it to
    // characters that survive the SQL regex used to allocate the next number.
    if (!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Company code must be 2-10 letters or digits, starting with a letter.' },
        { status: 400 }
      )
    }

    const company = await createCompany({
      name,
      code,
      logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : undefined,
      createdBy: auth.user.employeeId,
    })

    await addUserToCompany(auth.user.employeeId, company.companyId, 'company_admin', false)

    return NextResponse.json({ success: true, data: company })
  } catch (error) {
    console.error('Failed to create company:', error)
    const code = (error as { code?: string })?.code
    if (code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A company with that code already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create company' },
      { status: 500 }
    )
  }
}
