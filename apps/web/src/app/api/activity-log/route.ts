// Activity Log API Routes
// Handles GET (fetch activities) and POST (create activity/comment)

import { NextRequest, NextResponse } from 'next/server'
import {
  getActivityLogByEntity,
  getCommentsByEntity,
  getSystemActivitiesByEntity,
  createActivityLog,
  CreateActivityLogInput
} from '@/lib/db/activityLog'
import { verifyToken, getAuthUser } from '@/lib/auth-server'
import { getTaskById } from '@/lib/db/tasks'
import { getBugById } from '@/lib/db/bugs'
import { getUserByEmployeeId } from '@/lib/db/users'
import { createNotification } from '@/lib/notification-helper'

/**
 * GET /api/activity-log
 * Fetch activity log entries for a specific entity
 * 
 * Query Parameters:
 * - entityType: 'task' | 'bug' | 'leave' | 'wfh' (required)
 * - entityId: string (required)
 * - filter: 'all' | 'comments' | 'activities' (optional, default: 'all')
 * - sortOrder: 'asc' | 'desc' (optional, default: 'desc')
 * 
 * @example
 * GET /api/activity-log?entityType=task&entityId=JSR-001&filter=all&sortOrder=desc
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') as 'task' | 'bug' | 'leave' | 'wfh' | 'requirement' | null
    const entityId = searchParams.get('entityId')
    const filter = searchParams.get('filter') || 'all' // 'all', 'comments', 'activities'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Validate required parameters
    if (!entityType || !entityId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters: entityType and entityId' 
        },
        { status: 400 }
      )
    }

    // Validate entityType
    if (!['task', 'bug', 'leave', 'wfh', 'requirement'].includes(entityType)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid entityType. Must be one of: task, bug, leave, wfh' 
        },
        { status: 400 }
      )
    }

    // Fetch activity log based on filter
    let activities
    switch (filter) {
      case 'comments':
        activities = await getCommentsByEntity(entityType, entityId, sortOrder)
        break
      case 'activities':
        activities = await getSystemActivitiesByEntity(entityType, entityId, sortOrder)
        break
      case 'all':
      default:
        activities = await getActivityLogByEntity(entityType, entityId, sortOrder)
        break
    }

    return NextResponse.json({
      success: true,
      data: activities,
      count: activities.length
    })

  } catch (error) {
    console.error('❌ Error fetching activity log:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity log' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/activity-log
 * Create a new activity log entry or comment
 * 
 * Request Body:
 * {
 *   entityType: 'task' | 'bug' | 'leave' | 'wfh',
 *   entityId: string,
 *   actionType: string,
 *   description: string,
 *   isComment?: boolean,
 *   fieldName?: string,
 *   oldValue?: string,
 *   newValue?: string
 * }
 * 
 * @example
 * // Create a comment
 * POST /api/activity-log
 * {
 *   "entityType": "task",
 *   "entityId": "JSR-001",
 *   "actionType": "comment",
 *   "description": "Working on the API integration",
 *   "isComment": true
 * }
 * 
 * @example
 * // Log a system activity (usually done automatically by other APIs)
 * POST /api/activity-log
 * {
 *   "entityType": "task",
 *   "entityId": "JSR-001",
 *   "actionType": "status_change",
 *   "fieldName": "status",
 *   "oldValue": "Yet to Start",
 *   "newValue": "In Progress",
 *   "description": "Status changed from 'Yet to Start' to 'In Progress'",
 *   "isComment": false
 * }
 */
export async function POST(request: NextRequest) {
  console.log('🔵 [ACTIVITY-LOG] API called')

  let entityType: string | undefined
  let entityId: string | undefined
  let actionType: string | undefined

  try {
    // Verify authentication
    const user = await getAuthUser(request)
    console.log('🔵 [ACTIVITY-LOG] User verified:', user ? user.employeeId : 'null')

    if (!user) {
      console.log('❌ [ACTIVITY-LOG] Invalid token / Unauthorized')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      entityType: bodyEntityType,
      entityId: bodyEntityId,
      actionType: bodyActionType,
      description,
      isComment,
      fieldName,
      oldValue,
      newValue,
      attachments
    } = body

    // Assign to outer scope for error logging
    entityType = bodyEntityType
    entityId = bodyEntityId
    actionType = bodyActionType

    console.log('🔵 [ACTIVITY-LOG] Request:', { entityType, entityId, actionType, isComment, userId: user.employeeId })

    // Validate required fields
    if (!bodyEntityType || !bodyEntityId || !bodyActionType || !description) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: entityType, entityId, actionType, description'
        },
        { status: 400 }
      )
    }

    // Validate entityType
    if (!['task', 'bug', 'leave', 'wfh'].includes(bodyEntityType)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid entityType. Must be one of: task, bug, leave, wfh'
        },
        { status: 400 }
      )
    }

    // Create activity log input
    const activityInput: CreateActivityLogInput = {
      entityType: bodyEntityType,
      entityId: bodyEntityId,
      userId: user.employeeId,
      actionType: bodyActionType,
      description,
      isComment: isComment || false,
      fieldName,
      oldValue,
      newValue,
      attachments
    }

    // Create the activity log entry
    console.log('🔵 [ACTIVITY-LOG] Creating activity log entry...')
    const activity = await createActivityLog(activityInput)
    console.log('✅ [ACTIVITY-LOG] Activity log created successfully:', activity.id)

    // Fire-and-forget comment notifications (non-blocking)
    if (activity.isComment) {
      (async () => {
        try {
          const { entityType, entityId, userId, description } = activity
          const commenter = await getUserByEmployeeId(userId)
          const commenterName = commenter?.name || userId

          if (entityType === 'task') {
            const task = await getTaskById(entityId)
            if (task) {
              const connectedUserIds = new Set<string>()
              
              if (Array.isArray(task.assignedTo)) {
                task.assignedTo.forEach((id: string) => connectedUserIds.add(id))
              } else if (typeof task.assignedTo === 'string' && task.assignedTo) {
                connectedUserIds.add(task.assignedTo)
              }

              if (Array.isArray(task.support)) {
                task.support.forEach((id: string) => connectedUserIds.add(id))
              } else if (typeof task.support === 'string' && task.support) {
                connectedUserIds.add(task.support)
              }

              if (task.assignedBy) connectedUserIds.add(task.assignedBy)

              // Exclude the commenter
              connectedUserIds.delete(userId)

              if (connectedUserIds.size > 0) {
                const title = `New Task Comment`
                const message = `${commenterName} commented: ${description}`
                const recipientsArray = Array.from(connectedUserIds)

                for (const recipientId of recipientsArray) {
                  await createNotification({
                    userId: recipientId,
                    actorId: userId,
                    notificationType: 'task_commented',
                    taskId: entityId,
                    title,
                    message,
                    linkUrl: `/tasks/${entityId}`
                  })
                }
              }
            }
          } else if (entityType === 'bug') {
            const bug = await getBugById(entityId)
            if (bug) {
              const connectedUserIds = new Set<string>()
              if (bug.assignedTo) connectedUserIds.add(bug.assignedTo)
              if (bug.reportedBy) connectedUserIds.add(bug.reportedBy)

              // Exclude the commenter
              connectedUserIds.delete(userId)

              if (connectedUserIds.size > 0) {
                const title = `New Bug Comment`
                const message = `${commenterName} commented: ${description}`
                const recipientsArray = Array.from(connectedUserIds)

                for (const recipientId of recipientsArray) {
                  await createNotification({
                    userId: recipientId,
                    actorId: userId,
                    notificationType: 'bug_commented',
                    bugId: entityId,
                    title,
                    message,
                    linkUrl: `/bugs/${entityId}`
                  })
                }
              }
            }
          }
        } catch (notifError) {
          console.error('⚠️ Failed to process comment notification:', notifError)
        }
      })()
    }

    return NextResponse.json({
      success: true,
      data: activity,
      message: isComment ? 'Comment added successfully' : 'Activity logged successfully'
    })

  } catch (error) {
    console.error('❌ [ACTIVITY-LOG] Error creating activity log:', error)
    // Log what was being recorded; the error itself is logged above.
    console.error('❌ [ACTIVITY-LOG] Error details:', {
      entityType,
      entityId,
      actionType,
      userId: request.cookies.get('token') ? 'authenticated' : 'no token'
    })

    return NextResponse.json(
      { success: false, error: 'Failed to log activity' },
      { status: 500 }
    )
  }
}

