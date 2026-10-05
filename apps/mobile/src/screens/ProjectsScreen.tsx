import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Card, Text, Button, ActivityIndicator, IconButton, Portal, Dialog, TextInput, Chip, Searchbar } from 'react-native-paper'
import { useTheme } from '../contexts/ThemeContext'
import { useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { getUserData } from '../utils/secureStorage'
import { materialSpacing, materialTypography, materialColors } from '../config/materialTheme'
import { useResponsive } from '../hooks/useResponsive'
import apiClient from '../services/apiClient'
import { createProject } from '../services/projectService'
import { SearchablePicker } from '../components/SearchablePicker'
import { canManageProjects as canManageProjectsFn } from '../utils/permissions'
import { unwrapApiList } from '../utils/apiEnvelope'

interface ProjectNode {
  projectId: string
  projectName: string
  parentProjectId?: string | null
  description?: string
  status: 'Active' | 'Inactive' | 'Deleted' | 'completed'
  createdBy: string
  createdAt: string
  updatedAt: string
  children?: ProjectNode[]
}

export default function ProjectsScreen() {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const navigation = useNavigation<any>()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [projects, setProjects] = useState<ProjectNode[]>([])
  const [flatProjectsList, setFlatProjectsList] = useState<ProjectNode[]>([]) // For parent selector drop-down
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All')

  // Create Project Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newParentId, setNewParentId] = useState<string>('none')
  const [newStatus, setNewStatus] = useState<'Active' | 'Inactive'>('Active')

  // Accordion open state
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  const toggleExpand = (projectId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const canManageProjects = useMemo(
    () => canManageProjectsFn(currentUser),
    [currentUser]
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const user = await getUserData()
      if (user) {
        setCurrentUser(user)
      }

      // Both routes answer with a bare array, not { success, data }.
      const hierarchy = unwrapApiList<ProjectNode>(
        await apiClient.get('/api/projects/hierarchy'),
        'Failed to fetch projects'
      )
      if (hierarchy.success) {
        setProjects(hierarchy.data)
      } else {
        setError(hierarchy.error)
      }

      // Flat list for the parent project selector: main projects only.
      const flat = unwrapApiList<ProjectNode>(await apiClient.get('/api/projects'), 'Failed to fetch projects')
      if (flat.success) {
        setFlatProjectsList(flat.data.filter((p) => !p.parentProjectId))
      }

    } catch (err) {
      console.error(err)
      setError('Failed to load projects list')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  const handleCreateSubmit = async () => {
    if (!newProjectName.trim()) {
      Alert.alert('Validation Error', 'Project Name is required')
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        projectName: newProjectName.trim(),
        parentProjectId: newParentId === 'none' ? null : newParentId,
        description: newDescription.trim() || null,
        status: newStatus,
        createdBy: currentUser?.employeeId || 'System'
      }

      const res = await createProject(payload)
      if (res.success) {
        Alert.alert('Success', 'Project created successfully')
        setIsCreateModalOpen(false)
        setNewProjectName('')
        setNewDescription('')
        setNewParentId('none')
        setNewStatus('Active')
        loadData()
      } else {
        Alert.alert('Error', res.error)
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred while creating project')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered projects hierarchy
  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch = project.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            project.projectId.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'All' || 
                            (statusFilter === 'Active' && project.status === 'Active') ||
                            (statusFilter === 'Inactive' && project.status === 'Inactive')

      return matchesSearch && matchesStatus
    })
  }, [projects, searchQuery, statusFilter])

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return { bg: '#E6F4EA', text: '#137333' } // green
      case 'inactive':
        return { bg: '#FEF7E0', text: '#B06000' } // yellow/orange
      case 'deleted':
        return { bg: '#FCE8E6', text: '#C5221F' } // red
      default:
        return { bg: '#F1F3F4', text: '#5F6368' } // gray
    }
  }

  const renderProjectItem = (node: ProjectNode, depth = 0) => {
    const isExpanded = expandedProjects[node.projectId] || false
    const statusStyle = getStatusColor(node.status)
    const hasChildren = node.children && node.children.length > 0

    return (
      <View key={node.projectId} style={{ marginLeft: depth * 16 }}>
        <Card style={styles.projectCard} onPress={() => navigation.navigate('ProjectDetails', { projectId: node.projectId })}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.projectMainInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.projectName}>{node.projectName}</Text>
                <Chip textStyle={{ color: statusStyle.text, fontSize: 10 }} style={[styles.statusChip, { backgroundColor: statusStyle.bg }]}>
                  {node.status}
                </Chip>
              </View>
              {node.description ? (
                <Text numberOfLines={1} style={styles.projectDescription}>{node.description}</Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>ID: {node.projectId}</Text>
                {hasChildren ? (
                  <Text style={styles.subprojectCount}>
                    {node.children?.length} sub-project{node.children!.length > 1 ? 's' : ''}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.cardActions}>
              {hasChildren ? (
                <IconButton
                  icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  onPress={() => toggleExpand(node.projectId)}
                />
              ) : null}
              <IconButton
                icon="arrow-right"
                size={20}
                iconColor={colors.primary}
                onPress={() => navigation.navigate('ProjectDetails', { projectId: node.projectId })}
              />
            </View>
          </Card.Content>
        </Card>

        {hasChildren && isExpanded ? (
          <View style={styles.childrenContainer}>
            {node.children?.map(child => renderProjectItem(child, depth + 1))}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Search and Filters */}
      <View style={styles.header}>
        <Searchbar
          placeholder="Search projects..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          iconColor={colors.primary}
        />
        <View style={styles.filterRow}>
          {(['All', 'Active', 'Inactive'] as const).map(status => (
            <Chip
              key={status}
              selected={statusFilter === status}
              onPress={() => setStatusFilter(status)}
              style={styles.filterChip}
              selectedColor="#fff"
              showSelectedOverlay
            >
              {status}
            </Chip>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {loading && !refreshing ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <IconButton icon="alert-circle-outline" size={48} iconColor={materialColors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="contained" onPress={loadData} style={{ marginTop: 12 }}>
              Try Again
            </Button>
          </View>
        ) : filteredProjects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="folder-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No projects found</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredProjects.map(project => renderProjectItem(project))}
          </View>
        )}
      </ScrollView>

      {canManageProjects ? (
        <Portal>
          {/* Create Modal Dialog */}
          <Dialog visible={isCreateModalOpen} onDismiss={() => setIsCreateModalOpen(false)}>
            <Dialog.Title>Add New Project</Dialog.Title>
            <Dialog.Content>
              <ScrollView style={{ maxHeight: 350 }}>
                <TextInput
                  label="Project Name *"
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  mode="outlined"
                  style={styles.modalInput}
                />
                
                <SearchablePicker
                  label="Parent Project (Optional)"
                  selectedValue={newParentId}
                  onValueChange={(val) => setNewParentId(val)}
                  items={[
                    { label: 'None (Main Project)', value: 'none' },
                    ...flatProjectsList.map((p) => ({
                      label: p.projectName,
                      value: p.projectId,
                    })),
                  ]}
                />

                <TextInput
                  label="Description"
                  value={newDescription}
                  onChangeText={setNewDescription}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.modalInput}
                />

                <SearchablePicker
                  label="Status"
                  selectedValue={newStatus}
                  onValueChange={(val) => setNewStatus(val as any)}
                  items={[
                    { label: 'Active', value: 'Active' },
                    { label: 'Inactive', value: 'Inactive' },
                  ]}
                />
              </ScrollView>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setIsCreateModalOpen(false)}>Cancel</Button>
              <Button mode="contained" onPress={handleCreateSubmit} loading={isSubmitting} disabled={isSubmitting}>
                Create
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      ) : null}

      {canManageProjects ? (
        <TouchableOpacity style={styles.fab} onPress={() => setIsCreateModalOpen(true)}>
          <MaterialCommunityIcons name="plus" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: materialSpacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    elevation: 0,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: materialSpacing.sm,
    gap: 8,
  },
  filterChip: {
    height: 32,
  },
  scrollView: {
    flex: 1,
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...materialTypography.bodyMedium,
    color: materialColors.error,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...materialTypography.bodyLarge,
    color: '#999',
    marginTop: 12,
  },
  listContainer: {
    padding: materialSpacing.md,
    gap: 8,
  },
  projectCard: {
    backgroundColor: colors.surface,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: materialSpacing.sm,
  },
  projectMainInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  projectName: {
    ...materialTypography.titleMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusChip: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectDescription: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    ...materialTypography.bodySmall,
    fontSize: 10,
    color: '#999',
  },
  subprojectCount: {
    ...materialTypography.bodySmall,
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childrenContainer: {
    borderLeftWidth: 1.5,
    borderLeftColor: colors.border,
    marginLeft: 10,
    paddingLeft: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    backgroundColor: colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  modalInput: {
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  selectLabel: {
    ...materialTypography.bodyMedium,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
})
