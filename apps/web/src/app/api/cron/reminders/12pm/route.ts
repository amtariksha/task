import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAllUsers } from '@/lib/db/users'
import { createNotification } from '@/lib/notification-helper'
import { shouldNotify } from '@/lib/db/notificationPreferences'

export async function GET(request: NextRequest) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('⚠️ Unauthorized attempt to trigger 12pm cron reminder')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    console.log('⏰ Starting 12 PM Midday Review Cron Job...')

    // 2. Fetch all active users
    const users = await getAllUsers()
    let notificationsSentCount = 0

    // 3. Process each user
    for (const user of users) {
      try {
        // Check user preferences
        const isAllowed = await shouldNotify(user.employeeId, 'dailySummary', 'in_app')
        if (!isAllowed) {
          continue
        }

        // Query pending tasks count
        const taskResult = await query<{ count: string }[]>(
          `SELECT COUNT(*)::text as count 
           FROM tasks 
           WHERE deleted_at IS NULL 
             AND status IN ('Yet to Start', 'In Progress', 'Delayed', 'ReOpened') 
             AND assigned_to::jsonb ? $1`,
          [user.employeeId]
        )

        const pendingCount = parseInt(taskResult[0]?.count || '0', 10)

        const title = 'Midday Review! 💪'
        const message = `Keep up the good work, ${user.name}! You still have ${pendingCount} tasks in progress. Keep pushin'! `

        await createNotification({
          userId: user.employeeId,
          actorId: 'system',
          notificationType: 'daily_summary',
          title,
          message,
          linkUrl: '/tasks'
        })

        notificationsSentCount++
      } catch (userError) {
        console.error(`❌ Failed to send midday briefing to user ${user.employeeId}:`, userError)
      }
    }

    console.log(`✅ 12 PM Midday Review Cron Job completed. Sent ${notificationsSentCount} notifications.`)

    return NextResponse.json({
      success: true,
      sentCount: notificationsSentCount
    })
  } catch (error) {
    console.error('❌ 12 PM Midday Review Cron Job failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal Server Error'
    }, { status: 500 })
  }
}
