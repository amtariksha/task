/**
 * Notification Helper Functions
 *
 * Utilities for creating and managing feed notifications
 */

import { getPool } from '@/lib/db'
import { sendPushNotification, getNotificationPriority } from './push-notification-service'
import { shouldNotify, getNotificationPreferences } from '@/lib/db/notificationPreferences'
import { emailService } from './email/service'

const getPoolInstance = () => getPool()

export interface CreateNotificationParams {
  userId: string // recipient
  actorId: string // who triggered the notification
  notificationType: string
  postId?: string
  commentId?: string
  mentionId?: string
  taskId?: string
  bugId?: string
  title: string
  message?: string
  linkUrl?: string
  metadata?: Record<string, any>
  /** Push/in-app only — e.g. the founder Start push, which must not also email. */
  skipEmail?: boolean
}

function mapNotificationTypeToPrefKey(type: string): string | null {
  switch (type) {
    case 'mention': return 'taskCommented'
    case 'comment': return 'taskCommented'
    case 'reaction': return 'taskCommented'
    case 'task_assigned': return 'taskAssigned'
    case 'task_updated': return 'taskUpdated'
    case 'task_completed': return 'taskCompleted'
    case 'task_support_assigned': return 'taskSupportAssigned'
    case 'task_due_soon': return 'taskDueSoon'
    case 'task_overdue': return 'taskOverdue'
    case 'bug_assigned': return 'bugAssigned'
    case 'bug_updated': return 'bugUpdated'
    case 'bug_status_changed': return 'bugStatusChanged'
    case 'bug_severity_changed': return 'bugSeverityChanged'
    case 'leave_approved': return 'leaveApproved'
    case 'leave_rejected': return 'leaveRejected'
    case 'wfh_approved': return 'wfhApproved'
    case 'wfh_rejected': return 'wfhRejected'
    case 'leave_pending_approval': return 'leavePendingApproval'
    case 'wfh_pending_approval': return 'wfhPendingApproval'
    case 'task_commented': return 'taskCommented'
    case 'bug_commented': return 'bugCommented'
    // Requirements module — map to existing bug-class pref keys initially
    // (no dedicated requirement pref keys yet, avoids a prefs migration).
    case 'requirement_review_requested': return 'bugAssigned'
    case 'requirement_approved': return 'bugUpdated'
    case 'requirement_rejected': return 'bugUpdated'
    case 'requirement_updated_after_approval': return 'bugUpdated'
    case 'requirement_dev_item_created': return 'bugAssigned'
    default: return null
  }
}

/**
 * Helper to automatically send email notifications linked to in-app alerts
 */
async function sendNotificationEmail(
  params: CreateNotificationParams,
  notificationType: string,
  title: string,
  message?: string,
  linkUrl?: string,
  metadata?: any
) {
  const { userId, actorId, taskId, bugId } = params

  try {
    const prefKey = mapNotificationTypeToPrefKey(notificationType)
    let emailAllowed = false
    if (prefKey) {
      emailAllowed = await shouldNotify(userId, prefKey as any, 'email').catch(() => false)
    } else {
      const prefs = await getNotificationPreferences(userId).catch(() => null)
      emailAllowed = prefs ? prefs.emailEnabled : true
    }

    if (!emailAllowed || !emailService.isAvailable()) {
      return
    }

    // Get recipient details
    const userResult = await getPoolInstance().query(
      `SELECT email, name FROM users WHERE employee_id = $1 LIMIT 1`,
      [userId]
    )
    if (userResult.rows.length === 0 || !userResult.rows[0].email) {
      return
    }
    const recipient = userResult.rows[0]

    // Get actor details
    const actorResult = await getPoolInstance().query(
      `SELECT name FROM users WHERE employee_id = $1 LIMIT 1`,
      [actorId]
    )
    const actorName = actorResult.rows[0]?.name || 'Someone'

    // Specialized email types:
    if (notificationType === 'task_assigned' && taskId) {
      const taskResult = await getPoolInstance().query(
        `SELECT * FROM tasks WHERE task_id = $1 LIMIT 1`,
        [taskId]
      )
      if (taskResult.rows.length > 0) {
        const task = taskResult.rows[0]
        const assigneeResult = await getPoolInstance().query(
          `SELECT name FROM users WHERE employee_id = $1 LIMIT 1`,
          [task.assigned_to]
        )
        const assigneeName = assigneeResult.rows[0]?.name || recipient.name

        await emailService.sendTaskAssignedEmail({
          assigneeName,
          assigneeEmail: recipient.email,
          taskTitle: task.description,
          taskDescription: task.remarks || 'No remarks provided',
          priority: task.priority || 'Medium',
          dueDate: task.end_date ? new Date(task.end_date).toLocaleDateString() : 'Not specified',
          assignedBy: actorName,
          taskId: task.task_id
        })
        return
      }
    }

    if (notificationType === 'task_support_assigned' && taskId) {
      const taskResult = await getPoolInstance().query(
        `SELECT * FROM tasks WHERE task_id = $1 LIMIT 1`,
        [taskId]
      )
      if (taskResult.rows.length > 0) {
        const task = taskResult.rows[0]
        const match = task.remarks?.match(/Support task for main task: (.+)/)
        const mainTaskId = match ? match[1] : 'Unknown'

        await emailService.sendSupportAssignedEmail({
          supportMemberEmail: recipient.email,
          supportMemberName: recipient.name,
          mainTaskId: mainTaskId,
          mainTaskDescription: task.description.replace('[SUPPORT] ', ''),
          priority: task.priority || 'Medium',
          dueDate: task.end_date ? new Date(task.end_date).toLocaleDateString() : 'Not specified',
          assignedBy: actorName,
          supportTaskId: task.task_id
        })
        return
      }
    }

    if (notificationType === 'bug_assigned' && bugId) {
      const bugResult = await getPoolInstance().query(
        `SELECT * FROM bugs WHERE bug_id = $1 LIMIT 1`,
        [bugId]
      )
      if (bugResult.rows.length > 0) {
        const bug = bugResult.rows[0]
        await emailService.sendBugAssignedEmail({
          assigneeEmail: recipient.email,
          assigneeName: recipient.name,
          assignedByName: actorName,
          bugId: bug.bug_id,
          bugTitle: bug.title,
          bugDescription: bug.description,
          severity: bug.severity || 'Minor',
          priority: bug.priority || 'Low',
          category: bug.category || 'Other',
          platform: bug.platform || 'Web',
          environment: bug.environment || 'Production',
          // `SELECT *` already fetched this; passing it keeps a feature request
          // from being announced as a bug.
          type: bug.type
        })
        return
      }
    }

    if ((notificationType === 'leave_approved' || notificationType === 'leave_rejected') && metadata?.leaveId) {
      const leaveResult = await getPoolInstance().query(
        `SELECT * FROM leave_applications WHERE application_id = $1 LIMIT 1`,
        [metadata.leaveId]
      )
      if (leaveResult.rows.length > 0) {
        const leave = leaveResult.rows[0]
        const fromDate = new Date(leave.from_date)
        const toDate = new Date(leave.to_date)
        const timeDiff = toDate.getTime() - fromDate.getTime()
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1

        await emailService.sendLeaveStatusEmail({
          userEmail: recipient.email,
          userName: recipient.name,
          leaveType: leave.leave_type,
          startDate: leave.from_date,
          endDate: leave.to_date,
          days: daysDiff,
          status: notificationType === 'leave_approved' ? 'approved' : 'rejected',
          reason: leave.reason,
          approvedBy: actorName,
          comments: leave.approval_remarks
        })
        return
      }
    }

    if ((notificationType === 'wfh_approved' || notificationType === 'wfh_rejected') && metadata?.wfhId) {
      const wfhResult = await getPoolInstance().query(
        `SELECT * FROM wfh_applications WHERE application_id = $1 LIMIT 1`,
        [metadata.wfhId]
      )
      if (wfhResult.rows.length > 0) {
        const wfh = wfhResult.rows[0]
        await emailService.sendWFHStatusEmail({
          userEmail: recipient.email,
          userName: recipient.name,
          wfhDate: wfh.from_date,
          status: notificationType === 'wfh_approved' ? 'approved' : 'rejected',
          reason: wfh.reason,
          approvedBy: actorName,
          comments: wfh.approval_remarks
        })
        return
      }
    }

    // Default general notification email template
    let actionText = 'View Details'
    if (notificationType.startsWith('task_')) actionText = 'View Task'
    else if (notificationType.startsWith('bug_')) actionText = 'View Bug'
    else if (notificationType === 'mention' || notificationType === 'comment' || notificationType === 'reaction') actionText = 'View Feed'

    await emailService.sendGeneralNotificationEmail({
      userEmail: recipient.email,
      userName: recipient.name,
      actorName,
      notificationTitle: title,
      notificationMessage: message || undefined,
      actionUrl: linkUrl || '/',
      actionText,
      priority: notificationType.startsWith('task_overdue') || notificationType.startsWith('bug_assigned') ? 'high' : 'normal',
      type: (prefKey || 'systemAnnouncements') as any
    })

  } catch (error) {
    console.error('[sendNotificationEmail] Error sending email:', error)
  }
}

/**
 * Create a notification in the database
 */
export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const {
    userId,
    actorId,
    notificationType,
    postId,
    commentId,
    mentionId,
    taskId,
    bugId,
    title,
    message,
    linkUrl,
    metadata
  } = params

  // Don't create notification if user is notifying themselves, except for tasks and bugs
  if (userId === actorId && !taskId && !bugId) {
    return ''
  }

  // Check user preferences
  const prefKey = mapNotificationTypeToPrefKey(notificationType)
  if (prefKey) {
    const isAllowed = await shouldNotify(userId, prefKey as any, 'in_app')
    if (!isAllowed) {
      console.log(`[createNotification] Notification of type ${notificationType} to user ${userId} is disabled by preferences`)
      return ''
    }
  }

  // Generate notification ID
  const notificationId = `NOTIF-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  const result = await getPoolInstance().query(
    `INSERT INTO feed_notifications (
      notification_id, user_id, actor_id, notification_type,
      post_id, comment_id, mention_id, task_id, bug_id,
      title, message, link_url, metadata,
      is_read, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false, CURRENT_TIMESTAMP)
    RETURNING notification_id`,
    [
      notificationId,
      userId,
      actorId,
      notificationType,
      postId || null,
      commentId || null,
      mentionId || null,
      taskId || null,
      bugId || null,
      title,
      message || null,
      linkUrl || null,
      metadata ? JSON.stringify(metadata) : null
    ]
  )

  // Map notification type to push notification type
  const mapNotificationTypeToPushType = (type: string): 'task' | 'bug' | 'leave' | 'wfh' | 'feed' | 'mention' | 'comment' | 'reaction' | undefined => {
    if (['mention', 'comment', 'reaction', 'reply', 'post_approved', 'post_rejected'].includes(type)) {
      return 'feed'
    }
    if (type.startsWith('task_')) return 'task'
    if (type.startsWith('bug_')) return 'bug'
    return type as any
  }

  // Send push notification (don't await - fire and forget)
  sendPushNotification(userId, {
    title,
    body: message || title,
    data: {
      notificationId,
      type: mapNotificationTypeToPushType(notificationType),
      postId,
      commentId,
      taskId,
      bugId,
      linkUrl,
      // Mobile routes on data.screen when set (e.g. the founder Start push).
      screen: typeof metadata?.screen === 'string' ? metadata.screen : undefined
    },
    priority: getNotificationPriority(notificationType.startsWith('task_') ? 'task' : (notificationType.startsWith('bug_') ? 'bug' : notificationType))
  }).catch(error => {
    // Don't fail the notification creation if push notification fails
    console.error('[createNotification] Failed to send push notification:', error)
  })

  // Send email notification (don't await - fire and forget)
  if (!params.skipEmail) {
    sendNotificationEmail(params, notificationType, title, message, linkUrl, metadata).catch(error => {
      console.error('[createNotification] Failed to send email notification:', error)
    })
  }

  return result.rows[0]?.notification_id || ''
}

/**
 * Create notification for a mention
 */
export async function createMentionNotification(
  mentionedUserId: string,
  mentionedByUserId: string,
  mentionId: string,
  postId?: string,
  commentId?: string,
  mentionedByUserName?: string
): Promise<string> {
  const actorName = mentionedByUserName || 'Someone'
  const title = commentId
    ? `${actorName} mentioned you in a comment`
    : `${actorName} mentioned you in a post`

  const linkUrl = postId ? `/feed?post=${postId}` : `/feed`

  return createNotification({
    userId: mentionedUserId,
    actorId: mentionedByUserId,
    notificationType: 'mention',
    postId,
    commentId,
    mentionId,
    title,
    linkUrl
  })
}

/**
 * Create notification for a comment
 */
export async function createCommentNotification(
  postAuthorId: string,
  commentAuthorId: string,
  postId: string,
  commentId: string,
  commentAuthorName?: string
): Promise<string> {
  const actorName = commentAuthorName || 'Someone'
  const title = `${actorName} commented on your post`

  return createNotification({
    userId: postAuthorId,
    actorId: commentAuthorId,
    notificationType: 'comment',
    postId,
    commentId,
    title,
    linkUrl: `/feed?post=${postId}`
  })
}

/**
 * Create notification for a reaction
 */
export async function createReactionNotification(
  postAuthorId: string,
  reactorId: string,
  postId: string,
  emoji: string,
  reactorName?: string
): Promise<string> {
  const actorName = reactorName || 'Someone'
  const title = `${actorName} reacted ${emoji} to your post`

  return createNotification({
    userId: postAuthorId,
    actorId: reactorId,
    notificationType: 'reaction',
    postId,
    title,
    linkUrl: `/feed?post=${postId}`,
    metadata: { emoji }
  })
}

/**
 * Create notification for post approval/rejection
 */
export async function createPostStatusNotification(
  postAuthorId: string,
  reviewerId: string,
  postId: string,
  status: 'approved' | 'rejected',
  reviewerName?: string
): Promise<string> {
  const actorName = reviewerName || 'Someone'
  const title = status === 'approved'
    ? `${actorName} approved your post`
    : `${actorName} rejected your post`

  return createNotification({
    userId: postAuthorId,
    actorId: reviewerId,
    notificationType: status === 'approved' ? 'post_approved' : 'post_rejected',
    postId,
    title,
    linkUrl: `/feed?post=${postId}`
  })
}

