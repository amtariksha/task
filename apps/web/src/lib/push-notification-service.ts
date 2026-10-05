/**
 * Push Notification Service
 * 
 * Sends push notifications to mobile devices using Expo Push Notification API
 */

import { getActivePushTokens, markPushTokenInvalid } from '@/graphql/push-token-resolvers'
import {
  EXPO_PUSH_API_URL,
  buildExpoPushHeaders,
  isPermanentTokenError,
  maskPushToken,
  redactPushTokens,
} from '@/lib/expo-push'

export interface PushNotificationPayload {
  title: string
  body: string
  data?: {
    notificationId?: string
    type?: 'task' | 'bug' | 'leave' | 'wfh' | 'feed' | 'mention' | 'comment' | 'reaction' | 'founder_start'
    screen?: string
    taskId?: string
    bugId?: string
    leaveId?: string
    wfhId?: string
    postId?: string
    commentId?: string
    linkUrl?: string
  }
  sound?: 'default' | null
  badge?: number
  channelId?: string
  priority?: 'default' | 'normal' | 'high'
}

/**
 * Send push notification to a user's devices
 * @param userId User's employee ID
 * @param notification Notification payload
 * @returns Success status
 */
export async function sendPushNotification(
  userId: string,
  notification: PushNotificationPayload
): Promise<boolean> {
  try {
    // Get user's active push tokens
    const pushTokens = await getActivePushTokens(userId)

    if (pushTokens.length === 0) {
      console.log(`[sendPushNotification] No active push tokens for user ${userId}`)
      return false
    }

    // Prepare messages for Expo Push API
    const messages = pushTokens.map(token => ({
      to: token,
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      badge: notification.badge,
      channelId: notification.channelId || getChannelId(notification.data?.type),
      priority: notification.priority || 'high'
    }))

    // Send to Expo Push API
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: buildExpoPushHeaders(),
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      throw new Error(`Expo Push API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()

    // Handle errors from Expo
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i]
        if (ticket.status === 'error') {
          const errorCode = ticket.details?.error
          console.error(
            `[sendPushNotification] Error for token ${maskPushToken(pushTokens[i])}${errorCode ? ` (${errorCode})` : ''}:`,
            redactPushTokens(String(ticket.message ?? ''))
          )

          if (isPermanentTokenError(errorCode)) {
            await markPushTokenInvalid(pushTokens[i])
          }
        }
      }
    }

    console.log(`[sendPushNotification] Sent push notification to ${pushTokens.length} device(s) for user ${userId}`)
    return true
  } catch (error: any) {
    console.error('[sendPushNotification] Error:', error)
    return false
  }
}

/**
 * Send push notifications to multiple users
 * @param userIds Array of user employee IDs
 * @param notification Notification payload
 */
export async function sendPushNotificationToMultipleUsers(
  userIds: string[],
  notification: PushNotificationPayload
): Promise<void> {
  const promises = userIds.map(userId => sendPushNotification(userId, notification))
  await Promise.allSettled(promises)
}

/**
 * Get Android notification channel ID based on notification type
 */
function getChannelId(type?: string): string {
  switch (type) {
    case 'task':
      return 'tasks'
    case 'bug':
      return 'bugs'
    case 'mention':
    case 'comment':
    case 'reaction':
    case 'feed':
      return 'social'
    default:
      return 'default'
  }
}

/**
 * Get notification priority based on type
 */
export function getNotificationPriority(type?: string): 'default' | 'normal' | 'high' {
  switch (type) {
    case 'task':
    case 'bug':
      return 'high'
    case 'leave':
    case 'wfh':
    case 'founder_start':
      return 'high'
    default:
      return 'default'
  }
}

