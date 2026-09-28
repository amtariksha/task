import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireUserAccess } from '@/lib/auth-server'
import { getVisibleEmployeeScope } from '@/lib/authz'
import { WorkHoursService } from '@/lib/businessRules'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date')

    if (action === 'report') {
      const auth = await requireAuth(request)
      if (!auth.ok) return auth.response

      if (!date) {
        return NextResponse.json({
          success: false,
          error: 'Date is required for work hours report'
        }, { status: 400 })
      }

      // The report covered every user in the database, so any signed-in employee
      // could pull the whole organisation's hours and shortfalls for a date.
      const scope = await getVisibleEmployeeScope(auth.user)
      const report = await WorkHoursService.getWorkHoursReport(
        date,
        scope.all ? undefined : scope.employeeIds
      )
      
      return NextResponse.json({
        success: true,
        data: report,
        source: 'google_sheets'
      })
    }

    if (action === 'validate') {
      // Same exposure: employeeId came straight from the query string.
      if (employeeId) {
        const auth = await requireUserAccess(request, employeeId)
        if (!auth.ok) return auth.response
      }

      if (!employeeId || !date) {
        return NextResponse.json({
          success: false,
          error: 'Employee ID and date are required for validation'
        }, { status: 400 })
      }

      const validation = await WorkHoursService.validateWorkHours(employeeId, date)
      
      return NextResponse.json({
        success: true,
        data: validation,
        source: 'google_sheets'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: report or validate'
    }, { status: 400 })

  } catch (error) {
    console.error('Failed to process work hours request:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to process work hours request'
    }, { status: 500 })
  }
}
