/**
 * Notifications Screen
 * Displays list of notifications with mark as read functionality
 * 
 * Features:
 * - List of notifications (mentions, comments, reactions, etc.)
 * - Mark as read on tap
 * - Mark all as read button
 * - Pull-to-refresh
 * - Navigate to related content
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { notificationTarget } from '../utils/notificationRouting'
import { getCachedFounderFlag } from '../services/founderFlagService'
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useQuery, useMutation } from '@apollo/client/react'
import {
  GET_NOTIFICATIONS,
  GET_UNREAD_COUNT,
  MARK_NOTIFICATION_READ,
  MARK_ALL_NOTIFICATIONS_READ,
} from '../config/graphql-queries'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { formatDateTimeIST } from '../utils/datetime';

import { getUserData } from '../utils/secureStorage';

interface Notification {
  notificationId: string
  notificationType: string
  title: string
  message: string | null
  linkUrl: string | null
  isRead: boolean
  createdAt: string
  postId: string | null
  commentId: string | null
  mentionId: string | null
  taskId: string | null
  bugId: string | null
  actor: {
    employeeId: string
    name: string
  } | null
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>()
  // FounderStart is only registered in the navigator for a founder, so a
  // founder_start notification must not try to open it for anyone else.
  const [isFounder, setIsFounder] = useState(false)
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    getUserData().then(user => {
      if (user?.employeeId) {
        setUserId(user.employeeId)
      }
    })
    getCachedFounderFlag().then(setIsFounder).catch(() => setIsFounder(false))
  }, [])

  // GraphQL queries and mutations
  const { data, loading, error, refetch } = useQuery<any, any>(GET_NOTIFICATIONS, {
    variables: { userId },
    skip: !userId,
    fetchPolicy: 'cache-and-network',
  })

  useEffect(() => {
    console.log('[NotificationsScreen] userId:', userId)
    if (error) {
      console.error('[NotificationsScreen] error:', error)
    }
    if (data) {
      console.log('[NotificationsScreen] data:', data)
    }
  }, [userId, data, error])

  const [markAsRead] = useMutation<any, any>(MARK_NOTIFICATION_READ, {
    refetchQueries: [
      { query: GET_UNREAD_COUNT, variables: { userId } },
      { query: GET_NOTIFICATIONS, variables: { userId } }
    ]
  })
  const [markAllAsRead] = useMutation<any, any>(MARK_ALL_NOTIFICATIONS_READ, {
    refetchQueries: [
      { query: GET_UNREAD_COUNT, variables: { userId } },
      { query: GET_NOTIFICATIONS, variables: { userId } }
    ]
  })

  const notifications = (data as any)?.feedNotifications || []

  const handleRefresh = useCallback(async () => {
    try {
      if (userId) {
        await refetch()
      }
    } catch (error) {
      console.error('Failed to refresh notifications:', error)
    }
  }, [refetch, userId])

  const handleNotificationPress = useCallback(async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await markAsRead({
          variables: { notificationId: notification.notificationId }
        })
        refetch()
      } catch (error) {
        console.error('Failed to mark as read:', error)
      }
    }

    // Tapping a row used to do nothing but mark it read, while the same
    // notification arriving as a push opened the item. Same mapping for both now.
    const target = notificationTarget(notification, { isFounder })
    if (target.screen === 'Notifications') return // already here
    try {
      navigation.navigate(target.screen, target.params)
    } catch (error) {
      console.error('Could not open this notification:', error)
    }
  }, [markAsRead, refetch, navigation, isFounder])

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead({
        variables: { userId }
      })
      refetch()
      Alert.alert('Success', 'All notifications marked as read')
    } catch (error) {
      Alert.alert('Error', 'Failed to mark all as read')
    }
  }, [markAllAsRead, refetch, userId])

  const getNotificationIcon = useCallback((type: string) => {
    switch (type) {
      case 'mention':
        return '👤'
      case 'comment':
        return '💬'
      case 'reaction':
        return '❤️'
      case 'post_approved':
        return '✅'
      case 'post_rejected':
        return '❌'
      case 'reply':
        return '↩️'
      case 'task_assigned':
        return '📋'
      case 'task_updated':
        return '🔄'
      case 'task_completed':
        return '✅'
      case 'task_support_assigned':
        return '🤝'
      case 'bug_assigned':
        return '🐛'
      case 'bug_updated':
        return '🔧'
      case 'bug_status_changed':
        return '⚡'
      default:
        return '🔔'
    }
  }, [])

  const renderNotification = useCallback(({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        !item.isRead && styles.notificationCardUnread,
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.notificationIcon}>
        <Text style={styles.iconText}>{getNotificationIcon(item.notificationType)}</Text>
      </View>
      <View style={styles.notificationContent}>
        <Text
          style={[
            styles.notificationTitle,
            !item.isRead && styles.notificationTitleUnread,
          ]}
        >
          {item.title}
        </Text>
        {item.message && (
          <Text style={styles.notificationMessage}>
            {item.message}
          </Text>
        )}
        <Text style={styles.notificationTime}>
          {formatDateTimeIST(item.createdAt)}
        </Text>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  ), [styles, handleNotificationPress, getNotificationIcon])

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header with Mark All as Read */}
      {notifications.length > 0 && notifications.some((n: Notification) => !n.isRead) && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllButtonText}>Mark All as Read</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notification List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.notificationId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        }
      />
    </View>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    maxWidth: responsive.maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: responsive.spacing.sm,
    fontSize: responsive.fontSize.md,
    color: colors.textSecondary,
  },
  header: {
    backgroundColor: colors.card,
    padding: responsive.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-end',
  },
  markAllButton: {
    paddingHorizontal: responsive.spacing.md,
    paddingVertical: responsive.spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: responsive.borderRadius.md,
  },
  markAllButtonText: {
    color: colors.card,
    fontSize: responsive.fontSize.sm,
    fontWeight: '600',
  },
  listContent: {
    padding: responsive.spacing.md,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: responsive.borderRadius.lg,
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  notificationCardUnread: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: responsive.spacing.sm,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: responsive.fontSize.md,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  notificationTitleUnread: {
    color: colors.primary,
  },
  notificationMessage: {
    fontSize: responsive.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: responsive.spacing.xxs,
  },
  notificationTime: {
    fontSize: responsive.fontSize.xs,
    color: colors.textTertiary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: responsive.spacing.xs,
  },
  emptyContainer: {
    padding: responsive.spacing.xxl,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: responsive.spacing.md,
  },
  emptyText: {
    fontSize: responsive.fontSize.md,
    color: colors.textTertiary,
    textAlign: 'center',
  },
})


