import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { createNotification } from '@/lib/notification-helper'

export async function GET(request: NextRequest) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('⚠️ Unauthorized attempt to trigger due-checking cron')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get current time in Indian Standard Time (IST)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const currentDateStr = nowIST.toISOString().split('T')[0] // YYYY-MM-DD
    
    console.log(`⏰ Starting due/start checking cron job at IST: ${nowIST.toISOString()} (Date: ${currentDateStr})`)

    let startWarningsSent = 0
    let overdueAlertsSent = 0

    // =========================================================================
    // PART 1: 15-MINUTE START WARNINGS
    // =========================================================================
    // Query tasks starting today with a start time
    const startingTasks = await query<any[]>(
      `SELECT task_id, name, description, assigned_to, start_date, start_time
       FROM tasks
       WHERE deleted_at IS NULL
         AND status IN ('Open', 'Yet to Start', 'In Progress', 'Delayed', 'ReOpened')
         AND start_date = $1
         AND start_time IS NOT NULL`,
      [currentDateStr]
    )

    for (const task of startingTasks) {
      try {
        const assignedTo = Array.isArray(task.assigned_to) 
          ? task.assigned_to 
          : JSON.parse(task.assigned_to || '[]')

        if (assignedTo.length === 0) continue

        // Parse start_time (format: HH:mm:ss or HH:mm)
        const [hours, minutes] = task.start_time.split(':').map(Number)
        
        // Construct task start datetime in IST
        const startDateTime = new Date(nowIST)
        startDateTime.setHours(hours, minutes, 0, 0)

        // Calculate difference in milliseconds
        const diffMs = startDateTime.getTime() - nowIST.getTime()
        const diffMins = diffMs / (1000 * 60)

        // If task is starting in the next 15 minutes (with a small buffer: 0 to 16 minutes from now)
        if (diffMins >= 0 && diffMins <= 16) {
          // Check if notification already sent
          const existingNotif = await query<any[]>(
            `SELECT 1 FROM feed_notifications 
             WHERE task_id = $1 AND notification_type = 'task_due_soon'`,
            [task.task_id]
          )

          if (existingNotif.length === 0) {
            // Send warning to all assignees
            const title = 'Task Starting Soon! ⏱️'
            const message = `Your task "${task.name || task.description || 'Task'}" is scheduled to start in 15 minutes at ${task.start_time.substring(0, 5)}`

            for (const assigneeId of assignedTo) {
              await createNotification({
                userId: assigneeId,
                actorId: 'system',
                notificationType: 'task_due_soon',
                taskId: task.task_id,
                title,
                message,
                linkUrl: `/tasks/${task.task_id}`
              })
            }
            startWarningsSent++
          }
        }
      } catch (err) {
        console.error(`❌ Error processing start warning for task ${task.task_id}:`, err)
      }
    }

    // =========================================================================
    // PART 2: OVERDUE ALERTS
    // =========================================================================
    // Query tasks with end_date between 2 days ago and today
    const twoDaysAgo = new Date(nowIST)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0]

    const potentialOverdueTasks = await query<any[]>(
      `SELECT task_id, name, description, assigned_to, end_date, due_time
       FROM tasks
       WHERE deleted_at IS NULL
         AND status IN ('Open', 'Yet to Start', 'In Progress', 'Delayed', 'ReOpened', 'Hold')
         AND end_date >= $1
         AND end_date <= $2`,
      [twoDaysAgoStr, currentDateStr]
    )

    for (const task of potentialOverdueTasks) {
      try {
        const assignedTo = Array.isArray(task.assigned_to) 
          ? task.assigned_to 
          : JSON.parse(task.assigned_to || '[]')

        if (assignedTo.length === 0) continue

        // Construct due datetime in IST
        // Parse end_date (YYYY-MM-DD)
        const [year, month, day] = task.end_date.split('-').map(Number)
        const dueDateTime = new Date(year, month - 1, day) // Note: Month is 0-indexed

        if (task.due_time) {
          const [hours, minutes] = task.due_time.split(':').map(Number)
          dueDateTime.setHours(hours, minutes, 0, 0)
        } else {
          // If no due_time, default to end of day (23:59:59)
          dueDateTime.setHours(23, 59, 59, 999)
        }

        // If current time has passed the due time
        if (nowIST.getTime() > dueDateTime.getTime()) {
          // Check if notification already sent
          const existingNotif = await query<any[]>(
            `SELECT 1 FROM feed_notifications 
             WHERE task_id = $1 AND notification_type = 'task_overdue'`,
            [task.task_id]
          )

          if (existingNotif.length === 0) {
            // Send alert to all assignees
            const title = 'Task Overdue! 🚨'
            const dueTimeStr = task.due_time ? ` at ${task.due_time.substring(0, 5)}` : ''
            const message = `The due date/time (${task.end_date}${dueTimeStr}) has passed for task: "${task.name || task.description || 'Task'}"`

            for (const assigneeId of assignedTo) {
              await createNotification({
                userId: assigneeId,
                actorId: 'system',
                notificationType: 'task_overdue',
                taskId: task.task_id,
                title,
                message,
                linkUrl: `/tasks/${task.task_id}`
              })
            }
            overdueAlertsSent++
          }
        }
      } catch (err) {
        console.error(`❌ Error processing overdue alert for task ${task.task_id}:`, err)
      }
    }

    // =========================================================================
    // PART 3: 10-MINUTE GOOGLE MEET REMINDERS
    // =========================================================================
    // Query tasks starting today with meeting_reminder = true and meeting_link IS NOT NULL
    let meetingRemindersSent = 0
    const meetingTasks = await query<any[]>(
      `SELECT task_id, name, description, assigned_to, start_date, start_time, meeting_link
       FROM tasks
       WHERE deleted_at IS NULL
         AND status IN ('Open', 'Yet to Start', 'In Progress', 'Delayed', 'ReOpened')
         AND start_date = $1
         AND start_time IS NOT NULL
         AND meeting_reminder = true
         AND meeting_link IS NOT NULL
         AND meeting_link <> ''`,
      [currentDateStr]
    )

    for (const task of meetingTasks) {
      try {
        const assignedTo = Array.isArray(task.assigned_to) 
          ? task.assigned_to 
          : JSON.parse(task.assigned_to || '[]')

        if (assignedTo.length === 0) continue

        // Parse start_time (format: HH:mm:ss or HH:mm)
        const [hours, minutes] = task.start_time.split(':').map(Number)
        
        // Construct task start datetime in IST
        const startDateTime = new Date(nowIST)
        startDateTime.setHours(hours, minutes, 0, 0)

        // Calculate difference in milliseconds
        const diffMs = startDateTime.getTime() - nowIST.getTime()
        const diffMins = diffMs / (1000 * 60)

        // If meeting is starting in the next 10 minutes (0 to 11 minutes from now)
        if (diffMins >= 0 && diffMins <= 11) {
          // Check if notification already sent
          const existingNotif = await query<any[]>(
            `SELECT 1 FROM feed_notifications 
             WHERE task_id = $1 AND notification_type = 'task_due_soon' AND title LIKE 'Google Meet Starting Soon!%'`,
            [task.task_id]
          )

          if (existingNotif.length === 0) {
            // Send alert to all assignees
            const title = 'Google Meet Starting Soon! 📞'
            const message = `Your task meeting "${task.name || task.description || 'Task'}" starts in 10 minutes. Click to join Meet.`

            for (const assigneeId of assignedTo) {
              await createNotification({
                userId: assigneeId,
                actorId: 'system',
                notificationType: 'task_due_soon',
                taskId: task.task_id,
                title,
                message,
                linkUrl: task.meeting_link
              })
            }
            meetingRemindersSent++
          }
        }
      } catch (err) {
        console.error(`❌ Error processing meeting reminder for task ${task.task_id}:`, err)
      }
    }

    console.log(`✅ Due-checking cron completed. Sent ${startWarningsSent} start warnings, ${overdueAlertsSent} overdue alerts, and ${meetingRemindersSent} meet reminders.`)

    return NextResponse.json({
      success: true,
      startWarningsSent,
      overdueAlertsSent,
      meetingRemindersSent
    })
  } catch (error) {
    console.error('❌ Due-checking cron failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal Server Error'
    }, { status: 500 })
  }
}
