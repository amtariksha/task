import { NextRequest, NextResponse } from 'next/server'
import { getLeaveById, updateLeave, deleteLeave } from '@/lib/db/leaves'
import { requireAuth } from '@/lib/auth-server'
import { canApproveFor, canViewUser } from '@/lib/authz'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Leave application ID is required'
      }, { status: 400 })
    }

    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const leave = await getLeaveById(id)

    if (!leave) {
      return NextResponse.json({
        success: false,
        error: 'Leave application not found'
      }, { status: 404 })
    }

    // Reading someone else's application needs the same authority as reading
    // their records anywhere else. Without this any signed-in user could walk
    // application IDs and read every employee's leave history and reasons.
    if (
      leave.employeeId !== auth.user.employeeId &&
      !(await canViewUser(auth.user, leave.employeeId))
    ) {
      return NextResponse.json(
        { success: false, error: 'You do not have access to this application.' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: leave
    })
  } catch (error) {
    console.error('Failed to get leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get leave application'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Leave application ID is required'
      }, { status: 400 })
    }

    // Load the record first: who owns it decides what the caller may do. This
    // route previously accepted arbitrary updates with NO check, so any signed-in
    // user could approve their OWN leave by PUTing { status: 'Approved' }, or
    // alter someone else's application.
    const existing = await getLeaveById(id)
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Leave application not found' }, { status: 404 })
    }

    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const isDecision = typeof updates?.status === 'string' &&
      ['Approved', 'Rejected'].includes(updates.status)

    if (isDecision) {
      // canApproveFor returns false for self, so nobody approves their own leave.
      if (!(await canApproveFor(auth.user, existing.employeeId))) {
        return NextResponse.json(
          { success: false, error: 'You cannot approve or reject this application.' },
          { status: 403 }
        )
      }
    } else if (
      existing.employeeId !== auth.user.employeeId &&
      !(await canViewUser(auth.user, existing.employeeId))
    ) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to modify this application.' },
        { status: 403 }
      )
    }

    const leave = await updateLeave(id, updates)

    return NextResponse.json({
      success: true,
      data: leave,
      message: 'Leave application updated successfully'
    })
  } catch (error) {
    console.error('Failed to update leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update leave application'
    }, { status: 500 })
  }
}

// PATCH handler (alias for PUT to support both methods)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Leave application ID is required'
      }, { status: 400 })
    }

    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const existing = await getLeaveById(id)
    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Leave application not found'
      }, { status: 404 })
    }

    if (
      existing.employeeId !== auth.user.employeeId &&
      !(await canViewUser(auth.user, existing.employeeId))
    ) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this application.' },
        { status: 403 }
      )
    }

    const deleted = await deleteLeave(id)

    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: 'Leave application not found or failed to delete'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Leave application deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete leave application'
    }, { status: 500 })
  }
}

