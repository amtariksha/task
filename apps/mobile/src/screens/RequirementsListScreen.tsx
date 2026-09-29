/**
 * Requirements List Screen
 * List requirements for a project, create new ones, freeze document versions,
 * and view frozen versions read-only.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import {
  Card,
  Text,
  Button,
  TextInput,
  Portal,
  Dialog,
  Divider,
  Chip,
  ActivityIndicator,
  Menu,
  Switch,
} from 'react-native-paper'
import { useTheme } from '../contexts/ThemeContext'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import apiClient from '../services/apiClient'
import { SearchablePicker } from '../components/SearchablePicker'
import { getUserData } from '../utils/secureStorage'
import { getAllUsers, User } from '../services/userService'
import { formatDateTimeIST } from '../utils/datetime'
import {
  getRequirements,
  getRequirementBaselines,
  getRequirementEditAccess,
  createRequirement,
  createRequirementBaseline,
  Requirement,
  RequirementBaseline,
  BaselineSnapshotItem,
} from '../services/requirementService'
import {
  REQUIREMENT_STATUSES,
  getRequirementStatusStyle,
  getSectionLabelStyle,
  htmlToPlainText,
} from '../utils/requirementHelpers'

interface RouteParams {
  projectId: string
  projectName?: string
}

interface SubprojectOption {
  projectId: string
  projectName: string
}

export default function RequirementsListScreen() {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { projectId, projectName } = (route.params || {}) as RouteParams

  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [baselines, setBaselines] = useState<RequirementBaseline[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [subprojects, setSubprojects] = useState<SubprojectOption[]>([])

  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')
  // Answered by the server (requirementEditAccess). Creating and freezing were
  // offered to every project member, including viewers.
  const [canEdit, setCanEdit] = useState(false)
  /** Reviewers must be project members — the picker listed the whole company. */
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Controls
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [includeSubprojects, setIncludeSubprojects] = useState(false)

  // Version viewer
  const [versionMenuVisible, setVersionMenuVisible] = useState(false)
  const [viewerBaseline, setViewerBaseline] = useState<RequirementBaseline | null>(null)

  // Freeze dialog
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [freezeVersionLabel, setFreezeVersionLabel] = useState('')
  const [freezeReleaseNote, setFreezeReleaseNote] = useState('')
  const [freezing, setFreezing] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createReviewer, setCreateReviewer] = useState('')
  const [createSubproject, setCreateSubproject] = useState('')
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const user = await getUserData()
      setCurrentUser(user)

      const reqs = await getRequirements(projectId, {
        includeSubprojects,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      })
      setRequirements(reqs)

      const bls = await getRequirementBaselines(projectId)
      setBaselines(bls)

      setAccessError('')

      const usersRes = await getAllUsers()
      setUsers(usersRes.success ? (usersRes.data || []) : [])

      // Fetched separately from the requirements: a failure in either must not
      // take the other down with it.
      setCanEdit(await getRequirementEditAccess(projectId))

      // Reviewer/assignee candidates are the project's members, not every user in
      // the company — a non-member cannot even open the requirement to review it.
      try {
        const membersRes = await apiClient.get(`/api/projects/${projectId}/users`)
        const rows = membersRes?.success && Array.isArray(membersRes.data) ? membersRes.data : []
        setProjectMembers(
          rows.map((pu: any) => ({
            employeeId: pu.employeeId,
            name: pu.userName || pu.name || pu.employeeId,
          })) as User[]
        )
      } catch (memberErr) {
        console.error('Failed to load project members', memberErr)
        setProjectMembers([])
      }

      // Subprojects are non-fatal — leave [] on failure.
      try {
        const p: any = await apiClient.get(`/api/projects/${projectId}`)
        setSubprojects(p?.subProjects || p?.data?.subProjects || [])
      } catch (subErr) {
        console.error('Failed to load subprojects', subErr)
        setSubprojects([])
      }
    } catch (err) {
      console.error('Failed to load requirements', err)
      const message = (err as any)?.message || 'Something went wrong'
      // A non-member gets FORBIDDEN here. That is an answer, not a crash: show it
      // on the screen instead of an alert over an empty list.
      if (/FORBIDDEN|not a member/i.test(message)) {
        setAccessError('You are not a member of this project, so its requirements are not visible to you.')
        setRequirements([])
      } else {
        setAccessError('')
        Alert.alert('Error', message)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId, includeSubprojects, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  // Client-side search over the loaded list (title or requirementId).
  const filteredRequirements = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return requirements
    return requirements.filter(
      (r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.requirementId || '').toLowerCase().includes(q)
    )
  }, [requirements, search])

  const snapshotItems = useMemo<BaselineSnapshotItem[]>(() => {
    if (!viewerBaseline) return []
    try {
      return JSON.parse(viewerBaseline.snapshotJson || '[]') as BaselineSnapshotItem[]
    } catch (parseErr) {
      console.error('Failed to parse snapshot', parseErr)
      return []
    }
  }, [viewerBaseline])

  const handleFreeze = async () => {
    try {
      setFreezing(true)
      const result = await createRequirementBaseline(
        projectId,
        freezeVersionLabel.trim() || undefined,
        freezeReleaseNote.trim() || undefined
      )
      Alert.alert(
        'Version frozen',
        `Frozen as v${result.versionLabel}. Any unapproved requirements were approved as part of the freeze.`
      )
      setFreezeOpen(false)
      setFreezeVersionLabel('')
      setFreezeReleaseNote('')
      loadData()
    } catch (err) {
      Alert.alert('Error', (err as any)?.message || 'Something went wrong')
    } finally {
      setFreezing(false)
    }
  }

  const handleCreate = async () => {
    if (!createTitle.trim()) {
      Alert.alert('Validation', 'Title is required')
      return
    }
    try {
      setCreating(true)
      const created = await createRequirement({
        projectId,
        title: createTitle.trim(),
        reviewerId: createReviewer || null,
        subprojectId: createSubproject || null,
      })
      setCreateOpen(false)
      setCreateTitle('')
      setCreateReviewer('')
      setCreateSubproject('')
      loadData()
      navigation.navigate('RequirementDetails', {
        requirementId: created.requirementId,
        projectId,
      })
    } catch (err) {
      Alert.alert('Error', (err as any)?.message || 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  const reviewerItems = useMemo(() => {
    // Fall back to every user only if the member list could not be loaded, so the
    // picker is never empty when the server is partly unavailable.
    const candidates = projectMembers.length > 0 ? projectMembers : users
    return [
      { label: '- None -', value: '' },
      ...candidates.map((u) => ({ label: `${u.name} (${u.employeeId})`, value: u.employeeId })),
    ]
  }, [projectMembers, users])

  const subprojectItems = useMemo(
    () => [
      { label: '- Main project -', value: '' },
      ...subprojects.map((s) => ({ label: s.projectName, value: s.projectId })),
    ],
    [subprojects]
  )

  const renderBadge = (label: string, style: { bg: string; text: string }) => (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>{label}</Text>
    </View>
  )

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (accessError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyText}>{accessError}</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          Go Back
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Project header card */}
        <Card style={styles.mainCard}>
          <Card.Content>
            <Text style={styles.projectTitle}>{projectName || projectId}</Text>
            <Text style={styles.projectSubtitle}>
              {requirements.length} requirement{requirements.length === 1 ? '' : 's'}
            </Text>
          </Card.Content>
        </Card>

        {/* Controls */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <TextInput
              label="Search by title or ID"
              value={search}
              onChangeText={setSearch}
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="magnify" />}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Include sub-projects</Text>
              <Switch
                value={includeSubprojects}
                onValueChange={setIncludeSubprojects}
                color={colors.primary}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {['All', ...REQUIREMENT_STATUSES].map((s) => (
                <Chip
                  key={s}
                  mode={statusFilter === s ? 'flat' : 'outlined'}
                  selected={statusFilter === s}
                  onPress={() => setStatusFilter(s)}
                  style={styles.filterChip}
                  compact
                >
                  {s}
                </Chip>
              ))}
            </ScrollView>
          </Card.Content>
        </Card>

        {/* Version bar */}
        {baselines.length > 0 && (
          <Card style={styles.sectionCard}>
            <Card.Content>
              <View style={styles.versionBarRow}>
                <Text style={styles.versionBarLabel}>Frozen versions</Text>
                <Menu
                  visible={versionMenuVisible}
                  onDismiss={() => setVersionMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      icon="history"
                      compact
                      onPress={() => setVersionMenuVisible(true)}
                    >
                      View version
                    </Button>
                  }
                >
                  {baselines.map((b) => (
                    <Menu.Item
                      key={b.id}
                      onPress={() => {
                        setVersionMenuVisible(false)
                        setViewerBaseline(b)
                      }}
                      title={`v${b.versionLabel} - ${formatDateTimeIST(b.createdAt)}`}
                    />
                  ))}
                </Menu>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Freeze current version — an edit, so writers only */}
        {canEdit ? (
          <View style={styles.freezeRow}>
            <Button
              mode="outlined"
              icon="lock"
              onPress={() => setFreezeOpen(true)}
              style={styles.freezeBtn}
            >
              Freeze current version
            </Button>
          </View>
        ) : null}

        {/* Requirements list */}
        <View style={styles.listWrap}>
          {filteredRequirements.length === 0 ? (
            <Text style={styles.emptyText}>
              {search.trim() || statusFilter !== 'All'
                ? 'No requirements match this search or filter.'
                : canEdit
                  ? 'No requirements yet. Tap New Requirement to add one.'
                  : 'No requirements yet.'}
            </Text>
          ) : (
            filteredRequirements.map((r) => {
              const statusStyle = getRequirementStatusStyle(r.status)
              return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.navigate('RequirementDetails', {
                      requirementId: r.requirementId,
                      projectId,
                    })
                  }
                >
                  <Card style={styles.reqCard}>
                    <Card.Content>
                      <View style={styles.reqTopRow}>
                        <Text style={styles.reqId}>{r.requirementId}</Text>
                        {renderBadge(r.status, statusStyle)}
                      </View>
                      <Text style={styles.reqTitle} numberOfLines={2}>
                        {r.title}
                      </Text>
                      <Text style={styles.reqMeta}>
                        {r.sections.length} section{r.sections.length === 1 ? '' : 's'}
                        {r.reviewerUser ? `  •  Reviewer: ${r.reviewerUser.name}` : ''}
                      </Text>
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              )
            })
          )}
        </View>

        {/* New requirement */}
        {canEdit ? (
          <View style={styles.newReqRow}>
            <Button
              mode="contained"
              icon="plus"
              onPress={() => setCreateOpen(true)}
              style={styles.newReqBtn}
            >
              New Requirement
            </Button>
          </View>
        ) : null}
      </ScrollView>

      <Portal>
        {/* Freeze dialog */}
        <Dialog visible={freezeOpen} onDismiss={() => setFreezeOpen(false)}>
          <Dialog.Title>Freeze current version</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Release note"
              value={freezeReleaseNote}
              onChangeText={setFreezeReleaseNote}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.modalInput}
            />
            <TextInput
              label="Version label"
              value={freezeVersionLabel}
              onChangeText={setFreezeVersionLabel}
              mode="outlined"
              style={styles.modalInput}
            />
            <Text style={styles.helperText}>blank = auto minor bump, e.g. 1.0 to 1.1</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setFreezeOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleFreeze} loading={freezing} disabled={freezing}>
              Freeze
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Create dialog */}
        <Dialog visible={createOpen} onDismiss={() => setCreateOpen(false)}>
          <Dialog.Title>New Requirement</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogScrollContent}>
              <TextInput
                label="Title *"
                value={createTitle}
                onChangeText={setCreateTitle}
                mode="outlined"
                style={styles.modalInput}
              />
              <SearchablePicker
                label="Reviewer"
                selectedValue={createReviewer}
                onValueChange={setCreateReviewer}
                items={reviewerItems}
                placeholder="- None -"
              />
              {subprojects.length > 0 && (
                <SearchablePicker
                  label="Sub-project"
                  selectedValue={createSubproject}
                  onValueChange={setCreateSubproject}
                  items={subprojectItems}
                  placeholder="- Main project -"
                />
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleCreate} loading={creating} disabled={creating}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Read-only version viewer */}
        <Dialog
          visible={!!viewerBaseline}
          onDismiss={() => setViewerBaseline(null)}
          style={styles.viewerDialog}
        >
          <Dialog.Title>Frozen version</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogScrollContent}>
              {viewerBaseline && (
                <>
                  <View style={styles.viewerBanner}>
                    <Text style={styles.viewerBannerText}>
                      Viewing frozen v{viewerBaseline.versionLabel} - read only
                    </Text>
                  </View>
                  {viewerBaseline.releaseNote ? (
                    <Text style={styles.viewerReleaseNote}>
                      Release note: {viewerBaseline.releaseNote}
                    </Text>
                  ) : null}

                  {snapshotItems.length === 0 ? (
                    <Text style={styles.emptyText}>No content in this version.</Text>
                  ) : (
                    snapshotItems.map((item, idx) => (
                      <View key={`${item.requirementId}-${idx}`} style={styles.viewerItem}>
                        <View style={styles.viewerItemHeader}>
                          <Text style={styles.viewerItemTitle}>{item.title}</Text>
                          {renderBadge(item.status, getRequirementStatusStyle(item.status))}
                        </View>
                        {[...item.sections]
                          .sort((a, b) => a.position - b.position)
                          .map((sec, sIdx) => (
                            <View key={sIdx} style={styles.viewerSection}>
                              <View style={styles.viewerSectionHead}>
                                <Text style={styles.viewerSectionHeading}>
                                  {sec.heading} - {sec.label}
                                </Text>
                                {renderBadge(sec.label, getSectionLabelStyle(sec.label))}
                              </View>
                              <Text style={styles.viewerSectionBody}>
                                {htmlToPlainText(sec.contentHtml)}
                              </Text>
                            </View>
                          ))}
                        {idx < snapshotItems.length - 1 && <Divider style={styles.viewerDivider} />}
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setViewerBaseline(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  )
}

const getStyles = (colors: any, responsive: any) =>
  StyleSheet.create({
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
    },
    projectSubtitle: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: 4,
    },
    sectionCard: {
      marginHorizontal: materialSpacing.md,
      marginBottom: materialSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    input: {
      backgroundColor: colors.surface,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: materialSpacing.sm,
      marginBottom: materialSpacing.sm,
    },
    switchLabel: {
      ...materialTypography.bodyMedium,
      color: colors.text,
      fontWeight: '600',
    },
    chipRow: {
      gap: 8,
      paddingVertical: 4,
    },
    filterChip: {
      marginRight: 4,
    },
    versionBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    versionBarLabel: {
      ...materialTypography.titleMedium,
      fontWeight: 'bold',
      color: colors.text,
    },
    freezeRow: {
      marginHorizontal: materialSpacing.md,
      marginBottom: materialSpacing.md,
    },
    freezeBtn: {
      borderColor: colors.primary,
    },
    listWrap: {
      marginHorizontal: materialSpacing.md,
      gap: 10,
    },
    reqCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    reqTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    reqId: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
    },
    reqTitle: {
      ...materialTypography.bodyLarge,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 6,
    },
    reqMeta: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
    },
    emptyText: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 24,
    },
    newReqRow: {
      margin: materialSpacing.md,
      marginTop: materialSpacing.lg,
    },
    newReqBtn: {
      borderRadius: 8,
      paddingVertical: 4,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    modalInput: {
      marginBottom: 12,
      backgroundColor: colors.surface,
    },
    helperText: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: -4,
    },
    dialogScrollContent: {
      paddingVertical: materialSpacing.sm,
    },
    viewerDialog: {
      maxHeight: '85%',
    },
    viewerBanner: {
      backgroundColor: materialColors.warning || '#FEF7E0',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: materialSpacing.sm,
    },
    viewerBannerText: {
      ...materialTypography.bodyMedium,
      color: '#5F4300',
      fontWeight: '700',
    },
    viewerReleaseNote: {
      ...materialTypography.bodyMedium,
      color: colors.text,
      marginBottom: materialSpacing.md,
      fontStyle: 'italic',
    },
    viewerItem: {
      marginBottom: materialSpacing.md,
    },
    viewerItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: materialSpacing.sm,
      gap: 8,
    },
    viewerItemTitle: {
      ...materialTypography.titleMedium,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    viewerSection: {
      marginBottom: materialSpacing.sm,
      paddingLeft: materialSpacing.sm,
    },
    viewerSectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
      gap: 8,
    },
    viewerSectionHeading: {
      ...materialTypography.bodyMedium,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    viewerSectionBody: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    viewerDivider: {
      marginTop: materialSpacing.md,
      backgroundColor: colors.border,
    },
  })
