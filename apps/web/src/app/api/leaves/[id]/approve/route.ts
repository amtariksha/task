import { NextRequest, NextResponse } from 'next/server'
import { approveLeave, getLeaveById } from '@/lib/db/leaves'
import { getUserByEmployeeId } from '@/lib/db/users'
import { emailService } from '@/lib/email/service'
import { requireAuth } from '@/lib/auth-server'
import { canApproveFor } from '@/lib/authz'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { id } = await params
    const { remarks } = await request.json()
    // SECURITY: the approver is the authenticated user, never a client-supplied id.
    const approverId = auth.user.employeeId

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Leave application ID is required'
      }, { status: 400 })
    }

    // Authorization: lib/authz.canApproveFor is the only rule. It returns false
    // for self-approval and applies the tenant boundary before any role check.
    // The previous version short-circuited for 'admin', 'top_management' AND
    // 'management', so those users could approve their own applications and
    // anyone else's in any company.
    const leaveApp = await getLeaveById(id)
    if (!leaveApp) {
      return NextResponse.json(
        { success: false, error: 'Leave application not found' },
        { status: 404 }
      )
    }
    if (!(await canApproveFor(auth.user, leaveApp.employeeId))) {
      return NextResponse.json(
        { success: false, error: 'You are not authorized to approve this leave' },
        { status: 403 }
      )
    }

    // Approve leave
    const leave = await approveLeave(id, approverId, remarks)

    if (leave) {
      // Send in-app, push & email notifications via createNotification
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const approver = await getUserByEmployeeId(approverId)
        const approverName = approver?.name || approverId

        await createNotification({
          userId: leave.employeeId,
          actorId: approverId,
          notificationType: 'leave_approved',
          title: 'Leave Application Approved',
          message: `Your leave request for ${leave.leaveType} has been approved by ${approverName}.`,
          linkUrl: '/leaves',
          metadata: { leaveId: id }
        })
        console.log('✅ Leave approval notification created successfully')
      } catch (notifError) {
        console.error('⚠️ Failed to create leave approval notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        data: true,
        message: 'Leave application approved successfully'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to approve leave application'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to approve leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to approve leave application'
    }, { status: 500 })
  }
}
