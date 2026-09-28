/**
 * Task List Screen
 * Displays all tasks with filters and search
 *
 * Features:
 * - GraphQL-based task fetching
 * - Multiple assignee support
 * - Status filtering
 * - Filter persistence with AsyncStorage
 * - Pull-to-refresh
 * - Timer display
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Alert,
  Vibration,
} from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import AsyncStorage from '@react-native-async-storage/async-storage'
import QuickActionsModal from '../components/QuickActionsModal'
import AppHeader from '../components/AppHeader'
import { updateTask } from '../services/taskService'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, Text, FAB, ActivityIndicator, Searchbar, Chip, Button as PaperButton, IconButton, Modal, Portal, Divider } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@apollo/client/react'
import { GET_TASKS, GET_PROJECTS, GET_USERS, GET_SETTINGS } from '../config/graphql-queries'
import { FilterHeader, FilterSection, FilterSearch } from '../components/FilterComponents'
import { ListSkeleton } from '../components/SkeletonLoaders'
import { Task, Project, TaskFilters } from '../types'
import { formatDateIST } from '../utils/datetime'
import { getUserData, save, get, STORAGE_KEYS } from '../utils/secureStorage'
import { getStatusColor, getStatusTextColor, getPriorityColor, getPriorityTextColor } from '../utils/bugHelpers'
import { useTheme } from '../contexts/ThemeContext'
import { useProjectFilter } from '../contexts/ProjectFilterContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing, materialElevation } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useTabBarControl } from '../context/TabBarContext'
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated'

function getTaskSwipeDetails(item: Task, action: string) {
  if (action === 'None' || !item) return null
  const currentStatus = item.status
  if (action === 'In Progress') {
    if (currentStatus === 'Yet to Start' || currentStatus === 'Open') {
      return { label: 'In Progress', newStatus: 'In Progress' }
    } else if (currentStatus === 'In Progress') {
      return { label: 'Complete', newStatus: 'Done' }
    } else if (['Done', 'Completed', 'Closed', 'Cancel'].includes(currentStatus)) {
      return { label: 'Reopen', newStatus: 'In Progress' }
    } else {
      return { label: 'In Progress', newStatus: 'In Progress' }
    }
  } else if (action === 'Complete') {
    if (['Done', 'Completed', 'Closed', 'Cancel'].includes(currentStatus)) {
      return { label: 'Reopen', newStatus: 'In Progress' }
    } else {
      return { label: 'Complete', newStatus: 'Done' }
    }
  }
  return null
}

export default function TaskListScreen({ navigation }: any) {
  const { selectedProjectIds } = useProjectFilter()
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()
  const insets = useSafeAreaInsets()
  const swipeableRefs = useRef<Map<string, any>>(new Map())
  const fabBottom = 60 + Math.max(insets.bottom, 10) + 16
  const filterFabBottom = fabBottom + 64

  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [expandedSection, setExpandedSection] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [swipeLeftAction, setSwipeLeftAction] = useState('In Progress')
  const [swipeRightAction, setSwipeRightAction] = useState('Complete')
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)

  const loadSwipePreferences = useCallback(async (employeeId?: string) => {
    const userId = employeeId || currentUser?.employeeId
    if (!userId) return
    try {
      const leftKey = `jsr_swipe_left_${userId}`
      const rightKey = `jsr_swipe_right_${userId}`
      const left = await AsyncStorage.getItem(leftKey)
      const right = await AsyncStorage.getItem(rightKey)
      setSwipeLeftAction(left || 'In Progress')
      setSwipeRightAction(right || 'Complete')
    } catch (err) {
      console.warn('Failed to load swipe preferences', err)
    }
  }, [currentUser])

  useEffect(() => {
    if (currentUser?.employeeId) {
      loadSwipePreferences(currentUser.employeeId)
    }
  }, [currentUser, loadSwipePreferences])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentUser?.employeeId) {
        loadSwipePreferences(currentUser.employeeId)
      }
    })
    return unsubscribe
  }, [navigation, currentUser, loadSwipePreferences])

  const handleSwipeAction = async (item: any, action: string) => {
    const details = getTaskSwipeDetails(item, action)
    if (!details) return

    // Close the swipeable row immediately so the card slides back
    const swipeableRef = swipeableRefs.current.get(item.taskId)
    if (swipeableRef) {
      swipeableRef.close()
    }

    const { newStatus } = details
    if (item.status === newStatus) return

    // Optimistic UI update
    const previousTasks = [...tasks]
    const previousFiltered = [...filteredTasks]

    const updateStatus = (list: Task[]) =>
      list.map(t => (t.taskId === item.taskId ? { ...t, status: newStatus } : t))

    // Optimistic list update is fine — it reverts below if the server refuses.
    setTasks(updateStatus(tasks))
    setFilteredTasks(updateStatus(filteredTasks))

    try {
      const res = await updateTask(item.taskId, { status: newStatus })
      if (!res.success) {
        // Revert on failure
        setTasks(previousTasks)
        setFilteredTasks(previousFiltered)
        Alert.alert('Error', res.error || 'Failed to update task')
      } else {
        // The success alert used to fire BEFORE the request, so a swipe on a task
        // the server refused to update said "Success" and then "Error".
        Alert.alert('Success', `Task updated to ${newStatus}`)
        fetchTasks()
      }
    } catch (error) {
      console.error('Failed to update task status via swipe:', error)
      // Revert on failure
      setTasks(previousTasks)
      setFilteredTasks(previousFiltered)
      Alert.alert('Error', 'Failed to update task')
    }
  }

  const renderLeftActions = (item: Task) => {
    const details = getTaskSwipeDetails(item, swipeRightAction)
    if (!details) return null
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', paddingLeft: 20, marginVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{details.label}</Text>
      </View>
    )
  }

  const renderRightActions = (item: Task) => {
    const details = getTaskSwipeDetails(item, swipeLeftAction)
    if (!details) return null
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, marginVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{details.label}</Text>
      </View>
    )
  }
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [subprojectId, setSubprojectId] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]) // Will be updated to ['me'] or [currentUser.employeeId] on load


  const [isFilterModalVisible, setFilterModalVisible] = useState(false)

  const { handleScroll } = useTabBarControl()
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: handleScroll
  })

  // ... (Queries remain same) ...
  // Removed hardcoded statusOptions, using settings derived options in render
  // const statusOptions = ['All', 'Yet to Start', 'In Progress', 'Delayed', 'Done', 'Cancel', 'Hold', 'ReOpened', 'Stop']

  const STATIC_PROJECTS: Project[] = [
    { projectId: 'dsn', projectName: 'dsn' },
    { projectId: 'amtariksha', projectName: 'amtariksha' },
    { projectId: 'task management', projectName: 'task management' },
    { projectId: 'swarg', projectName: 'swarg' },
    { projectId: 'other', projectName: 'other' }
  ]

  // GraphQL query for projects
  const { data: projectsData } = useQuery(GET_PROJECTS)

  const projects = useMemo(() => {
    const fetchedProjects = (projectsData as any)?.projects || []
    const newProjects = [...STATIC_PROJECTS]
    fetchedProjects.forEach((p: any) => {
      if (!newProjects.find(sp => sp.projectId === p.projectId)) {
        newProjects.push(p)
      }
    })
    return newProjects
  }, [projectsData])

  // Get current project's subprojects
  const currentProject = projects.find((p: any) => p.projectId === projectId)
  const subprojects = projects.filter((p: any) => p.parentProjectId === projectId)

  // GraphQL query for users
  const { data: usersData } = useQuery(GET_USERS)
  const users = (usersData as any)?.users || []

  // GraphQL query for settings
  const { data: settingsData } = useQuery(GET_SETTINGS, { variables: { activeOnly: true } })
  const settings = (settingsData as any)?.settings || []

  // Derive options from settings or defaults
  const parseSettingValue = (val: any) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  const statusSetting = settings.find((s: any) => s.key === 'task_statuses')
  const parsedStatus = statusSetting ? parseSettingValue(statusSetting.value) : []
  const statusOptions = parsedStatus.length > 0 ? parsedStatus : ['Yet to Start', 'In Progress', 'Delayed', 'Done', 'Cancel', 'Hold', 'ReOpened', 'Stop']

  const prioritySetting = settings.find((s: any) => s.key === 'task_priorities')
  const parsedPriority = prioritySetting ? parseSettingValue(prioritySetting.value) : []
  const priorityOptions = parsedPriority.length > 0 ? parsedPriority : ['High', 'Medium', 'Low', 'U&I', 'NU&I', 'U&NI', 'NU&NI']

  // REST API Implementation
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const fetchTasks = useCallback(async () => {
    try {
      if (!refreshing) setLoading(true)
      setError(null)

      if (!currentUser?.employeeId) {
        setTasks([])
        return
      }

      // Dynamically import apiRequest to avoid circular dependency issues if any
      const { apiRequest } = require('../services/apiClient')

      console.log('Fetching tasks for user:', currentUser.employeeId)
      const response = await apiRequest(`/api/tasks/user/${currentUser.employeeId}`, { method: 'GET' })
      console.log('Tasks API Response success:', response?.success, 'Count:', Array.isArray(response) ? response.length : response?.data?.length)

      if (response && response.error) {
        console.error('API Error:', response.error)
        setError(response.error)
        return
      }

      if (response && (response.data || Array.isArray(response))) {
        const tasksData = Array.isArray(response) ? response : (response.data || [])
        setTasks(Array.isArray(tasksData) ? tasksData : [])
      } else {
        console.warn('REST Fetch returned unexpected structure', response)
        setTasks([])
      }

    } catch (err) {
      console.error('Fetch tasks error:', err)
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentUser, refreshing])

  useEffect(() => {
    if (isInitialized) {
      fetchTasks()
    }
  }, [fetchTasks, isInitialized])

  // Client-side filtering (Search + Project + Subproject + Status + Priority + Subtasks)
  useEffect(() => {
    let filtered = tasks

    // Global Project Filter
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      filtered = filtered.filter(task => task.projectId && selectedProjectIds.includes(task.projectId))
    }

    // Search Filter
    if (searchQuery) {
      const lower = searchQuery.toLowerCase()
      filtered = filtered.filter(task =>
        (task.name && task.name.toLowerCase().includes(lower)) ||
        (task.taskId && task.taskId.toLowerCase().includes(lower)) ||
        (task.description && task.description.toLowerCase().includes(lower))
      )
    }

    // Project Filter
    if (projectId) {
      filtered = filtered.filter(task => task.projectId === projectId)
    }

    // Subproject Filter
    if (subprojectId) {
      filtered = filtered.filter(task => task.subprojectId === subprojectId)
    }

    // Status Filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(task => statusFilter.includes(task.status))
    }

    // Priority Filter
    if (priorityFilter.length > 0) {
      filtered = filtered.filter(task => priorityFilter.includes(task.priority))
    }

    // Subtask Filter - Hide tasks that are subtasks
    filtered = filtered.filter(task => !task.parentTaskId)

    // Stable sorting: Completed/Cancelled at bottom, active at top. Stably sorted by taskId DESC.
    filtered = [...filtered].sort((a, b) => {
      const aDone = ['Done', 'Completed', 'Cancelled', 'Cancel'].includes(a.status) ? 1 : 0
      const bDone = ['Done', 'Completed', 'Cancelled', 'Cancel'].includes(b.status) ? 1 : 0
      if (aDone !== bDone) {
        return aDone - bDone
      }
      return b.taskId.localeCompare(a.taskId)
    })

    setFilteredTasks(filtered)
  }, [tasks, searchQuery, projectId, subprojectId, statusFilter, priorityFilter, selectedProjectIds])

  const loadCurrentUser = useCallback(async () => {
    try {
      const userData = await getUserData()
      setCurrentUser(userData)
      return userData
    } catch (error) {
      console.error('Failed to load user:', error)
      return null
    }
  }, [])

  const loadSavedFilters = useCallback(async () => {
    try {
      const savedFilters = await get<TaskFilters>(STORAGE_KEYS.TASK_FILTERS)
      if (savedFilters) {
        setSearchQuery(savedFilters.searchQuery || '')
        setStatusFilter(savedFilters.statusFilter || [])
        setPriorityFilter(savedFilters.priorityFilter || [])
        setAssigneeFilter(savedFilters.assigneeFilter || [])
      }
      return savedFilters
    } catch (error) {
      console.error('Failed to load saved filters:', error)
      return null
    }
  }, [])

  const saveFilters = useCallback(async () => {
    try {
      const filters: TaskFilters = {
        searchQuery,
        statusFilter,
        priorityFilter,
        assigneeFilter
      }
      await save(STORAGE_KEYS.TASK_FILTERS, filters)
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [searchQuery, statusFilter, priorityFilter, assigneeFilter])

  // Initialization
  useEffect(() => {
    const init = async () => {
      const user = await loadCurrentUser()
      const saved = await loadSavedFilters()
      if (user?.employeeId && (!saved || !saved.assigneeFilter || saved.assigneeFilter.length === 0)) {
        setAssigneeFilter([user.employeeId])
      }
      setIsInitialized(true)
    }
    init()
  }, [])

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isInitialized) {
        fetchTasks()
      }
    }, [fetchTasks, isInitialized])
  )

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter([])
    setPriorityFilter([])
    setProjectId('')
    setSubprojectId('')
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchTasks()
  }, [fetchTasks])


  // ... (refresh logic same)

  const handleTaskPress = useCallback((task: Task) => {
    navigation.navigate('TaskDetails', { taskId: task.taskId })
  }, [navigation])

  const getAssigneeNames = useCallback((assignedTo: string | string[]): string => {
    if (!assignedTo) return 'Unassigned'

    // Helper to resolve name from ID
    const resolveName = (id: string) => {
      if (id === 'me') return 'My Tasks'
      const user = users.find((u: any) => u.employeeId === id)
      return user ? user.name : id
    }

    if (Array.isArray(assignedTo)) {
      if (assignedTo.length === 0) return 'Unassigned'
      if (assignedTo.length === 1) return resolveName(assignedTo[0])
      if (assignedTo.length === 2) return `${resolveName(assignedTo[0])}, ${resolveName(assignedTo[1])}`
      return `${resolveName(assignedTo[0])}, ${resolveName(assignedTo[1])} +${assignedTo.length - 2} more`
    }
    // If single string
    return resolveName(assignedTo)
  }, [users])

  const renderTask = ({ item }: { item: any }) => {
    // Derive project hierarchy from the projects list
    let projectDisplay = ''
    if (item.projectId) {
      const proj = projects.find((p: any) => p.projectId === item.projectId)
      if (proj) {
        projectDisplay = proj.projectName
        if (proj.parentProjectId) {
          const parent = projects.find((p: any) => p.projectId === proj.parentProjectId)
          if (parent) {
            projectDisplay = `${parent.projectName} / ${proj.projectName}`
          }
        }
      } else {
        projectDisplay = item.projectId // Fallback to ID if not found
      }
    }

    // const subProjectName = item.subproject?.subProjectName ? ` / ${item.subproject.subProjectName}` : '' // Removed invalid field usage
    // For REST, we might not have assignedToUsers populated, so fallback to getAssigneeNames lookup
    // The REST API might return assignedToUsers if backend is updated, but if not we rely on manual resolution
    const assigneeNames = (item.assignedToUsers && item.assignedToUsers.length > 0)
      ? item.assignedToUsers.map((u: any) => u.name).join(', ')
      : getAssigneeNames(item.assignedTo)

    const cardContent = (
      <Card 
        style={styles.taskCard} 
        elevation={1} 
        onPress={() => handleTaskPress(item)}
        onLongPress={() => {
          Vibration.vibrate(50)
          setSelectedTask(item)
          setQuickActionsVisible(true)
        }}
      >
        <Card.Content>
          <View style={styles.taskHeader}>
            <Text style={styles.taskId}>{item.taskId}</Text>
            <Chip style={[styles.statusChip, { backgroundColor: getStatusColor(item.status, colors) }]} textStyle={[styles.statusText, { color: getStatusTextColor(item.status, colors) }]} compact>
              {item.status}
            </Chip>
          </View>
          <Text style={styles.taskName} numberOfLines={1}>{item.name || 'Untitled Task'}</Text>
          {projectDisplay ? <Text style={styles.projectName} numberOfLines={1}>📁 {projectDisplay}</Text> : null}
          <Text style={styles.taskDescription} numberOfLines={2}>{item.description}</Text>
          <View style={styles.taskMeta}>
            <Chip style={[styles.priorityChip, { backgroundColor: getPriorityColor(item.priority, colors) }]} textStyle={[styles.priorityText, { color: getPriorityTextColor(item.priority, colors) }]} compact>
              {item.priority}
            </Chip>
            <Text style={styles.taskDate}>Due: {formatDateIST(item.endDate)}</Text>
          </View>
          <Text style={styles.assignedTo}>👤 {assigneeNames}</Text>
        </Card.Content>
      </Card>
    )

    return (
      <Swipeable
        ref={ref => {
          if (ref) {
            swipeableRefs.current.set(item.taskId, ref)
          } else {
            swipeableRefs.current.delete(item.taskId)
          }
        }}
        renderLeftActions={swipeRightAction !== 'None' ? () => renderLeftActions(item) : undefined}
        renderRightActions={swipeLeftAction !== 'None' ? () => renderRightActions(item) : undefined}
        onSwipeableWillOpen={(direction) => {
          if (direction === 'left') {
            handleSwipeAction(item, swipeRightAction)
          } else if (direction === 'right') {
            handleSwipeAction(item, swipeLeftAction)
          }
        }}
      >
        {cardContent}
      </Swipeable>
    )
  }

  // Loading/Error views
  if (loading && !tasks.length) return <ListSkeleton count={6} />
  if (error && !tasks.length) return <View style={styles.centerContainer}><Text style={styles.errorText}>Failed to load tasks</Text><PaperButton mode="contained" onPress={onRefresh}>Retry</PaperButton></View>

  // Look up Project Name for display
  const selectedProjectName = projects.find((p: any) => p.projectId === projectId)?.projectName || 'All Projects';

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Tasks"
        rightAction={
          <IconButton
            icon="filter-variant"
            size={22}
            iconColor={colors.text}
            onPress={() => setFilterModalVisible(true)}
            style={{ margin: 0 }}
          />
        }
      />
      {/* Task List */}
      <Animated.FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.taskId}
        renderItem={renderTask}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{searchQuery || statusFilter.length > 0 ? 'No tasks match your filters' : 'No tasks found'}</Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => navigation.navigate('CreateTask')}
        disabled={isOffline}
        color="#FFFFFF"
        size="medium"
      />

      {/* FILTER MODAL */}
      <Portal>
        <Modal visible={isFilterModalVisible} onDismiss={() => setFilterModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <FilterHeader title="Filters" onClose={() => setFilterModalVisible(false)} />

          <ScrollView contentContainerStyle={styles.filterScroll}>

            {/* 1. Projects */}
            <FilterSection
              title="All Projects"
              label={projects.find((p: any) => p.projectId === projectId)?.projectName || "All Projects"}
              expanded={expandedSection === 'project'}
              onPress={() => setExpandedSection(expandedSection === 'project' ? '' : 'project')}
            >
              <View style={styles.chipRow}>
                <Chip
                  selected={projectId === ''}
                  onPress={() => { setProjectId(''); setSubprojectId(''); setExpandedSection(''); }}
                  style={styles.filterChip}
                  showSelectedOverlay
                  selectedColor={colors.primary}
                >
                  All Projects
                </Chip>
                {projects.filter((p: any) => !p.parentProjectId).map((p: any) => (
                  <Chip
                    key={p.projectId}
                    selected={projectId === p.projectId}
                    onPress={() => { setProjectId(p.projectId); setSubprojectId(''); setExpandedSection(''); }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    {p.projectName}
                  </Chip>
                ))}
              </View>
            </FilterSection>

            {/* 2. Subprojects */}
            <FilterSection
              title="All Subprojects"
              label={subprojectId ? subprojects.find(p => p.projectId === subprojectId)?.projectName : "All Subprojects"}
              expanded={expandedSection === 'subproject'}
              onPress={() => setExpandedSection(expandedSection === 'subproject' ? '' : 'subproject')}
            >
              {projectId === '' ? (
                <Text style={{ padding: 16, color: colors.textSecondary }}>Select a project first</Text>
              ) : subprojects.length === 0 ? (
                <Text style={{ padding: 16, color: colors.textSecondary }}>No subprojects found</Text>
              ) : (
                <View style={styles.chipRow}>
                  <Chip
                    selected={subprojectId === ''}
                    onPress={() => { setSubprojectId(''); setExpandedSection(''); }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    All Subprojects
                  </Chip>
                  {subprojects.map((p: any) => (
                    <Chip
                      key={p.projectId}
                      selected={subprojectId === p.projectId}
                      onPress={() => { setSubprojectId(p.projectId); setExpandedSection(''); }}
                      style={styles.filterChip}
                      showSelectedOverlay
                      selectedColor={colors.primary}
                    >
                      {p.projectName}
                    </Chip>
                  ))}
                </View>
              )}
            </FilterSection>

            {/* 3. Assign To - Hidden since tasks are strictly filtered to the logged-in user
            <FilterSection
              title="Assign To"
              count={assigneeFilter.length}
              expanded={expandedSection === 'assignee'}
              onPress={() => setExpandedSection(expandedSection === 'assignee' ? '' : 'assignee')}
            >
              <View style={styles.chipRow}>
                <Chip
                  selected={assigneeFilter.includes('me') || (currentUser?.employeeId && assigneeFilter.includes(currentUser.employeeId))}
                  onPress={() => {
                    const myId = currentUser?.employeeId;
                    if (!myId) {
                      // Fallback if no user loaded
                      if (assigneeFilter.includes('me')) setAssigneeFilter(prev => prev.filter(id => id !== 'me'));
                      else setAssigneeFilter(prev => [...prev, 'me']);
                      return;
                    }
                    if (assigneeFilter.includes(myId)) setAssigneeFilter(prev => prev.filter(id => id !== myId));
                    else setAssigneeFilter(prev => [...prev, myId]);
                  }}
                  style={styles.filterChip}
                  showSelectedOverlay
                  selectedColor={colors.primary}
                >
                  My Tasks
                </Chip>
                {users.map((u: any) => (
                  <Chip
                    key={u.employeeId}
                    selected={assigneeFilter.includes(u.employeeId)}
                    onPress={() => {
                      if (assigneeFilter.includes(u.employeeId)) setAssigneeFilter(prev => prev.filter(i => i !== u.employeeId))
                      else setAssigneeFilter(prev => [...prev, u.employeeId])
                    }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    {u.name}
                  </Chip>
                ))}
              </View>
            </FilterSection>
            */}

            {/* 4. Search Input (Moved HERE as per instructions) */}
            <FilterSearch value={searchQuery} onChangeText={setSearchQuery} placeholder="Search tasks..." />

            {/* 5. Status */}
            <FilterSection
              title="All Status"
              count={statusFilter.length}
              expanded={expandedSection === 'status'}
              onPress={() => setExpandedSection(expandedSection === 'status' ? '' : 'status')}
            >
              <View style={styles.chipRow}>
                {statusOptions.map((s: string) => (
                  <Chip
                     key={s}
                     selected={statusFilter.includes(s)}
                     onPress={() => {
                       if (statusFilter.includes(s)) setStatusFilter(prev => prev.filter(i => i !== s))
                       else setStatusFilter(prev => [...prev, s])
                     }}
                     style={styles.filterChip}
                     showSelectedOverlay
                     selectedColor={colors.primary}
                  >
                    {s}
                  </Chip>
                ))}
              </View>
            </FilterSection>

            {/* 6. Priority */}
            <FilterSection
              title="All Priority"
              count={priorityFilter.length}
              expanded={expandedSection === 'priority'}
              onPress={() => setExpandedSection(expandedSection === 'priority' ? '' : 'priority')}
            >
              <View style={styles.chipRow}>
                {priorityOptions.map((p: string) => (
                  <Chip
                    key={p}
                    selected={priorityFilter.includes(p)}
                    onPress={() => {
                      if (priorityFilter.includes(p)) setPriorityFilter(prev => prev.filter(i => i !== p))
                      else setPriorityFilter(prev => [...prev, p])
                    }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    {p}
                  </Chip>
                ))}
              </View>
            </FilterSection>

            <Divider style={styles.divider} />

            <View style={styles.buttonRow}>
              <PaperButton mode="outlined" onPress={clearFilters} style={styles.clearButton}>
                Clear Filters
              </PaperButton>
              <PaperButton mode="contained" onPress={() => setFilterModalVisible(false)} style={styles.applyButton}>
                Done
              </PaperButton>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
      <QuickActionsModal
        visible={quickActionsVisible}
        onDismiss={() => {
          setQuickActionsVisible(false)
          setSelectedTask(null)
        }}
        type="task"
        item={selectedTask}
        users={users}
        onSuccess={() => {
          fetchTasks()
        }}
      />
    </SafeAreaView>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
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
  errorText: {
    ...materialTypography.bodyLarge,
    color: colors.error,
    marginBottom: materialSpacing.md,
  },
  retryButton: {
    borderRadius: 8,
  },
  searchContainer: {
    padding: materialSpacing.md,
    backgroundColor: colors.surface,
    elevation: materialElevation.level1,
  },
  searchBar: {
    backgroundColor: colors.surfaceVariant,
    elevation: 0,
  },
  filterContainer: {
    backgroundColor: colors.surface,
    paddingVertical: materialSpacing.md,
    paddingHorizontal: materialSpacing.md,
    elevation: materialElevation.level1,
    minHeight: 60,
  },
  filterFab: {
    position: 'absolute',
    right: 24,
    backgroundColor: colors.secondary,
  },
  filterLabel: {
    ...materialTypography.labelLarge,
    color: colors.text,
    marginRight: materialSpacing.sm,
  },
  filterChip: {
    marginRight: materialSpacing.xs,
    backgroundColor: colors.surfaceVariant,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    ...materialTypography.labelSmall,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.surface,
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: materialSpacing.md,
    paddingVertical: materialSpacing.sm,
    backgroundColor: colors.surface,
  },
  dropdownButton: {
    flex: 1,
    borderColor: colors.border,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  dropdownLabel: {
    ...materialTypography.labelLarge,
    color: colors.primary,
  },
  listContent: {
    padding: materialSpacing.md,
    paddingBottom: 100,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: materialSpacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: materialSpacing.xs,
  },
  taskId: {
    ...materialTypography.labelMedium,
    color: colors.textSecondary,
  },
  statusChip: {
    // height: 24,
  },
  statusText: {
    ...materialTypography.labelSmall,
    color: colors.surface,
  },
  taskName: {
    ...materialTypography.titleMedium,
    color: colors.text,
    marginBottom: materialSpacing.xs,
  },
  projectName: {
    ...materialTypography.bodySmall,
    color: colors.primary,
    marginBottom: materialSpacing.xs,
  },
  taskDescription: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: materialSpacing.sm,
    lineHeight: 20,
  },
  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: materialSpacing.xs,
  },
  priorityChip: {
    // height: 24,
  },
  priorityText: {
    ...materialTypography.labelSmall,
    color: colors.surface,
  },
  taskDate: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
  },
  assignedTo: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: materialSpacing.xs,
  },
  emptyContainer: {
    padding: materialSpacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...materialTypography.bodyLarge,
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: colors.primary,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  modalContent: {
    backgroundColor: colors.surface,
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  filterScroll: {
    padding: 20,
  },
  filterTitle: {
    ...materialTypography.titleLarge,
    marginBottom: 10,
    textAlign: 'center',
    color: colors.text,
  },
  sectionTitle: {
    ...materialTypography.titleMedium,
    marginTop: 10,
    marginBottom: 5,
    color: colors.text,
  },
  divider: {
    marginVertical: 10,
    backgroundColor: colors.border,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  applyButton: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  clearButton: {
    flex: 1,
    borderColor: colors.primary,
    borderWidth: 1,
  },
})
