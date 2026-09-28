/**
 * Bug List Screen
 * Displays all bugs with filters and search
 *
 * Features:
 * - GraphQL-based bug fetching
 * - FT-/DEV- prefix display
 * - Type filtering (feature vs testcase)
 * - Status filtering
 * - Search functionality
 * - Filter persistence with AsyncStorage
 * - Pull-to-refresh
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
import { updateBug } from '../services/bugService'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, Text, FAB, ActivityIndicator, Searchbar, Chip, Surface, Portal, Modal, Divider, Button as PaperButton, IconButton } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@apollo/client/react'
import { GET_BUGS, GET_PROJECTS, GET_USERS, GET_SETTINGS } from '../config/graphql-queries'
import { Project, Bug, BugFilters } from '../types'
import { getBugDisplayId, getBugTypeDisplayName, getSeverityColor, getStatusColor, getStatusTextColor } from '../utils/bugHelpers'
import { formatDateIST } from '../utils/datetime'
import { save, get, getUserData, STORAGE_KEYS } from '../utils/secureStorage'
import { FilterHeader, FilterSection, FilterSearch, FilterToggle } from '../components/FilterComponents'
import { ListSkeleton } from '../components/SkeletonLoaders'
import AppHeader from '../components/AppHeader'
import { useTheme } from '../contexts/ThemeContext'
import { useProjectFilter } from '../contexts/ProjectFilterContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing, materialElevation } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useTabBarControl } from '../context/TabBarContext'
import apiClient from '../services/apiClient'
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated'

function getBugSwipeDetails(item: Bug, action: string) {
  if (action === 'None' || !item) return null
  const currentStatus = item.status
  if (action === 'In Progress') {
    if (currentStatus === 'New') {
      return { label: 'In Progress', newStatus: 'In Progress' }
    } else if (currentStatus === 'In Progress') {
      return { label: 'Resolve', newStatus: 'Resolved' }
    } else if (['Resolved', 'Closed'].includes(currentStatus)) {
      return { label: 'Reopen', newStatus: 'In Progress' }
    } else {
      return { label: 'In Progress', newStatus: 'In Progress' }
    }
  } else if (action === 'Complete') {
    if (['Resolved', 'Closed'].includes(currentStatus)) {
      return { label: 'Reopen', newStatus: 'In Progress' }
    } else {
      return { label: 'Resolve', newStatus: 'Resolved' }
    }
  }
  return null
}

export default function BugListScreen() {
  const { selectedProjectIds } = useProjectFilter()
  const navigation = useNavigation()
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()
  const insets = useSafeAreaInsets()
  const swipeableRefs = useRef<Map<string, any>>(new Map())
  const fabBottom = 60 + Math.max(insets.bottom, 10) + 16
  const filterFabBottom = fabBottom + 64

  const [filteredBugs, setFilteredBugs] = useState<Bug[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [severityFilter, setSeverityFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [subprojectId, setSubprojectId] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([])
  const [isFilterModalVisible, setFilterModalVisible] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [expandedSection, setExpandedSection] = useState<string>('')
  const [swipeLeftAction, setSwipeLeftAction] = useState('In Progress')
  const [swipeRightAction, setSwipeRightAction] = useState('Complete')
  const [selectedBug, setSelectedBug] = useState<any>(null)
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
    const details = getBugSwipeDetails(item, action)
    if (!details) return

    // Close the swipeable row immediately so the card slides back
    const swipeableRef = swipeableRefs.current.get(item.bugId)
    if (swipeableRef) {
      swipeableRef.close()
    }

    const { newStatus } = details
    if (item.status === newStatus) return

    // Optimistic UI update
    const previousBugs = [...bugs]
    const previousFiltered = [...filteredBugs]

    const updateStatus = (list: Bug[]) =>
      list.map(b => (b.bugId === item.bugId ? { ...b, status: newStatus } : b))

    setBugs(updateStatus(bugs))
    setFilteredBugs(updateStatus(filteredBugs))

    try {
      const res = await updateBug(item.bugId, { status: newStatus })
      if (!res.success) {
        // Revert on failure
        setBugs(previousBugs)
        setFilteredBugs(previousFiltered)
        Alert.alert('Error', res.error || 'Failed to update bug')
      } else {
        fetchBugs()
      }
    } catch (error) {
      console.error('Failed to update bug status via swipe:', error)
      // Revert on failure
      setBugs(previousBugs)
      setFilteredBugs(previousFiltered)
      Alert.alert('Error', 'Failed to update bug')
    }
  }

  const renderLeftActions = (item: Bug) => {
    const details = getBugSwipeDetails(item, swipeRightAction)
    if (!details) return null
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', paddingLeft: 20, marginVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{details.label}</Text>
      </View>
    )
  }

  const renderRightActions = (item: Bug) => {
    const details = getBugSwipeDetails(item, swipeLeftAction)
    if (!details) return null
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, marginVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{details.label}</Text>
      </View>
    )
  }

  const { handleScroll } = useTabBarControl()
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: handleScroll
  })


  // const severityOptions = ['All', 'Critical', 'Major', 'Minor'] // using settings derived

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

  const statusSetting = settings.find((s: any) => s.key === 'bug_statuses')
  const parsedStatus = statusSetting ? parseSettingValue(statusSetting.value) : []
  const statusOptions = parsedStatus.length > 0 ? parsedStatus : ['New', 'In Progress', 'Resolved', 'Closed', 'ReOpened']

  const severitySetting = settings.find((s: any) => s.key === 'bug_severities')
  const parsedSeverity = severitySetting ? parseSettingValue(severitySetting.value) : []
  const severityOptions = parsedSeverity.length > 0 ? parsedSeverity : ['Critical', 'Major', 'Minor']

  const categorySetting = settings.find((s: any) => s.key === 'bug_categories')
  const parsedCategory = categorySetting ? parseSettingValue(categorySetting.value) : []
  const categoryOptions = parsedCategory.length > 0 ? parsedCategory : ['UI', 'Functionality', 'Performance', 'Security', 'Other']

  const typeSetting = settings.find((s: any) => s.key === 'bug_types')
  const parsedType = typeSetting ? parseSettingValue(typeSetting.value) : []
  // Migration 056 replaced 'testcase' with 'release' as an allowed work-item
  // type; this fallback still offered the removed value.
  const typeOptionsRaw = parsedType.length > 0 ? parsedType : ['feature', 'bug', 'other', 'release']
  const typeOptions = ['All', ...typeOptionsRaw]

  // Use REST API instead of GraphQL to avoid schema mismatch issues
  const [bugs, setBugs] = useState<Bug[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const fetchBugs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await apiClient.get('/api/bugs?limit=1000')
      if (result.success && result.data) {
        setBugs(Array.isArray(result.data) ? result.data : [])
      } else {
        setBugs([])
      }
    } catch (err) {
      console.error('Failed to fetch bugs:', err)
      setError(err)
      setBugs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isInitialized) {
      fetchBugs()
    }
  }, [fetchBugs, isInitialized])

  const refetch = useCallback(() => {
    if (isInitialized) {
      fetchBugs()
    }
  }, [fetchBugs, isInitialized])

  const loadSavedFilters = useCallback(async () => {
    try {
      const savedFilters = await get<BugFilters>(STORAGE_KEYS.BUG_FILTERS)
      if (savedFilters) {
        setSearchQuery(savedFilters.searchQuery || '')
        setStatusFilter(savedFilters.statusFilter || [])
        setTypeFilter(savedFilters.typeFilter || [])
        setProjectId(savedFilters.projectId || '')
      }
      return savedFilters
    } catch (error) {
      console.error('Failed to load saved filters:', error)
      return null
    }
  }, [])

  const saveFilters = useCallback(async () => {
    try {
      const filters: BugFilters = {
        searchQuery,
        statusFilter,
        typeFilter,
        projectId,
      }
      await save(STORAGE_KEYS.BUG_FILTERS, filters)
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [searchQuery, statusFilter, typeFilter, projectId])

  // Initialization
  useEffect(() => {
    const init = async () => {
      try {
        const userData = await getUserData()
        setCurrentUser(userData)
      } catch (e) {
        console.error("Failed to load user", e)
      }
      await loadSavedFilters()
      setIsInitialized(true)
    }
    init()
  }, [])

  // Apply filters whenever bugs, filters, or currentUser change
  useEffect(() => {
    filterBugs()
  }, [bugs, searchQuery, statusFilter, severityFilter, categoryFilter, typeFilter, projectId, subprojectId, currentUser, selectedProjectIds])

  const filterBugs = useCallback(() => {
    let filtered = bugs

    // Global Project Filter
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      filtered = filtered.filter(bug => bug.projectId && selectedProjectIds.includes(bug.projectId))
    }

    // 1. Enforce user relation: only show bugs related to logged-in user (assignedTo or reportedBy)
    if (currentUser?.employeeId) {
      filtered = filtered.filter(
        (bug: Bug) =>
          bug.assignedTo === currentUser.employeeId ||
          bug.reportedBy === currentUser.employeeId
      )
    } else {
      setFilteredBugs([])
      return
    }

    // 2. Search Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (bug: Bug) =>
          bug.title?.toLowerCase().includes(query) ||
          bug.bugId?.toLowerCase().includes(query) ||
          bug.description?.toLowerCase().includes(query)
      )
    }

    // 3. Project Filter
    if (projectId) {
      filtered = filtered.filter(bug => bug.projectId === projectId)
    }

    // 4. Subproject Filter
    if (subprojectId) {
      filtered = filtered.filter(bug => bug.subprojectId === subprojectId)
    }

    // 5. Status Filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter(bug => statusFilter.includes(bug.status))
    }

    // 6. Severity Filter
    if (severityFilter.length > 0) {
      filtered = filtered.filter(bug => severityFilter.includes(bug.severity))
    }

    // 7. Category Filter
    if (categoryFilter.length > 0) {
      filtered = filtered.filter(bug => categoryFilter.includes(bug.category))
    }

    // 8. Type Filter
    if (typeFilter.length > 0) {
      filtered = filtered.filter(bug => typeFilter.includes(bug.type))
    }

    // 9. Stable sorting: Resolved/Closed items at bottom, active at top. Stably sorted by bugId DESC.
    filtered = [...filtered].sort((a, b) => {
      const aDone = ['Resolved', 'Closed'].includes(a.status) ? 1 : 0
      const bDone = ['Resolved', 'Closed'].includes(b.status) ? 1 : 0
      if (aDone !== bDone) {
        return aDone - bDone
      }
      return b.bugId.localeCompare(a.bugId)
    })

    setFilteredBugs(filtered)
  }, [bugs, searchQuery, statusFilter, severityFilter, categoryFilter, typeFilter, projectId, subprojectId, currentUser, selectedProjectIds])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter([])
    setTypeFilter([])
    setSeverityFilter([])
    setCategoryFilter([])
    setProjectId('')
    setSubprojectId('')
  }

  const handleRefresh = useCallback(async () => {
    try {
      await fetchBugs()
    } catch (error) {
      console.error('Failed to refresh bugs:', error)
    }
  }, [fetchBugs])

  // Save filters when they change
  useEffect(() => {
    if (isInitialized) {
      saveFilters()
    }
  }, [saveFilters, isInitialized])

  const renderBug = ({ item }: { item: Bug }) => {
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

    const displayId = getBugDisplayId(item.bugId, item.type)

    const cardContent = (
      <Card 
        style={styles.card} 
        elevation={1} 
        onPress={() => (navigation as any).navigate('BugDetails', { bugId: item.bugId })}
        onLongPress={() => {
          Vibration.vibrate(50)
          setSelectedBug(item)
          setQuickActionsVisible(true)
        }}
      >
        <Card.Content>
          <View style={styles.headerRow}>
            <Text style={styles.bugId}>{displayId}</Text>
            <Chip
              style={[styles.statusChip, { backgroundColor: getStatusColor(item.status, colors) }]}
              textStyle={[styles.statusText, { color: getStatusTextColor(item.status, colors) }]}
              compact
            >
              {item.status}
            </Chip>
          </View>

          <Text style={styles.bugTitle} numberOfLines={1}>{item.title}</Text>

          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="folder-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.projectName}>{projectDisplay}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={{ ...materialTypography.bodySmall, color: colors.textSecondary }}>
              {item.severity} • {formatDateIST(item.createdAt)} • {item.assignedToUser?.name || item.assignedTo || 'Unassigned'}
            </Text>
          </View>
        </Card.Content>
      </Card>
    )

    return (
      <Swipeable
        ref={ref => {
          if (ref) {
            swipeableRefs.current.set(item.bugId, ref)
          } else {
            swipeableRefs.current.delete(item.bugId)
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

  if (loading && bugs.length === 0) {
    return <ListSkeleton count={6} />
  }

  if (error) {
    return (
      <Surface style={styles.errorContainer} elevation={0}>
        <Text style={styles.errorText}>Failed to load bugs</Text>
        <Text style={styles.errorSubtext}>{error.message}</Text>
      </Surface>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Bugs"
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
      <Animated.FlatList
        data={filteredBugs}
        renderItem={renderBug}
        keyExtractor={item => item.bugId}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
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
            <Text style={styles.emptyText}>
              {searchQuery || statusFilter.length > 0 || typeFilter.length > 0 || projectId !== ''
                ? 'No bugs match your filters'
                : 'No bugs found'}
            </Text>
          </View>
        }
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

            <Divider style={styles.divider} />

            {/* 3. My Bugs Toggle - Hidden since bugs are strictly filtered to the logged-in user
            <FilterToggle
              label="👤 My Bugs"
              value={(assigneeFilter.includes('me') || (currentUser?.employeeId && assigneeFilter.includes(currentUser.employeeId)))}
              onValueChange={(val) => {
                const myId = currentUser?.employeeId || 'me';
                if (val) {
                  // Add me
                  setAssigneeFilter(prev => [...prev, myId])
                } else {
                  // Remove me
                  setAssigneeFilter(prev => prev.filter(id => id !== myId && id !== 'me'))
                }
              }}
            />
            */}

            <Divider style={styles.divider} />

            {/* 4. Search Input */}
            <FilterSearch value={searchQuery} onChangeText={setSearchQuery} placeholder="Search bugs..." />

            {/* 5. Type */}
            <FilterSection
              title="All Types"
              count={typeFilter.length}
              expanded={expandedSection === 'type'}
              onPress={() => setExpandedSection(expandedSection === 'type' ? '' : 'type')}
            >
              <View style={styles.chipRow}>
                {typeOptions.filter(t => t !== 'All').map(t => (
                  <Chip
                    key={t}
                    selected={typeFilter.includes(t)}
                    onPress={() => {
                      if (typeFilter.includes(t)) setTypeFilter(prev => prev.filter(i => i !== t))
                      else setTypeFilter(prev => [...prev, t])
                    }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    {getBugTypeDisplayName(t)}
                  </Chip>
                ))}
              </View>
            </FilterSection>

            {/* 6. Status */}
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

            {/* 7. Severity */}
            <FilterSection
              title="All Severity"
              count={severityFilter.length}
              expanded={expandedSection === 'severity'}
              onPress={() => setExpandedSection(expandedSection === 'severity' ? '' : 'severity')}
            >
              <View style={styles.chipRow}>
                {severityOptions.map((s: string) => (
                  <Chip
                    key={s}
                    selected={severityFilter.includes(s)}
                    onPress={() => {
                      if (severityFilter.includes(s)) setSeverityFilter(prev => prev.filter(i => i !== s))
                      else setSeverityFilter(prev => [...prev, s])
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

            {/* 8. Category */}
            <FilterSection
              title="All Categories"
              count={categoryFilter.length}
              expanded={expandedSection === 'category'}
              onPress={() => setExpandedSection(expandedSection === 'category' ? '' : 'category')}
            >
              <View style={styles.chipRow}>
                {categoryOptions.map((c: string) => (
                  <Chip
                    key={c}
                    selected={categoryFilter.includes(c)}
                    onPress={() => {
                      if (categoryFilter.includes(c)) setCategoryFilter(prev => prev.filter(i => i !== c))
                      else setCategoryFilter(prev => [...prev, c])
                    }}
                    style={styles.filterChip}
                    showSelectedOverlay
                    selectedColor={colors.primary}
                  >
                    {c}
                  </Chip>
                ))}
              </View>
            </FilterSection>

            <Divider style={styles.divider} />

            <View style={styles.buttonRow}>
              <PaperButton mode="outlined" onPress={clearFilters} style={styles.clearButton} textColor={colors.primary}>
                Clear Filters
              </PaperButton>
              <PaperButton mode="contained" onPress={() => setFilterModalVisible(false)} style={styles.applyButton} textColor="#FFFFFF">
                Done
              </PaperButton>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => navigation.navigate('CreateBug' as never)}
        color="#FFFFFF"
        size="medium"
        disabled={isOffline}
      />
      <QuickActionsModal
        visible={quickActionsVisible}
        onDismiss={() => {
          setQuickActionsVisible(false)
          setSelectedBug(null)
        }}
        type="bug"
        item={selectedBug}
        users={users}
        onSuccess={() => {
          fetchBugs()
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: materialSpacing.xl,
  },
  errorText: {
    ...materialTypography.headlineSmall,
    color: colors.error,
    marginBottom: materialSpacing.sm,
    textAlign: 'center',
  },
  errorSubtext: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  searchContainer: {
    padding: materialSpacing.md,
    backgroundColor: colors.surface,
  },
  searchRow: {
    padding: materialSpacing.md,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  searchBar: {
    elevation: 0,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    minHeight: 0,
  },
  listContent: {
    padding: materialSpacing.md,
    paddingBottom: 100,
  },
  card: {
    marginBottom: materialSpacing.md,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bugId: {
    ...materialTypography.labelLarge,
    color: colors.primary,
    fontWeight: 'bold',
  },
  statusChip: {
    alignItems: 'center',
    borderRadius: 12,
  },
  statusText: {
    ...materialTypography.labelSmall,
    fontWeight: '600',
  },
  bugTitle: {
    ...materialTypography.titleMedium,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  projectName: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginLeft: 4,
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
  filterChip: {
    marginBottom: 4,
  },
  applyButton: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  clearButton: {
    flex: 1,
    borderColor: colors.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20
  },
  emptyContainer: {
    padding: materialSpacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...materialTypography.bodyLarge,
    color: colors.textSecondary,
    textAlign: 'center',
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
  filterFab: {
    position: 'absolute',
    right: 24,
    backgroundColor: colors.secondary,
  },
})
