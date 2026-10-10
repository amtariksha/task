import { NextRequest, NextResponse } from 'next/server'
import { getAllLeaves, getLeavesForEmployees, createLeave } from '@/lib/db/leaves'
import { withTimeout, query } from '@/lib/db/config'
import { requireAuth } from '@/lib/auth-server'
import { getVisibleEmployeeScope } from '@/lib/authz'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    // Authenticated but unscoped: this returned every leave application in every
    // company, including the stated reasons, to any signed-in user.
    const scope = await getVisibleEmployeeScope(auth.user)
    const leaves = await withTimeout(
      scope.all ? getAllLeaves() : getLeavesForEmployees(scope.employeeIds),
      10000,
      'Failed to fetch leave applications - database timeout'
    )

    return NextResponse.json({
      success: true,
      data: leaves,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to get leave applications:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get leave applications'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const body = await request.json()

    // Validate required fields
    const requiredFields = ['employeeId', 'employeeName', 'leaveType', 'fromDate', 'toDate', 'reason']
    for (const field of requiredFields) {
      if (!body[field]) {
        console.warn(`Missing required field: ${field}`)
        return NextResponse.json({
          success: false,
          error: `${field} is required`
        }, { status: 400 })
      }
    }

    // Ensure id field is set (application_id)
    if (!body.id) {
      body.id = `LEAVE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    // Ensure status is set
    if (!body.status) {
      body.status = 'Pending'
    }

    // Fetch employee's manager
    const managerRes = await withTimeout(
      query<any[]>(
        `SELECT manager_id FROM users WHERE employee_id = $1 LIMIT 1`,
        [body.employeeId]
      ),
      5000,
      'Failed to fetch manager details - database timeout'
    )
    const managerId = managerRes[0]?.manager_id

    if (managerId) {
      body.managerId = managerId
    }

    console.log('Creating leave application:', {
      id: body.id,
      employeeId: body.employeeId,
      leaveType: body.leaveType,
      fromDate: body.fromDate,
      toDate: body.toDate,
      managerId
    })

    const leave = await createLeave(body)

    console.log('Leave application created successfully:', leave.id)

    // Notify manager of pending leave request
    if (managerId) {
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const title = 'Leave Request Pending Approval 📋'
        const message = `${body.employeeName} has submitted a leave request (${body.leaveType}) from ${body.fromDate} to ${body.toDate} for your approval.`
        await createNotification({
          userId: managerId,
          actorId: body.employeeId,
          notificationType: 'leave_pending_approval',
          title,
          message,
          linkUrl: '/approvals',
          metadata: { leaveId: leave.id }
        })
        console.log(`Sent leave pending approval notification to manager ${managerId}`)
      } catch (notifErr) {
        console.error('Failed to send leave pending approval notification:', notifErr)
      }
    }

    return NextResponse.json({
      success: true,
      data: leave,
      message: 'Leave application created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create leave application:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create leave application'
    }, { status: 500 })
  }
}
