import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireUserAccess } from '@/lib/auth-server'
import { getAllWFH, getWFHForEmployees, createWFH } from '@/lib/db/wfh'
import { getVisibleEmployeeScope } from '@/lib/authz'
import { withTimeout, query } from '@/lib/db/config'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    // This returned every WFH application in every company — names, dates,
    // reasons and home addresses — to any signed-in user.
    const scope = await getVisibleEmployeeScope(auth.user)
    const wfhApplications = await withTimeout(
      scope.all ? getAllWFH() : getWFHForEmployees(scope.employeeIds),
      10000,
      'Failed to fetch WFH applications - database timeout'
    )

    return NextResponse.json({
      success: true,
      data: wfhApplications,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to get WFH applications:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get WFH applications'

    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    // employeeId came from the body unchecked, so an application could be
    // filed in someone else's name. You may file for yourself, or for someone
    // you manage.
    if (body?.employeeId) {
      const auth = await requireUserAccess(request, body.employeeId)
      if (!auth.ok) return auth.response
    }

    const requiredFields = ['employeeId', 'employeeName', 'wfhType', 'fromDate', 'toDate', 'workLocation', 'contactNumber', 'reason']
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
      body.id = `WFH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

    console.log('Creating WFH application:', {
      id: body.id,
      employeeId: body.employeeId,
      wfhType: body.wfhType,
      fromDate: body.fromDate,
      toDate: body.toDate,
      managerId
    })

    const wfh = await createWFH(body)

    console.log('WFH application created successfully:', wfh.id)

    // Notify manager of pending WFH request
    if (managerId) {
      try {
        const { createNotification } = await import('@/lib/notification-helper')
        const title = 'WFH Request Pending Approval 🏠'
        const message = `${body.employeeName} has submitted a WFH request (${body.wfhType}) from ${body.fromDate} to ${body.toDate} for your approval.`
        await createNotification({
          userId: managerId,
          actorId: body.employeeId,
          notificationType: 'wfh_pending_approval',
          title,
          message,
          linkUrl: '/approvals',
          metadata: { wfhId: wfh.id }
        })
        console.log(`Sent WFH pending approval notification to manager ${managerId}`)
      } catch (notifErr) {
        console.error('Failed to send WFH pending approval notification:', notifErr)
      }
    }

    return NextResponse.json({
      success: true,
      data: wfh,
      message: 'WFH application created successfully'
    }, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to create WFH application:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({
      success: false,
      error: errorMessage || 'Failed to create WFH application'
    }, { status: 500 })
  }
}
