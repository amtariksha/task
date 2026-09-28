import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireUserAccess } from '@/lib/auth-server'
import { HalfDayService } from '@/lib/businessRules'
import { getLeavesByEmployeeId } from '@/lib/db/leaves'
import { getWFHByEmployeeId } from '@/lib/db/wfh'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    const type = searchParams.get('type')

    if (action === 'check') {
      // This action is not needed since we don't have checkHalfDayApplication method
      return NextResponse.json({
        success: false,
        error: 'Check action is not implemented'
      }, { status: 400 })
    }

    if (action === 'validate') {
      // Pure date arithmetic, but still behind a session so the branch does not
      // depend on the middleware gate alone.
      const auth = await requireAuth(request)
      if (!auth.ok) return auth.response

      if (!fromDate || !toDate || !type) {
        return NextResponse.json({
          success: false,
          error: 'From date, to date, and type are required'
        }, { status: 400 })
      }

      const validation = HalfDayService.validateHalfDayDates(fromDate, toDate, type as 'leave' | 'wfh')

      return NextResponse.json({
        success: true,
        data: validation,
        source: 'validation'
      })
    }

    if (action === 'conflict') {
      // employeeId came from the query string unchecked, exposing anyone's
      // leave and WFH history for a given date.
      if (employeeId) {
        const auth = await requireUserAccess(request, employeeId)
        if (!auth.ok) return auth.response
      }

      if (!employeeId || !date) {
        return NextResponse.json({
          success: false,
          error: 'Employee ID and date are required'
        }, { status: 400 })
      }

      try {
        // Check existing leave applications from MySQL
        const leaves = await getLeavesByEmployeeId(employeeId)
        const existingLeave = leaves.find(leave =>
          leave.fromDate <= date &&
          leave.toDate >= date &&
          ['Pending', 'Approved'].includes(leave.status)
        )

        if (existingLeave) {
          return NextResponse.json({
            success: true,
            data: {
              hasConflict: true,
              conflictType: 'leave',
              conflictDetails: `You already have a ${existingLeave.leaveType} leave application for this date.`
            },
            source: 'mysql'
          })
        }

        // Check existing WFH applications from MySQL
        const wfhApps = await getWFHByEmployeeId(employeeId)
        const existingWFH = wfhApps.find(wfh =>
          (wfh.fromDate === date || (wfh.fromDate <= date && wfh.toDate >= date)) &&
          ['Pending', 'Approved'].includes(wfh.status)
        )

        if (existingWFH) {
          return NextResponse.json({
            success: true,
            data: {
              hasConflict: true,
              conflictType: 'wfh',
              conflictDetails: `You already have a ${existingWFH.wfhType} WFH application for this date.`
            },
            source: 'mysql'
          })
        }

        return NextResponse.json({
          success: true,
          data: { hasConflict: false },
          source: 'mysql'
        })
      } catch (error) {
        console.error('Error checking existing applications:', error)
        return NextResponse.json({
          success: false,
          error: 'Failed to check for existing applications'
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: check, validate, or conflict'
    }, { status: 400 })

  } catch (error) {
    console.error('Failed to process half-day request:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to process half-day request'
    }, { status: 500 })
  }
}
