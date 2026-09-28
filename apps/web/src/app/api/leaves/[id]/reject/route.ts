import { NextRequest, NextResponse } from 'next/server'
import { rejectLeave, getLeaveById } from '@/lib/db/leaves'
import { getUserByEmployeeId } from '@/lib/db/users'
import { emailService } from '@/lib/email/service'
import { requireAuth } from '@/lib/auth-server'
import { canApproveFor } from '@/lib/authz'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Authenticate BEFORE touching the body: parsing first meant an unauthorized
    // caller sending no body got a 500 from JSON.parse instead of a 401.
    // The approver used to come from the request body and was never verified,
    // so anyone could reject anyone's leave while attributing it to someone
    // else. It now comes from the verified session, and canApproveFor returns
    // false for self so nobody rejects their own application.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response
    const approverId = auth.user.employeeId

    const body = await request.json().catch(() => ({} as Record<string, string>))
    const remarks = body.remarks || body.reason

    const existingLeave = await getLeaveById(id)
    if (!existingLeave) {
      return NextResponse.json({ success: false, error: 'Leave application not found' }, { status: 404 })
    }
    if (!(await canApproveFor(auth.user, existingLeave.employeeId))) {
      return NextResponse.json(
        { success: false, error: 'You cannot reject this application.' },
        { status: 403 }
      )
    }

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Leave application ID is required'
      }, { status: 400 })
    }

    if (!approverId) {
      return NextResponse.json({
        success: false,
        error: 'Approver ID is required'
      }, { status: 400 })
    }

    // Reject leave in MySQL
    const leave = await rejectLeave(id, approverId, remarks)

    if (leave) {
      // Send in-app, push & email notifications via createNotification
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const approver = await getUserByEmployeeId(approverId)
        const approverName = approver?.name || approverId

        await createNotification({
          userId: leave.employeeId,
          actorId: approverId,
          notificationType: 'leave_rejected',
          title: 'Leave Application Rejected',
          message: `Your leave request for ${leave.leaveType} has been rejected by ${approverName}.`,
          linkUrl: '/leaves',
          metadata: { leaveId: id }
        })
        console.log('✅ Leave rejection notification created successfully')
      } catch (notifError) {
        console.error('⚠️ Failed to create leave rejection notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        data: true,
        message: 'Leave application rejected successfully'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to reject leave application'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to reject leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reject leave application'
    }, { status: 500 })
  }
}
