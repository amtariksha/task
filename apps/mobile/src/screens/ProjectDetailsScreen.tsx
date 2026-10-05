import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Card, Text, Button, ActivityIndicator, IconButton, Portal, Dialog, TextInput, Divider, Avatar, Switch } from 'react-native-paper'
import { useTheme } from '../contexts/ThemeContext'
import { useRoute, useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { getUserData } from '../utils/secureStorage'
import { materialSpacing, materialTypography, materialColors } from '../config/materialTheme'
import { useResponsive } from '../hooks/useResponsive'
import apiClient from '../services/apiClient'
import { SearchablePicker } from '../components/SearchablePicker'
import ReleaseChecklistEditor from '../components/ReleaseChecklistEditor'
import { DEFAULT_RELEASE_CHECKLIST } from '../constants/releaseChecklistDefault'
import { ReleaseChecklistTemplate } from '../types'
import {
  canManageThisProject,
  canDeleteProjects,
  type ProjectRole,
} from '../utils/permissions'
import { isActiveCompanyAdmin } from '../services/companyService'
import { createProject, type CreateProjectInput } from '../services/projectService'

interface SubProject {
  projectId: string
  projectName: string
  status: string
}

interface ProjectDetails {
  projectId: string
  projectName: string
  parentProjectId?: string | null
  description?: string
  status: 'Active' | 'Inactive' | 'Deleted' | 'completed'
  createdBy: string
  createdAt: string
  updatedAt: string
  subProjects?: SubProject[]
  releaseEnabled?: boolean
  releaseChecklist?: ReleaseChecklistTemplate | null
}

interface AssignedUser {
  employeeId: string
  userName: string
  /** The user's GLOBAL role (users.role) — not their authority on this project. */
  userRole: string
  /** Role WITHIN this project (project_users.role) — what actually grants rights. */
  role?: ProjectRole
  canEditRequirements?: boolean
  userDepartment?: string
  assignedAt: string
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return { bg: '#E6F4EA', text: '#137333' }
    case 'inactive':
      return { bg: '#FEF7E0', text: '#B06000' }
    case 'deleted':
      return { bg: '#FCE8E6', text: '#C5221F' }
    default:
      return { bg: '#F1F3F4', text: '#5F6368' }
  }
}

export default function ProjectDetailsScreen() {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { projectId } = route.params

  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])


  const [currentUser, setCurrentUser] = useState<any>(null)
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState<'Active' | 'Inactive' | 'completed'>('Active')
  const [editReleaseEnabled, setEditReleaseEnabled] = useState(false)
  const [editReleaseChecklist, setEditReleaseChecklist] = useState<ReleaseChecklistTemplate>({ sections: [] })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Add User Dialog State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [isAssigningUser, setIsAssigningUser] = useState(false)

  // Subproject Creation Dialog
  const [isAddSubprojectOpen, setIsAddSubprojectOpen] = useState(false)
  const [subprojectName, setSubprojectName] = useState('')
  const [subprojectDesc, setSubprojectDesc] = useState('')
  const [isSubmittingSub, setIsSubmittingSub] = useState(false)

  // The server authorizes per project (lib/authz.canManageProject): the project's
  // own manager, or an admin of the company that owns it. Gating on the global
  // role instead meant a 'management' user saw edit controls on every project and
  // then got a 403, while a project manager without a privileged global role saw
  // no controls at all.
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [settingRoleFor, setSettingRoleFor] = useState<string | null>(null)

  const myProjectRole = useMemo<ProjectRole | null>(() => {
    if (!currentUser?.employeeId) return null
    const mine = assignedUsers.find((u) => u.employeeId === currentUser.employeeId)
    return mine?.role ?? null
  }, [assignedUsers, currentUser])

  const canManageProjects = useMemo(
    () => canManageThisProject(currentUser, myProjectRole, isCompanyAdmin),
    [currentUser, myProjectRole, isCompanyAdmin]
  )

  const canDelete = useMemo(
    () => isCompanyAdmin || myProjectRole === 'manager' || canDeleteProjects(currentUser),
    [currentUser, myProjectRole, isCompanyAdmin]
  )

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const user = await getUserData()
      if (user) {
        setCurrentUser(user)
      }
      setIsCompanyAdmin(await isActiveCompanyAdmin())

      // Fetch Project
      const projectRes: any = await apiClient.get(`/api/projects/${projectId}`)
      if (projectRes && (projectRes.projectId || projectRes.success)) {
        const projData = projectRes.projectId ? projectRes : projectRes.data
        setProject(projData)
        setEditName(projData.projectName)
        setEditDescription(projData.description || '')
        setEditStatus(projData.status === 'Deleted' ? 'Inactive' : projData.status)
        setEditReleaseEnabled(projData.releaseEnabled === true)
        setEditReleaseChecklist(
          projData.releaseChecklist && Array.isArray(projData.releaseChecklist.sections)
            ? projData.releaseChecklist
            : { sections: [] }
        )
      } else {
        setError('Failed to find project details')
      }

      // Fetch Assigned Users
      const usersRes = await apiClient.get(`/api/projects/${projectId}/users`)
      if (usersRes && usersRes.success && Array.isArray(usersRes.data)) {
        setAssignedUsers(usersRes.data)
      } else if (Array.isArray(usersRes)) {
        setAssignedUsers(usersRes)
      }

      // Fetch All Active Users for Assignment
      const allUsersRes = await apiClient.get('/api/users?includeInactive=false')
      if (allUsersRes && allUsersRes.success && Array.isArray(allUsersRes.data)) {
        setAllUsers(allUsersRes.data)
      } else if (Array.isArray(allUsersRes)) {
        setAllUsers(allUsersRes)
      }

    } catch (err) {
      console.error(err)
      setError('An error occurred loading project details')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  const handleSaveChanges = async () => {
    if (!editName.trim()) {
      Alert.alert('Validation Error', 'Project Name is required')
      return
    }

    try {
      setIsSaving(true)
      const isSubproject = project?.parentProjectId != null
      const payload: Record<string, any> = {
        projectName: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
      }
      // Release config applies to sub-projects only (mirrors web ProjectModal).
      if (isSubproject) {
        payload.releaseEnabled = editReleaseEnabled
        payload.releaseChecklist = editReleaseEnabled ? editReleaseChecklist : null
      }

      const res = await apiClient.put(`/api/projects/${projectId}`, payload)
      if (res && res.success) {
        Alert.alert('Success', 'Project updated successfully')
        setIsEditing(false)
        loadData()
      } else {
        Alert.alert('Error', res?.error || 'Failed to update project')
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred updating the project')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this project? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true)
              const res = await apiClient.del(`/api/projects/${projectId}`)
              if (res && res.success) {
                Alert.alert('Success', 'Project deleted successfully')
                navigation.goBack()
              } else {
                Alert.alert('Error', res?.error || 'Failed to delete project')
              }
            } catch (err) {
              console.error(err)
              Alert.alert('Error', 'An error occurred while deleting project')
            } finally {
              setIsDeleting(false)
            }
          }
        }
      ]
    )
  }

  const handleAddSubprojectSubmit = async () => {
    if (!subprojectName.trim()) {
      Alert.alert('Validation Error', 'Subproject Name is required')
      return
    }

    try {
      setIsSubmittingSub(true)
      const payload: CreateProjectInput = {
        projectName: subprojectName.trim(),
        parentProjectId: projectId,
        description: subprojectDesc.trim() || null,
        status: 'Active',
        createdBy: currentUser?.employeeId || 'System',
      }

      const res = await createProject(payload)
      if (res.success) {
        Alert.alert('Success', 'Subproject created successfully')
        setIsAddSubprojectOpen(false)
        setSubprojectName('')
        setSubprojectDesc('')
        loadData()
      } else {
        Alert.alert('Error', res.error)
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred while creating subproject')
    } finally {
      setIsSubmittingSub(false)
    }
  }

  const handleAssignUser = async (targetEmployeeId: string) => {
    try {
      setIsAssigningUser(true)
      const res = await apiClient.post(`/api/projects/${projectId}/users`, {
        employeeId: targetEmployeeId,
        assignedBy: currentUser?.employeeId || 'System'
      })

      if (res && res.success) {
        Alert.alert('Success', 'User assigned successfully')
        setIsAddUserOpen(false)
        setUserSearch('')
        loadData()
      } else {
        Alert.alert('Error', res?.error || 'Failed to assign user')
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred assigning the user')
    } finally {
      setIsAssigningUser(false)
    }
  }

  /**
   * Set a member's role within THIS project.
   *
   * project_users.role is what actually grants authority here — editing the
   * project, changing its members, reading or writing its secrets — and until now
   * it was invisible on mobile and only settable with SQL.
   */
  const handleSetProjectRole = async (targetEmployeeId: string, role: ProjectRole) => {
    setSettingRoleFor(targetEmployeeId)
    try {
      const res = await apiClient.apiRequest(`/api/projects/${projectId}/users`, {
        method: 'PATCH',
        body: JSON.stringify({ employeeId: targetEmployeeId, role }),
      })
      if (res && res.success) {
        await loadData()
      } else {
        Alert.alert('Error', res?.error || 'Could not change this member\u2019s project role')
      }
    } catch (err) {
      console.error('Failed to set project role', err)
      Alert.alert('Error', 'Could not change this member\u2019s project role')
    } finally {
      setSettingRoleFor(null)
    }
  }

  /** Cycle member -> team leader -> manager -> member. A picker per row is too
   *  much chrome for a phone; tapping the badge is enough for three values. */
  const cycleProjectRole = (current?: ProjectRole): ProjectRole =>
    current === 'manager' ? 'member' : current === 'team_leader' ? 'manager' : 'team_leader'

  const handleRemoveUser = async (targetEmployeeId: string, userName: string) => {
    try {
      // Fetch artifact counts for warning
      let countsWarning = ''
      const artRes = await apiClient.get(`/api/projects/${projectId}/users/${targetEmployeeId}/artifacts`)
      if (artRes && artRes.success && artRes.data) {
        const { taskCount, bugCount } = artRes.data
        if (taskCount > 0 || bugCount > 0) {
          countsWarning = `\n\nWarning: This user has ${taskCount} tasks and ${bugCount} bugs assigned in this project.`
        }
      }

      Alert.alert(
        'Remove User',
        `Are you sure you want to remove ${userName} from this project?${countsWarning}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const res = await apiClient.apiRequest(`/api/projects/${projectId}/users`, {
                method: 'DELETE',
                body: JSON.stringify({ employeeId: targetEmployeeId })
              })
              if (res && res.success) {
                Alert.alert('Success', 'User removed from project')
                loadData()
              } else {
                Alert.alert('Error', res?.error || 'Failed to remove user')
              }
            }
          }
        ]
      )
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred removing user')
    }
  }

  const getInitials = (name: string) => {
    return name
      ? name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2)
      : 'U'
  }

  // Filter users that are not already assigned
  const availableUsers = useMemo(() => {
    return allUsers.filter(u => {
      const isAssigned = assignedUsers.some(au => au.employeeId === u.employeeId)
      const matchesSearch = u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                            u.employeeId.toLowerCase().includes(userSearch.toLowerCase())
      return !isAssigned && matchesSearch && u.status === 'active'
    })
  }, [allUsers, assignedUsers, userSearch])

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error || !project) {
    return (
      <View style={styles.errorContainer}>
        <IconButton icon="alert-circle-outline" size={48} iconColor={materialColors.error} />
        <Text style={styles.errorText}>{error || 'Project not found'}</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          Go Back
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Project Card */}
        <Card style={styles.mainCard}>
          <Card.Content>
            {isEditing ? (
              <View style={styles.editForm}>
                <TextInput
                  label="Project Name *"
                  value={editName}
                  onChangeText={setEditName}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Description"
                  value={editDescription}
                  onChangeText={setEditDescription}
                  mode="outlined"
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                />
                <SearchablePicker
                  label="Status"
                  selectedValue={editStatus}
                  onValueChange={(val) => setEditStatus(val as any)}
                  items={[
                    { label: 'Active', value: 'Active' },
                    { label: 'Inactive', value: 'Inactive' },
                    { label: 'Completed', value: 'completed' },
                  ]}
                />

                {/* Release configuration — sub-projects only */}
                {project.parentProjectId != null && (
                  <View style={styles.releaseConfig}>
                    <View style={styles.releaseToggleRow}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.selectLabel}>Release enabled</Text>
                        <Text style={styles.releaseHint}>
                          Allow creating release work-items for this sub-project and define its release checklist.
                        </Text>
                      </View>
                      <Switch
                        value={editReleaseEnabled}
                        onValueChange={setEditReleaseEnabled}
                        color={colors.primary}
                      />
                    </View>
                    {editReleaseEnabled && (
                      <ReleaseChecklistEditor
                        value={editReleaseChecklist}
                        onChange={setEditReleaseChecklist}
                        onLoadDefault={() => setEditReleaseChecklist(DEFAULT_RELEASE_CHECKLIST)}
                      />
                    )}
                  </View>
                )}

                <View style={styles.editActions}>
                  <Button mode="outlined" onPress={() => setIsEditing(false)} style={styles.actionBtn}>
                    Cancel
                  </Button>
                  <Button mode="contained" onPress={handleSaveChanges} loading={isSaving} disabled={isSaving} style={styles.actionBtn}>
                    Save
                  </Button>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.titleRow}>
                  <Text style={styles.projectTitle}>{project.projectName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(project.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(project.status).text }]}>
                      {project.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.projectId}>ID: {project.projectId}</Text>
                
                {project.description ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Description</Text>
                    <Text style={styles.descriptionText}>{project.description}</Text>
                  </View>
                ) : null}

                <Divider style={styles.divider} />

                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Created By</Text>
                    <Text style={styles.metaValue}>{project.createdBy}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Created At</Text>
                    <Text style={styles.metaValue}>{new Date(project.createdAt).toLocaleDateString()}</Text>
                  </View>
                  {project.parentProjectId ? (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Parent Project</Text>
                      <Text style={styles.metaValue}>{project.parentProjectId}</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Last Updated</Text>
                    <Text style={styles.metaValue}>{new Date(project.updatedAt).toLocaleDateString()}</Text>
                  </View>
                </View>

                {canManageProjects ? (
                  <View style={styles.mgmtRow}>
                    <Button mode="outlined" icon="pencil" onPress={() => setIsEditing(true)} style={{ flex: 1, marginRight: 8 }}>
                      Edit
                    </Button>
                    {canDelete ? (
                      <Button mode="outlined" icon="trash-can-outline" textColor={materialColors.error} onPress={handleDeleteProject} loading={isDeleting} disabled={isDeleting} style={{ flex: 1, borderColor: materialColors.error }}>
                        Delete
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Requirements Module entry */}
        <Card style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() =>
              navigation.navigate('RequirementsList', {
                projectId: project.projectId,
                projectName: project.projectName,
              })
            }
          >
            <IconButton icon="file-document-outline" iconColor={colors.primary} size={24} style={{ margin: 0 }} />
            <View style={styles.navRowText}>
              <Text style={styles.navRowTitle}>Requirements</Text>
              <Text style={styles.navRowSubtitle}>Author, review, freeze &amp; version requirement documents</Text>
            </View>
            <IconButton icon="chevron-right" size={22} style={{ margin: 0 }} />
          </TouchableOpacity>
        </Card>

        {/* Secrets — read-only vault. Anyone on the project may look; the server
            refuses a non-member, so the entry point is safe to always show. */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionCardTitle}>Secrets</Text>
              <Button
                compact
                mode="text"
                icon="key-variant"
                onPress={() =>
                  navigation.navigate('ProjectSecrets', {
                    projectId,
                    projectName: project.projectName,
                  })
                }
              >
                Open vault
              </Button>
            </View>
            <Text style={styles.hintText}>
              Credential names and environment keys. Revealing a value asks for your fingerprint or
              face and is recorded in the project's access log.
            </Text>
          </Card.Content>
        </Card>

        {/* Subprojects Section */}
        {!project.parentProjectId ? (
          <Card style={styles.sectionCard}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionCardTitle}>Sub-Projects</Text>
                {canManageProjects ? (
                  <Button compact mode="text" icon="plus" onPress={() => setIsAddSubprojectOpen(true)}>
                    Add Subproject
                  </Button>
                ) : null}
              </View>
              {project.subProjects && project.subProjects.length > 0 ? (
                <View style={styles.subprojectList}>
                  {project.subProjects.map(sub => (
                    <TouchableOpacity
                      key={sub.projectId}
                      style={styles.subprojectItem}
                      onPress={() => navigation.push('ProjectDetails', { projectId: sub.projectId })}
                    >
                      <View>
                        <Text style={styles.subprojectName}>{sub.projectName}</Text>
                        <Text style={styles.subprojectId}>{sub.projectId}</Text>
                      </View>
                      <View style={styles.subprojectRight}>
                        <View style={[styles.statusBadgeMini, { backgroundColor: getStatusColor(sub.status).bg }]}>
                          <Text style={[styles.statusBadgeTextMini, { color: getStatusColor(sub.status).text }]}>
                            {sub.status}
                          </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} style={{ margin: 0 }} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No sub-projects added yet.</Text>
              )}
            </Card.Content>
          </Card>
        ) : null}

        {/* Assigned Users Section */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionCardTitle}>Assigned Team Members</Text>
              {canManageProjects ? (
                <Button compact mode="text" icon="account-plus" onPress={() => setIsAddUserOpen(true)}>
                  Add User
                </Button>
              ) : null}
            </View>

            {assignedUsers.length > 0 ? (
              <View style={styles.usersList}>
                {assignedUsers.map(u => (
                  <View key={u.employeeId} style={styles.userItem}>
                    <Avatar.Text size={36} label={getInitials(u.userName)} style={styles.userAvatar} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{u.userName}</Text>
                      <Text style={styles.userDetails}>{u.employeeId} • {u.userDepartment || 'N/A'}</Text>
                      {/* Role in THIS project. The row used to show only the
                          global users.role, which says nothing about authority
                          here. Tap to cycle it if you manage the project. */}
                      <TouchableOpacity
                        disabled={!canManageProjects || settingRoleFor === u.employeeId}
                        onPress={() => handleSetProjectRole(u.employeeId, cycleProjectRole(u.role))}
                        style={[
                          styles.roleBadge,
                          { backgroundColor: u.role === 'manager' ? '#EDE9FE' : u.role === 'team_leader' ? '#E8F0FE' : '#F1F3F4' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            { color: u.role === 'manager' ? '#6D28D9' : u.role === 'team_leader' ? '#1967D2' : '#5F6368' },
                          ]}
                        >
                          {settingRoleFor === u.employeeId
                            ? 'saving…'
                            : u.role === 'team_leader'
                              ? 'team leader'
                              : u.role || 'member'}
                          {canManageProjects ? ' ›' : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {canManageProjects ? (
                      <IconButton
                        icon="close-circle-outline"
                        iconColor={materialColors.error}
                        size={22}
                        onPress={() => handleRemoveUser(u.employeeId, u.userName)}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No team members assigned to this project yet.</Text>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Portal Dialogs */}
      <Portal>
        {/* Assign User Modal */}
        <Dialog visible={isAddUserOpen} onDismiss={() => setIsAddUserOpen(false)}>
          <Dialog.Title>Assign User to Project</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Search User by Name/ID..."
              value={userSearch}
              onChangeText={setUserSearch}
              mode="outlined"
              style={{ marginBottom: 12 }}
            />
            <ScrollView style={{ maxHeight: 220 }}>
              {availableUsers.slice(0, 15).map(u => (
                <TouchableOpacity
                  key={u.employeeId}
                  style={styles.searchUserItem}
                  onPress={() => handleAssignUser(u.employeeId)}
                >
                  <Avatar.Text size={32} label={getInitials(u.name)} style={{ marginRight: 10, backgroundColor: colors.primary }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', color: colors.text }}>{u.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{u.employeeId} • {u.department}</Text>
                  </View>
                  <IconButton icon="plus-circle" iconColor={colors.primary} size={22} />
                </TouchableOpacity>
              ))}
              {availableUsers.length === 0 ? (
                <Text style={{ textAlign: 'center', padding: 20, color: '#999' }}>No users match the search</Text>
              ) : null}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsAddUserOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Add Subproject Modal */}
        <Dialog visible={isAddSubprojectOpen} onDismiss={() => setIsAddSubprojectOpen(false)}>
          <Dialog.Title>Create Sub-Project</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Subproject Name *"
              value={subprojectName}
              onChangeText={setSubprojectName}
              mode="outlined"
              style={styles.modalInput}
            />
            <TextInput
              label="Description"
              value={subprojectDesc}
              onChangeText={setSubprojectDesc}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.modalInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsAddSubprojectOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleAddSubprojectSubmit} loading={isSubmittingSub} disabled={isSubmittingSub}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
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
  mainCard: {
    margin: materialSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  projectTitle: {
    ...materialTypography.headlineSmall,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  projectId: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginBottom: materialSpacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: materialSpacing.md,
  },
  sectionLabel: {
    ...materialTypography.bodySmall,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  descriptionText: {
    ...materialTypography.bodyMedium,
    color: colors.text,
  },
  divider: {
    marginVertical: materialSpacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: materialSpacing.md,
  },
  metaItem: {
    width: '50%',
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  metaValue: {
    ...materialTypography.bodyMedium,
    fontWeight: '600',
    color: colors.text,
  },
  mgmtRow: {
    flexDirection: 'row',
    marginTop: materialSpacing.sm,
  },
  sectionCard: {
    marginHorizontal: materialSpacing.md,
    marginBottom: materialSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: materialSpacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: materialSpacing.sm,
    paddingHorizontal: materialSpacing.md,
  },
  navRowText: {
    flex: 1,
    marginLeft: materialSpacing.xs,
  },
  navRowTitle: {
    ...materialTypography.titleMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  navRowSubtitle: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionCardTitle: {
    ...materialTypography.titleMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  subprojectList: {
    gap: 8,
  },
  subprojectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subprojectName: {
    ...materialTypography.bodyLarge,
    fontWeight: 'bold',
    color: colors.text,
  },
  subprojectId: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  subprojectRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeMini: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeTextMini: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyText: {
    ...materialTypography.bodyMedium,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  usersList: {
    gap: 8,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatar: {
    backgroundColor: colors.primary,
    marginRight: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...materialTypography.bodyMedium,
    fontWeight: 'bold',
    color: colors.text,
  },
  userDetails: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  hintText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  searchUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editForm: {
    gap: 12,
  },
  input: {
    backgroundColor: colors.surface,
  },
  selectLabel: {
    ...materialTypography.bodyMedium,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    minWidth: 100,
  },
  modalInput: {
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  releaseConfig: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: materialSpacing.md,
    marginTop: materialSpacing.xs,
  },
  releaseToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  releaseHint: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
})
