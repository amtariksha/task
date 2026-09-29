/**
 * One company: read it, or change its details.
 *
 * GET   /api/companies/[companyId] — the company, for anyone who belongs to it
 * PATCH /api/companies/[companyId] — name, logo and status for a company admin;
 *                                    `code` is platform-admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { canAdminCompany, isCompanyMember, isPlatformAdmin } from '@/lib/authz'
import { getCompanyById, updateCompany } from '@/lib/db/companies'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { companyId } = await params
    const company = await getCompanyById(companyId)
    if (!company) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 })
    }

    // Existence before permission, so a bad id reads as a bad id.
    if (!(await isCompanyMember(auth.user, companyId))) {
      return NextResponse.json(
        { success: false, error: 'You do not belong to this company.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true, data: company })
  } catch (error) {
    console.error('Failed to get company:', error)
    return NextResponse.json({ success: false, error: 'Failed to get company' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { companyId } = await params
    const existing = await getCompanyById(companyId)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 })
    }

    if (!(await canAdminCompany(auth.user, companyId))) {
      return NextResponse.json(
        { success: false, error: 'You do not administer this company.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const updates: { name?: string; code?: string; logoUrl?: string; status?: 'active' | 'inactive' } = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json(
          { success: false, error: 'A company name cannot be empty.' },
          { status: 400 }
        )
      }
      updates.name = name
    }

    if (typeof body.logoUrl === 'string') updates.logoUrl = body.logoUrl.trim()

    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        return NextResponse.json(
          { success: false, error: "status must be 'active' or 'inactive'." },
          { status: 400 }
        )
      }
      updates.status = body.status
    }

    if (typeof body.code === 'string' && body.code.trim().toUpperCase() !== existing.code) {
      // The code is the employee-ID prefix: AM -> AM-0001. Changing it renumbers
      // nobody, so old and new IDs coexist, and it is shared across the whole
      // deployment — a company admin must not be able to take another's prefix.
      if (!(await isPlatformAdmin(auth.user))) {
        return NextResponse.json(
          { success: false, error: 'Only a platform admin can change a company code.' },
          { status: 403 }
        )
      }
      const code = body.code.trim()
      if (!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(code)) {
        return NextResponse.json(
          { success: false, error: 'Company code must be 2-10 letters or digits, starting with a letter.' },
          { status: 400 }
        )
      }
      updates.code = code
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, data: existing })
    }

    const company = await updateCompany(companyId, updates)
    return NextResponse.json({ success: true, data: company })
  } catch (error) {
    console.error('Failed to update company:', error)
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A company with that code already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: false, error: 'Failed to update company' }, { status: 500 })
  }
}
