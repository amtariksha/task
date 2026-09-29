import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  FlatList,
  Alert,
} from 'react-native'
import { Card, Text, Button, ActivityIndicator, Chip } from 'react-native-paper'
import { useTheme } from '../contexts/ThemeContext'
import { useProjectFilter } from '../contexts/ProjectFilterContext'
import { SearchablePicker } from '../components/SearchablePicker'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { getUserData } from '../utils/secureStorage'
import { materialSpacing, materialTypography, materialColors } from '../config/materialTheme'
import { useResponsive } from '../hooks/useResponsive'
import { formatDateIST } from '../utils/datetime'
import { get, put } from '../services/apiClient'

interface User {
  employeeId: string
  name: string
  department: string
  role: string
}

interface Task {
  id: string
  taskId: string
  name: string
  description: string
  status: string
  priority: string
  assignedTo: string | string[]
  support?: string[]
  dailyHours?: string
  estimatedHours: number
  actualHours?: number
  remarks?: string
  difficulties?: string
  startDate: string
  endDate: string
}

export default function TeamTasksScreen() {
  const { selectedProjectIds } = useProjectFilter()
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<User[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])

  const filteredTasks = useMemo(() => {
    if (!selectedProjectIds || selectedProjectIds.length === 0) {
      return tasks
    }
    return tasks.filter(task => {
      const pId = (task as any).projectId
      return pId && selectedProjectIds.includes(pId)
    })
  }, [tasks, selectedProjectIds])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  // Load team members based on role
  const loadTeam = useCallback(async () => {
    try {
      setLoadingMembers(true)
      const user = await getUserData()
      if (!user) return
      setCurrentUser(user)

      const roleLower = user.role?.toLowerCase()
      const showAll = ['admin', 'top_management'].includes(roleLower)

      let membersList: User[] = []

      if (showAll) {
        // Fetch all users
        const result = await get('/api/users')
        membersList = result.success ? result.data : []
      } else {
        // Fetch the whole reporting subtree, not just direct reports. Managers
        // can have managers, so a senior manager needs to see their skip-level
        // reports' work too — matching the web app.
        const result = await get(`/api/users/team/${user.employeeId}?recursive=true`)
        membersList = result.success ? result.data : []
      }

      // Filter active employees only
      let activeMembers = membersList.filter((m: any) => m.status !== 'inactive')

      // Scoping: If project filter is active, only show the logged-in user
      if (selectedProjectIds && selectedProjectIds.length > 0) {
        activeMembers = activeMembers.filter((m: any) => m.employeeId === user.employeeId)
      }

      setTeamMembers(activeMembers)

      if (activeMembers.length > 0) {
        setSelectedEmployee(prev => {
          if (prev && activeMembers.some(m => m.employeeId === prev)) {
            return prev
          }
          return activeMembers[0].employeeId
        })
      } else {
        setSelectedEmployee('')
      }
    } catch (e) {
      console.error('Failed to load team members:', e)
      Alert.alert('Error', 'Failed to load team members')
    } finally {
      setLoadingMembers(false)
    }
  }, [selectedProjectIds])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  // Load tasks for selected employee
  const loadTasks = useCallback(async () => {
    if (!selectedEmployee) return
    try {
      setLoadingTasks(true)
      const result = await get(`/api/tasks/user/${selectedEmployee}`)
      if (result.success && result.data) {
        setTasks(result.data || [])
        setTasksError('')
      } else {
        // A 403 from the server's per-user access check looked identical to
        // "this person has no tasks". Show what the server actually said.
        setTasks([])
        setTasksError(result.error || 'Could not load tasks for this person.')
      }
    } catch (e) {
      console.error('Failed to load tasks:', e)
      setTasks([])
      setTasksError('Could not load tasks. Check your connection and try again.')
    } finally {
      setLoadingTasks(false)
      setRefreshing(false)
    }
  }, [selectedEmployee])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadTasks()
  }, [loadTasks])

  // Quick action: mark task as In Progress
  const markAsInProgress = async (task: Task) => {
    try {
      setUpdatingTaskId(task.id)
      const response = await put(`/api/tasks/${task.id}`, {
        status: 'In Progress'
      })

      if (response.success) {
        Alert.alert('Success', `Task ${task.taskId} marked as In Progress`)
        loadTasks()
      } else {
        Alert.alert('Error', response.error || 'Failed to update task status')
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'Failed to update task status')
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Yet to Start': return colors.textSecondary
      case 'In Progress': return colors.primary
      case 'Done': return colors.success
      case 'Delayed': return colors.error
      case 'Hold': return colors.warning
      default: return colors.textSecondary
    }
  }

  const getPriorityColor = (priority: string) => {
    if (priority === 'U&I') return colors.error
    if (priority === 'NU&I') return colors.warning
    if (priority === 'U&NI') return colors.primary
    return colors.textSecondary
  }

  const renderTaskItem = ({ item }: { item: Task }) => {
    const showProgressBtn = item.status === 'Yet to Start'

    return (
      <Card style={styles.taskCard}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Chip style={styles.taskIdChip} compact>{item.taskId}</Chip>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip style={[styles.statusChip, { backgroundColor: getStatusColor(item.status) + '15' }]} textStyle={{ color: getStatusColor(item.status), fontWeight: 'bold', fontSize: 10 }} compact>
                {item.status}
              </Chip>
              <Chip style={[styles.priorityChip, { backgroundColor: getPriorityColor(item.priority) + '15' }]} textStyle={{ color: getPriorityColor(item.priority), fontWeight: 'bold', fontSize: 10 }} compact>
                {item.priority}
              </Chip>
            </View>
          </View>

          <Text style={styles.taskTitle}>{item.name}</Text>
          <Text style={styles.taskDesc} numberOfLines={3}>{item.description}</Text>

          <View style={styles.divider} />

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Start Date</Text>
              <Text style={styles.metaValue}>{formatDateIST(item.startDate)}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>End Date</Text>
              <Text style={styles.metaValue}>{formatDateIST(item.endDate)}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Est. Hours</Text>
              <Text style={styles.metaValue}>{item.estimatedHours}h</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Act. Hours</Text>
              <Text style={styles.metaValue}>{item.actualHours || 0}h</Text>
            </View>
          </View>

          {item.remarks ? (
            <View style={styles.logBox}>
              <Text style={styles.logLabel}>Remarks:</Text>
              <Text style={styles.logText}>{item.remarks}</Text>
            </View>
          ) : null}

          {item.difficulties ? (
            <View style={[styles.logBox, { backgroundColor: colors.errorLight }]}>
              <Text style={[styles.logLabel, { color: colors.error }]}>Difficulties:</Text>
              <Text style={styles.logText}>{item.difficulties}</Text>
            </View>
          ) : null}

          {item.support && item.support.length > 0 ? (
            <View style={[styles.logBox, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.logLabel, { color: colors.primary }]}>Support Members:</Text>
              <Text style={styles.logText}>{item.support.join(', ')}</Text>
            </View>
          ) : null}

          {showProgressBtn && (
            <Button
              mode="contained"
              icon="play"
              style={styles.actionBtn}
              onPress={() => markAsInProgress(item)}
              loading={updatingTaskId === item.id}
              disabled={updatingTaskId !== null}
              buttonColor={colors.primary}
              textColor="white"
            >
              Start Progress
            </Button>
          )}
        </Card.Content>
      </Card>
    )
  }

  const selectedMemberDetails = useMemo(() => {
    return teamMembers.find(m => m.employeeId === selectedEmployee)
  }, [teamMembers, selectedEmployee])

  return (
    <View style={styles.container}>
      {loadingMembers ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : teamMembers.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="account-multiple-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No team members assigned</Text>
        </View>
      ) : (
        <>
          {/* Member Picker */}
          <View style={styles.pickerContainer}>
            <SearchablePicker
              label="Team Member"
              selectedValue={selectedEmployee}
              onValueChange={(val) => setSelectedEmployee(val)}
              items={teamMembers.map(m => ({
                label: m.name,
                value: m.employeeId,
              }))}
            />
          </View>

          {/* Member Profile Overview */}
          {selectedMemberDetails && (
            <Card style={styles.profileCard} elevation={0}>
              <Card.Content style={styles.profileCardContent}>
                <View>
                  <Text style={styles.profileName}>{selectedMemberDetails.name}</Text>
                  <Text style={styles.profileSub}>{selectedMemberDetails.employeeId} • {selectedMemberDetails.department}</Text>
                </View>
                <Chip style={styles.roleChip} textStyle={styles.roleChipText} compact>{selectedMemberDetails.role}</Chip>
              </Card.Content>
            </Card>
          )}

          {loadingTasks && filteredTasks.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredTasks}
              renderItem={renderTaskItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
              }
              ListEmptyComponent={
                <View style={styles.centered}>
                  <MaterialCommunityIcons
                    name={tasksError ? 'lock-outline' : 'checkbox-marked-circle-outline'}
                    size={64}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.emptyText}>
                    {tasksError || 'No tasks assigned to this member'}
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: materialSpacing.xl,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: materialSpacing.md,
    paddingVertical: materialSpacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerLabel: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    fontWeight: '600',
    marginRight: 10,
  },
  pickerWrapper: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.background,
    overflow: 'hidden',
    height: 45,
    justifyContent: 'center',
  },
  profileCard: {
    marginHorizontal: materialSpacing.md,
    marginTop: materialSpacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  profileCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: materialSpacing.sm,
  },
  profileName: {
    ...materialTypography.titleMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  profileSub: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleChip: {
    backgroundColor: colors.surfaceVariant,
  },
  roleChipText: {
    fontSize: 10,
    textTransform: 'capitalize',
  },
  listContent: {
    padding: materialSpacing.md,
    paddingBottom: materialSpacing.xl,
  },
  taskCard: {
    marginBottom: materialSpacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: materialSpacing.sm,
  },
  taskIdChip: {
    backgroundColor: colors.surfaceVariant,
  },
  statusChip: {},
  priorityChip: {},
  taskTitle: {
    ...materialTypography.titleMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  taskDesc: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: materialSpacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: materialSpacing.xs,
  },
  metaCol: {
    alignItems: 'center',
    flex: 1,
  },
  metaLabel: {
    ...materialTypography.labelSmall,
    color: colors.textSecondary,
  },
  metaValue: {
    ...materialTypography.bodySmall,
    color: colors.text,
    fontWeight: 'bold',
    marginTop: 2,
  },
  logBox: {
    backgroundColor: colors.surfaceVariant,
    padding: materialSpacing.sm,
    borderRadius: 8,
    marginTop: materialSpacing.sm,
  },
  logLabel: {
    ...materialTypography.labelSmall,
    fontWeight: 'bold',
    color: colors.text,
  },
  logText: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionBtn: {
    marginTop: materialSpacing.md,
    borderRadius: 8,
  },
  emptyText: {
    ...materialTypography.bodyLarge,
    color: colors.textSecondary,
    marginTop: materialSpacing.md,
  },
})
