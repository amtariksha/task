import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Text, ActivityIndicator, Surface } from 'react-native-paper'
import { DashboardSkeleton } from '../components/SkeletonLoaders'
import { useNavigation } from '@react-navigation/native'
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated'
import { useTheme } from '../contexts/ThemeContext'
import { useProjectFilter } from '../contexts/ProjectFilterContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialTypography, materialSpacing, materialElevation } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { getUserToken, getUserData } from '../utils/secureStorage'
import apiClient from '../services/apiClient'

import { useTabBarControl } from '../context/TabBarContext'
import AppHeader from '../components/AppHeader'
import DailyAttendanceCard from '../components/home/DailyAttendanceCard'

export default function DashboardScreen() {
  const navigation = useNavigation()
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()

  const { selectedProjectIds } = useProjectFilter()
  const [user, setUser] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const filteredTasks = useMemo(() => {
    if (!selectedProjectIds || selectedProjectIds.length === 0) {
      return tasks
    }
    return tasks.filter(task => task.projectId && selectedProjectIds.includes(task.projectId))
  }, [tasks, selectedProjectIds])

  const { handleScroll } = useTabBarControl()
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: handleScroll
  })

  const loadData = useCallback(async () => {
    try {
      const userData = await getUserData()
      let tasksData = []
      if (userData) {
        setUser(userData)
        const response = await apiClient.get(`/api/tasks/user/${userData.employeeId}`)
        tasksData = response.data || []
      } else {
        const response = await apiClient.get('/api/tasks')
        tasksData = response.data || []
      }
      setTasks(tasksData)
    } catch (error) {
      console.error('Failed to load data:', error)
      Alert.alert('Error', 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Karmayog"
      />
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >

        {/* Daily Attendance */}
        <View style={styles.section}>
          <DailyAttendanceCard />
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <Card style={styles.statCard} elevation={1}>
            <Card.Content style={styles.statCardContent}>
              <Text style={styles.statNumber}>{filteredTasks.length}</Text>
              <Text style={styles.statLabel}>Total Tasks</Text>
            </Card.Content>
          </Card>
          <Card style={styles.statCard} elevation={1}>
            <Card.Content style={styles.statCardContent}>
              <Text style={styles.statNumber}>
                {filteredTasks.filter((t) => t.status === 'In Progress').length}
              </Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </Card.Content>
          </Card>
          <Card style={styles.statCard} elevation={1}>
            <Card.Content style={styles.statCardContent}>
              <Text style={styles.statNumber}>
                {filteredTasks.filter((t) => t.status === 'Done').length}
              </Text>
              <Text style={styles.statLabel}>Completed</Text>
            </Card.Content>
          </Card>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.actionsScrollView}
            contentContainerStyle={styles.actionsScrollContent}
          >
            <Card style={styles.actionCardHorizontal} elevation={1} onPress={() => (navigation as any).navigate('CreateTask')}>
              <Card.Content>
                <Text style={styles.actionTitle}>➕ Create Task</Text>
                <Text style={styles.actionDescription}>Create a new task</Text>
              </Card.Content>
            </Card>

            <Card style={styles.actionCardHorizontal} elevation={1} onPress={() => (navigation as any).navigate('CreateBug')}>
              <Card.Content>
                <Text style={styles.actionTitle}>🐛 Report Bug or Feature</Text>
                <Text style={styles.actionDescription}>Log a bug, feature request or release</Text>
              </Card.Content>
            </Card>

            <Card style={styles.actionCardHorizontal} elevation={1} onPress={() => (navigation as any).navigate('FeedTab')}>
              <Card.Content>
                <Text style={styles.actionTitle}>📰 Feed</Text>
                <Text style={styles.actionDescription}>View team feed and updates</Text>
              </Card.Content>
            </Card>

            <Card style={styles.actionCardHorizontal} elevation={1} onPress={() => (navigation as any).navigate('LeaveList')}>
              <Card.Content>
                <Text style={styles.actionTitle}>🏖️ Leave</Text>
                <Text style={styles.actionDescription}>Apply for leave</Text>
              </Card.Content>
            </Card>

            <Card style={styles.actionCardHorizontal} elevation={1} onPress={() => (navigation as any).navigate('WFHList')}>
              <Card.Content>
                <Text style={styles.actionTitle}>🏠 WFH</Text>
                <Text style={styles.actionDescription}>Work from home requests</Text>
              </Card.Content>
            </Card>
          </Animated.ScrollView>
        </View>

        {/* Recent Tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Tasks</Text>
          {filteredTasks.length === 0 ? (
            <Card style={styles.emptyCard} elevation={0}>
              <Card.Content>
                <Text style={styles.emptyText}>No tasks yet</Text>
              </Card.Content>
            </Card>
          ) : (
            filteredTasks.slice(0, 5).map((task) => (
              <Card key={task.taskId} style={styles.taskCard} elevation={1}>
                <Card.Content>
                  <Text style={styles.taskTitle}>{task.name || task.description}</Text>
                  <Text style={styles.taskStatus}>{task.status}</Text>
                </Card.Content>
              </Card>
            ))
          )}
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    ...materialTypography.bodyLarge,
    color: colors.textSecondary,
    marginTop: materialSpacing.md,
  },
  welcomeSection: {
    paddingHorizontal: materialSpacing.lg,
    paddingVertical: materialSpacing.md,
  },
  welcomeSub: {
    fontSize: 16,
    fontWeight: '400',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  welcomeRole: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: materialSpacing.md,
    gap: materialSpacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  statCardContent: {
    alignItems: 'center',
  },
  statNumber: {
    ...materialTypography.headlineLarge,
    color: colors.primary,
  },
  statLabel: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: materialSpacing.xs,
  },
  section: {
    padding: materialSpacing.md,
  },
  sectionTitle: {
    ...materialTypography.titleLarge,
    color: colors.text,
    marginBottom: materialSpacing.md,
  },
  actionsScrollView: {
    flexGrow: 0,
  },
  actionsScrollContent: {
    paddingVertical: materialSpacing.xs,
    paddingRight: materialSpacing.md,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: materialSpacing.sm,
  },
  actionCardHorizontal: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginRight: materialSpacing.md,
    width: 200,
  },
  actionTitle: {
    ...materialTypography.titleMedium,
    color: colors.text,
    marginBottom: materialSpacing.xs,
  },
  actionDescription: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: materialSpacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  taskTitle: {
    ...materialTypography.bodyLarge,
    color: colors.text,
    fontWeight: '600',
  },
  taskStatus: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: materialSpacing.xs,
  },
  emptyCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
  },
  emptyText: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  logoutButton: {
    borderRadius: 8,
  },
})
