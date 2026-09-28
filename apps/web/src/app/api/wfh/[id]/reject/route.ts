import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { canApproveFor } from '@/lib/authz'
import { rejectWFH, getWFHById } from '@/lib/db/wfh'
import { getUserByEmployeeId } from '@/lib/db/users'
import { emailService } from '@/lib/email/service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Authenticate BEFORE touching the body: parsing first meant an unauthorized
    // caller sending no body got a 500 from JSON.parse instead of a 401.
    // approverId used to come from the request body unverified; it now comes
    // from the session, and canApproveFor blocks rejecting your own application.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response
    const approverId = auth.user.employeeId

    const { remarks } = await request.json().catch(() => ({ remarks: undefined }))

    const existingWfh = await getWFHById(id)
    if (!existingWfh) {
      return NextResponse.json({ success: false, error: 'WFH application not found' }, { status: 404 })
    }
    if (!(await canApproveFor(auth.user, existingWfh.employeeId))) {
      return NextResponse.json(
        { success: false, error: 'You cannot reject this application.' },
        { status: 403 }
      )
    }

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'WFH application ID is required'
      }, { status: 400 })
    }


    // Reject WFH in MySQL
    const wfh = await rejectWFH(id, approverId, remarks)

    if (wfh) {
      // Send in-app, push & email notifications via createNotification
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const approver = await getUserByEmployeeId(approverId)
        const approverName = approver?.name || approverId

        await createNotification({
          userId: wfh.employeeId,
          actorId: approverId,
          notificationType: 'wfh_rejected',
          title: 'WFH Request Rejected',
          message: `Your Work From Home request for ${wfh.fromDate} has been rejected by ${approverName}.`,
          linkUrl: '/wfh',
          metadata: { wfhId: id }
        })
        console.log('✅ WFH rejection notification created successfully')
      } catch (notifError) {
        console.error('⚠️ Failed to create WFH rejection notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        data: true,
        message: 'WFH application rejected successfully'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to reject WFH application'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to reject WFH application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reject WFH application'
    }, { status: 500 })
  }
}
