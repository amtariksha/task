/**
 * API Route: /api/notification-preferences
 * Purpose: Manage user notification preferences
 * Methods: GET, POST
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserAccess } from '@/lib/auth-server'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  resetNotificationPreferences
} from '@/lib/db/notificationPreferences'

/**
 * GET /api/notification-preferences?employeeId=EMP-001
 * Fetch notification preferences for a user
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')

    if (!employeeId) {
      console.warn('Missing employeeId parameter in notification preferences request')
      return NextResponse.json(
        { success: false, error: 'Missing employeeId parameter' },
        { status: 400 }
      )
    }

    // The employeeId came straight from the query string with no check, so
    // anyone signed in could read (and via POST, rewrite) another person's
    // notification settings.
    const auth = await requireUserAccess(request, employeeId)
    if (!auth.ok) return auth.response

    console.log(`Fetching notification preferences for employee: ${employeeId}`)

    const preferences = await getNotificationPreferences(employeeId)

    console.log(`Successfully fetched notification preferences for ${employeeId}`)

    return NextResponse.json({
      success: true,
      data: preferences
    })
  } catch (error) {
    const errorCode = (error as any)?.code

    console.error('Error fetching notification preferences:', error)

    // Check if table doesn't exist
    if (errorCode === 'ER_NO_SUCH_TABLE') {
      console.error('⚠️ user_notification_preferences table does not exist. Please run migration 009.')
      return NextResponse.json(
        {
          success: false,
          error: 'Notification preferences feature not available. Database migration required.',
          code: 'TABLE_NOT_FOUND'
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch notification preferences' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notification-preferences
 * Update or reset notification preferences
 * Body:
 * - action: 'update' | 'reset'
 * - employeeId: string
 * - preferences: Partial<NotificationPreferences> (for action=update)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, employeeId, preferences } = body

    if (!action || !employeeId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Same exposure as GET: employeeId came from the request body unchecked.
    const auth = await requireUserAccess(request, employeeId)
    if (!auth.ok) return auth.response

    if (action === 'update') {
      if (!preferences) {
        return NextResponse.json(
          { success: false, error: 'Missing preferences parameter' },
          { status: 400 }
        )
      }

      const updated = await updateNotificationPreferences(employeeId, preferences)

      return NextResponse.json({
        success: true,
        data: updated,
        message: 'Notification preferences updated successfully'
      })
    }

    if (action === 'reset') {
      const reset = await resetNotificationPreferences(employeeId)

      return NextResponse.json({
        success: true,
        data: reset,
        message: 'Notification preferences reset to defaults'
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
}

