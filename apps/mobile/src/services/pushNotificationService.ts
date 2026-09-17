/**
 * Push Notification Service
 * 
 * Handles push notification registration, permissions, and listeners
 * using Expo Notifications API. Dynamically required to prevent crashes in Expo Go (SDK 53+).
 */

import { Platform } from 'react-native'
import Constants from 'expo-constants'

// Safe dynamic import for expo-notifications to prevent Expo Go SDK 53 crash
let Notifications: any = null
try {
  const isExpoGo = Constants.appOwnership === 'expo'
  if (!isExpoGo && Platform.OS !== 'web') {
    Notifications = require('expo-notifications')
    
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })
    console.log('✅ Push notification service initialized successfully')
  } else {
    console.log('ℹ️ Running in Expo Go: Bypassing native notifications module to prevent crashes/warnings.')
  }
} catch (error) {
  console.warn('⚠️ Failed to load expo-notifications:', error)
}

export interface PushNotificationData {
  [key: string]: string | undefined
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

/**
 * Request push notification permissions and get Expo push token
 * @returns Expo push token or null if permission denied
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Notifications) {
      return null
    }

    // Check if running on native platform (push notifications don't work on web)
    if (Platform.OS === 'web') {
      return null
    }

    // Get existing permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    // Return null if permission denied
    if (finalStatus !== 'granted') {
      console.warn('Push notification permission denied')
      return null
    }

    // Skip remote push token registration in Expo Go to prevent crashes/credential errors
    const isExpoGo = Constants.appOwnership === 'expo'
    if (isExpoGo) {
      console.log('ℹ️ Running in Expo Go: Skipping remote push token registration (Local notifications are active)')
      return null
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
      })

      // Create additional channels for different notification types
      await Notifications.setNotificationChannelAsync('tasks', {
        name: 'Tasks',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
      })

      await Notifications.setNotificationChannelAsync('bugs', {
        name: 'Bugs',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#B00020',
      })

      await Notifications.setNotificationChannelAsync('social', {
        name: 'Social',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: '#1976D2',
      })
    }

    return tokenData.data
  } catch (error: any) {
    console.error('❌ Detailed Push Notification Registration Error:', error);
    return null
  }
}

/**
 * Setup notification listeners for foreground, background, and tap events
 * @param onNotificationReceived Callback when notification received in foreground
 * @param onNotificationTapped Callback when notification tapped
 * @returns Cleanup function to remove listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: any) => void,
  onNotificationTapped?: (response: any) => void
): () => void {
  if (!Notifications) {
    return () => {}
  }

  // Listener for notifications received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('Notification received in foreground:', notification)
    if (onNotificationReceived) {
      onNotificationReceived(notification)
    }
  })

  // Listener for notification tap (user tapped notification)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('Notification tapped:', response)
    if (onNotificationTapped) {
      onNotificationTapped(response)
    }
  })

  // Return cleanup function
  return () => {
    receivedSubscription.remove()
    responseSubscription.remove()
  }
}

/**
 * Schedule a local notification (for offline scenarios)
 * @param title Notification title
 * @param body Notification body
 * @param data Additional data to pass with notification
 * @param trigger When to trigger notification (default: immediately)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: PushNotificationData,
  trigger?: any
): Promise<string> {
  if (!Notifications) {
    return ''
  }
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: trigger || null, // null = immediately
  })
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (!Notifications) return
  await Notifications.cancelAllScheduledNotificationsAsync()
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  if (!Notifications) return 0
  return await Notifications.getBadgeCountAsync()
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (!Notifications) return
  await Notifications.setBadgeCountAsync(count)
}
