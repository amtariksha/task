import { NextRequest, NextResponse } from 'next/server'
import { requireUserAccess } from '@/lib/auth-server'
import { resetWarningCount } from '@/lib/db/users'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params

    // Clearing someone's warning count is a management action; this had no check.
    const auth = await requireUserAccess(request, employeeId)
    if (!auth.ok) return auth.response
    if (auth.user.employeeId === employeeId) {
      return NextResponse.json(
        { success: false, error: 'You cannot reset your own warning count.' },
        { status: 403 }
      )
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'Employee ID is required' },
        { status: 400 }
      )
    }

    const result = await resetWarningCount(employeeId)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    console.error('Failed to reset warning count:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to reset warning count' },
      { status: 500 }
    )
  }
}
