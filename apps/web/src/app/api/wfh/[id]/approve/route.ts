import { NextRequest, NextResponse } from 'next/server'
import { approveWFH, getWFHById } from '@/lib/db/wfh'
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
        error: 'WFH application ID is required'
      }, { status: 400 })
    }

    // Authorization: lib/authz.canApproveFor is the only rule. It returns false
    // for self-approval and applies the tenant boundary before any role check.
    // The previous version short-circuited for 'admin', 'top_management' AND
    // 'management', so those users could approve their own requests.
    const wfhApp = await getWFHById(id)
    if (!wfhApp) {
      return NextResponse.json(
        { success: false, error: 'WFH application not found' },
        { status: 404 }
      )
    }
    if (!(await canApproveFor(auth.user, wfhApp.employeeId))) {
      return NextResponse.json(
        { success: false, error: 'You are not authorized to approve this WFH request' },
        { status: 403 }
      )
    }

    // Approve WFH
    const wfh = await approveWFH(id, approverId, remarks)

    if (wfh) {
      // Send in-app, push & email notifications via createNotification
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const approver = await getUserByEmployeeId(approverId)
        const approverName = approver?.name || approverId

        await createNotification({
          userId: wfh.employeeId,
          actorId: approverId,
          notificationType: 'wfh_approved',
          title: 'WFH Request Approved',
          message: `Your Work From Home request for ${wfh.fromDate} has been approved by ${approverName}.`,
          linkUrl: '/wfh',
          metadata: { wfhId: id }
        })
        console.log('✅ WFH approval notification created successfully')
      } catch (notifError) {
        console.error('⚠️ Failed to create WFH approval notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        data: true,
        message: 'WFH application approved successfully'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to approve WFH application'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to approve WFH application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to approve WFH application'
    }, { status: 500 })
  }
}
