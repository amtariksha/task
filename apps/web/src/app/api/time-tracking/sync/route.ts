// Time Tracking API - Sync timer data to database
// Handles periodic sync of timer state from client to server

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { updateTask } from '@/lib/db/tasks'
import { updateBug } from '@/lib/db/bugs'
import { getCurrentDateTime } from '@/lib/datetime-utils'

interface TimerSession {
  startTime: number
  endTime?: number
  duration: number
}

interface SyncRequest {
  entityType: 'task' | 'bug'
  entityId: string
  state: 'stopped' | 'running' | 'paused'
  totalTime: number
  sessions: TimerSession[]
}

/**
 * POST /api/time-tracking/sync
 * Sync timer data from client to database
 * 
 * This endpoint is called:
 * - Every 5 minutes while timer is running (periodic sync)
 * - When timer is paused (immediate sync)
 * - When timer is stopped (final sync)
 * 
 * @example
 * POST /api/time-tracking/sync
 * Body: {
 *   entityType: 'task',
 *   entityId: 'JSR-001',
 *   state: 'running',
 *   totalTime: 3600000,
 *   sessions: [...]
 * }
 */
export async function POST(request: NextRequest) {
  console.log('🔵 [TIME-TRACKING-SYNC] API called')

  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value
    console.log('🔵 [TIME-TRACKING-SYNC] Token present:', !!token)

    if (!token) {
      console.log('❌ [TIME-TRACKING-SYNC] No token found')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const user = verifyToken(token)
    console.log('🔵 [TIME-TRACKING-SYNC] User verified:', user ? user.employeeId : 'null')

    if (!user) {
      console.log('❌ [TIME-TRACKING-SYNC] Invalid token')
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json() as SyncRequest
    const { entityType, entityId, state, totalTime, sessions } = body

    console.log('🔵 [TIME-TRACKING-SYNC] Request:', { entityType, entityId, state, totalTime, sessionCount: sessions?.length })

    // Validate required fields
    if (!entityType || !entityId || !state || totalTime === undefined) {
      console.log('❌ [TIME-TRACKING-SYNC] Missing required fields:', { entityType, entityId, state, totalTime })
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updates: any = {
      timerState: state,
      timerStartTime: state === 'running' ? getCurrentDateTime() : null,
      timerTotalTime: totalTime,
      timerSessions: JSON.stringify(sessions),
      updatedAt: getCurrentDateTime()
    }

    // Only update actualHours when timer is stopped (final sync)
    // When stopped, ADD the timer's elapsed time to existing actualHours
    if (state === 'stopped') {
      // Import the appropriate get function to fetch current entity
      const { getBugById } = await import('@/lib/db/bugs')
      const { getTaskById } = await import('@/lib/db/tasks')

      let currentActualHours = 0

      if (entityType === 'bug') {
        const bug = await getBugById(entityId)
        currentActualHours = parseFloat(bug?.actualHours as any) || 0
      } else if (entityType === 'task') {
        const task = await getTaskById(entityId)
        currentActualHours = parseFloat(task?.actualHours as any) || 0
      }

      // Calculate hours to add from timer (milliseconds to hours)
      const hoursToAdd = totalTime / (1000 * 60 * 60)
      const newActualHours = currentActualHours + hoursToAdd

      updates.actualHours = Math.round(newActualHours * 100) / 100 // Round to 2 decimal places

      // Reset timer fields when stopped
      updates.timerTotalTime = 0
      updates.timerSessions = null

      console.log('🔵 [TIME-TRACKING-SYNC] Timer stopped - adding hours:', {
        currentActualHours,
        hoursToAdd,
        newActualHours: updates.actualHours
      })
    }

    console.log('🔵 [TIME-TRACKING-SYNC] Updates to apply:', updates)

    // Update the appropriate entity
    try {
      console.log('🔵 [TIME-TRACKING-SYNC] Updating entity:', entityType, entityId)

      if (entityType === 'task') {
        console.log('🔵 [TIME-TRACKING-SYNC] Calling updateTask...')
        await updateTask(entityId, updates)
        console.log('✅ [TIME-TRACKING-SYNC] Task updated successfully')
      } else if (entityType === 'bug') {
        console.log('🔵 [TIME-TRACKING-SYNC] Calling updateBug...')
        await updateBug(entityId, updates)
        console.log('✅ [TIME-TRACKING-SYNC] Bug updated successfully')
      } else {
        console.log('❌ [TIME-TRACKING-SYNC] Invalid entity type:', entityType)
        return NextResponse.json(
          { success: false, error: 'Invalid entity type' },
          { status: 400 }
        )
      }

      console.log('✅ [TIME-TRACKING-SYNC] Sync completed successfully')
      return NextResponse.json({
        success: true,
        message: 'Timer synced successfully',
        data: {
          actualHours: updates.actualHours,
          state: updates.timerState
        }
      })
    } catch (updateError) {
      console.error('❌ [TIME-TRACKING-SYNC] Error updating entity:', updateError)

      // Log what was being synced; the error itself is logged above.
      console.error('❌ [TIME-TRACKING-SYNC] Error details:', {
        entityType,
        entityId,
        state,
        totalTime
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update timer data'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('❌ [TIME-TRACKING-SYNC] Outer error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync timer data'
      },
      { status: 500 }
    )
  }
}

