/**
 * GraphQL Resolvers for Feed Notifications
 * 
 * Handles all notification-related queries and mutations including:
 * - Fetching notifications with filters
 * - Marking notifications as read
 * - Deleting notifications
 * - Unread count
 */

import DataLoader from 'dataloader'
import { getPool } from '@/lib/db'
import { isPlatformAdmin } from '@/lib/authz'
import { getDefaultCompanyId, isMemberOfCompany } from '@/lib/db/companies'
import {
  assertCanAccessNotificationsOf,
  requireNotificationActor,
  resolveNotificationRecipient,
  type NotificationAccessDeps,
  type NotificationActor,
} from '@/lib/notifications/notification-access'

const getPoolInstance = () => getPool()

const accessDeps: NotificationAccessDeps = { isPlatformAdmin, getDefaultCompanyId, isMemberOfCompany }

/** The notification row, or null when it does not exist; FORBIDDEN when it is not the actor's to see. */
async function loadAccessibleNotification(actor: NotificationActor, context: any, notificationId: string) {
  const notification = await context.loaders.notificationLoader.load(notificationId)
  if (!notification) return null
  await assertCanAccessNotificationsOf(actor, notification.user_id, accessDeps)
  return notification
}

// DataLoader for batching notification queries
export const createNotificationLoader = () => new DataLoader(async (notificationIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM feed_notifications WHERE notification_id = ANY($1) AND deleted_at IS NULL',
    [notificationIds]
  )

  const notificationMap = new Map(result.rows.map((notification: any) => [notification.notification_id, notification]))
  return notificationIds.map(id => notificationMap.get(id) || null)
})

// Query resolvers
export const notificationQueries = {
  // Get notifications with optional filters
  feedNotifications: async (_: any, args: { 
    userId?: string
    isRead?: boolean
    notificationType?: string
    limit?: number
    offset?: number
  }, context: any) => {
    const actor = requireNotificationActor(context)
    const { userId: requestedUserId, isRead, notificationType, limit = 50, offset = 0 } = args
    const userId = await resolveNotificationRecipient(actor, requestedUserId, accessDeps)

    let query = 'SELECT * FROM feed_notifications WHERE deleted_at IS NULL AND user_id = $1'
    const params: any[] = [userId]
    let paramIndex = 2

    if (isRead !== undefined) {
      query += ` AND is_read = $${paramIndex}`
      params.push(isRead)
      paramIndex++
    }

    if (notificationType) {
      query += ` AND notification_type = $${paramIndex}`
      params.push(notificationType)
      paramIndex++
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(limit, offset)

    const result = await getPoolInstance().query(query, params)
    return result.rows
  },

  // Get single notification by ID
  feedNotification: async (_: any, { notificationId }: { notificationId: string }, context: any) => {
    const actor = requireNotificationActor(context)
    return loadAccessibleNotification(actor, context, notificationId)
  },

  // Get unread notification count for a user
  unreadNotificationCount: async (_: any, { userId }: { userId: string }, context: any) => {
    const actor = requireNotificationActor(context)
    const scopedUserId = await resolveNotificationRecipient(actor, userId, accessDeps)
    const result = await getPoolInstance().query(
      'SELECT COUNT(*) as count FROM feed_notifications WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL',
      [scopedUserId]
    )
    return parseInt(result.rows[0]?.count || '0', 10)
  }
}

// Mutation resolvers
export const notificationMutations = {
  // Mark a notification as read
  markNotificationAsRead: async (_: any, { notificationId }: { notificationId: string }, context: any) => {
    const actor = requireNotificationActor(context)
    const notification = await loadAccessibleNotification(actor, context, notificationId)
    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`)
    }

    // user_id repeats the checked owner so the update cannot touch any other row.
    const result = await getPoolInstance().query(
      `UPDATE feed_notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE notification_id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [notificationId, notification.user_id]
    )

    if (result.rows.length === 0) {
      throw new Error(`Notification ${notificationId} not found`)
    }

    return result.rows[0]
  },

  // Mark all notifications as read for a user
  markAllNotificationsAsRead: async (_: any, { userId }: { userId: string }, context: any) => {
    const actor = requireNotificationActor(context)
    const scopedUserId = await resolveNotificationRecipient(actor, userId, accessDeps)
    await getPoolInstance().query(
      `UPDATE feed_notifications
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL`,
      [scopedUserId]
    )
    return true
  },

  // Delete a notification (soft delete)
  deleteNotification: async (_: any, { notificationId }: { notificationId: string }, context: any) => {
    const actor = requireNotificationActor(context)
    const notification = await loadAccessibleNotification(actor, context, notificationId)
    if (!notification) return false

    const result = await getPoolInstance().query(
      `UPDATE feed_notifications
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
       WHERE notification_id = $1 AND user_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [notificationId, actor.employeeId, notification.user_id]
    )

    return result.rows.length > 0
  }
}

// Field resolvers for FeedNotification type
export const FeedNotificationFieldResolvers = {
  // Map snake_case database columns to camelCase GraphQL fields
  notificationId: (notification: any) => notification.notification_id,
  userId: (notification: any) => notification.user_id,
  actorId: (notification: any) => notification.actor_id,
  notificationType: (notification: any) => notification.notification_type,
  postId: (notification: any) => notification.post_id,
  commentId: (notification: any) => notification.comment_id,
  mentionId: (notification: any) => notification.mention_id,
  taskId: (notification: any) => notification.task_id,
  bugId: (notification: any) => notification.bug_id,
  title: (notification: any) => notification.title,
  message: (notification: any) => notification.message,
  linkUrl: (notification: any) => notification.link_url,
  metadata: (notification: any) => notification.metadata ? JSON.stringify(notification.metadata) : null,
  isRead: (notification: any) => notification.is_read,
  readAt: (notification: any) => notification.read_at,
  createdAt: (notification: any) => notification.created_at,

  // Related entities via DataLoader
  user: async (notification: any, _: any, { loaders }: any) => {
    if (!notification.user_id) return null
    if (notification.user_id === 'system') {
      return {
        employeeId: 'system',
        name: 'System',
        email: 'system@karmayog.com',
        role: 'system',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [],
        bugs: []
      }
    }
    try {
      return await loaders.userLoader.load(notification.user_id)
    } catch (error) {
      console.error(`[FeedNotification.user] Failed to load user ${notification.user_id}:`, error)
      return null
    }
  },

  actor: async (notification: any, _: any, { loaders }: any) => {
    if (!notification.actor_id) return null
    if (notification.actor_id === 'system') {
      return {
        employeeId: 'system',
        name: 'System',
        email: 'system@karmayog.com',
        role: 'system',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: [],
        bugs: []
      }
    }
    try {
      return await loaders.userLoader.load(notification.actor_id)
    } catch (error) {
      console.error(`[FeedNotification.actor] Failed to load actor ${notification.actor_id}:`, error)
      return null
    }
  },

  post: async (notification: any, _: any, { loaders }: any) => {
    if (!notification.post_id) return null
    try {
      return await loaders.feedPost.load(notification.post_id)
    } catch (error) {
      console.error(`[FeedNotification.post] Failed to load post ${notification.post_id}:`, error)
      return null
    }
  },

  comment: async (notification: any, _: any, { loaders }: any) => {
    if (!notification.comment_id) return null
    // Note: We don't have a comment loader yet, will need to add one
    const result = await getPoolInstance().query(
      'SELECT * FROM feed_comments WHERE comment_id = $1 AND deleted_at IS NULL',
      [notification.comment_id]
    )
    return result.rows[0] || null
  },

  mention: async (notification: any, _: any, { loaders }: any) => {
    if (!notification.mention_id) return null
    // Note: We don't have a mention loader yet, will need to add one
    const result = await getPoolInstance().query(
      'SELECT * FROM feed_mentions WHERE mention_id = $1 AND deleted_at IS NULL',
      [notification.mention_id]
    )
    return result.rows[0] || null
  }
}

