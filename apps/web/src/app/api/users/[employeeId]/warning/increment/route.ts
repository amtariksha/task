import { NextRequest, NextResponse } from 'next/server'
import { incrementWarningCount } from '@/lib/db/users'
import { requireRole } from '@/lib/auth-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const auth = await requireRole(request, ['admin', 'top_management', 'management'])
    if (!auth.ok) return auth.response

    const { employeeId } = await params

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'Employee ID is required' },
        { status: 400 }
      )
    }

    const result = await incrementWarningCount(employeeId)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    console.error('Failed to increment warning count:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to increment warning count' },
      { status: 500 }
    )
  }
}
