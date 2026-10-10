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
      console.warn('⚠️ Unauthorized attempt to trigger 6pm cron reminder')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    console.log('⏰ Starting 6 PM Evening Wrap-up Cron Job...')

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

        // Query completed tasks count today
        // Filter tasks that are Done and whose updated_at date matches current date in the server zone
        const completedResult = await query<{ count: string }[]>(
          `SELECT COUNT(*)::text as count 
           FROM tasks 
           WHERE deleted_at IS NULL 
             AND status = 'Done' 
             AND assigned_to::jsonb ? $1 
             AND updated_at::date = CURRENT_DATE`,
          [user.employeeId]
        )

        const completedCount = parseInt(completedResult[0]?.count || '0', 10)

        const title = 'Evening Review! 📝'
        const message = `Evening wrap-up! You completed ${completedCount} tasks today. Don't forget to submit your daily hours log!`

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
        console.error(`❌ Failed to send evening wrap-up to user ${user.employeeId}:`, userError)
      }
    }

    console.log(`✅ 6 PM Evening Wrap-up Cron Job completed. Sent ${notificationsSentCount} notifications.`)

    return NextResponse.json({
      success: true,
      sentCount: notificationsSentCount
    })
  } catch (error) {
    console.error('❌ 6 PM Evening Wrap-up Cron Job failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal Server Error'
    }, { status: 500 })
  }
}
