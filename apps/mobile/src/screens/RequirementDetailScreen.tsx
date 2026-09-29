/**
 * Requirement Detail Screen
 * Full requirement editor: header/meta, sections CRUD + history/restore + reorder,
 * approval workflow, lifecycle status, DEV handoff + traceability, per-requirement rollback.
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
  IconButton,
  ActivityIndicator,
} from 'react-native-paper'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import { SearchablePicker } from '../components/SearchablePicker'
import { getUserData } from '../utils/secureStorage'
import { getAllUsers, User } from '../services/userService'
import apiClient from '../services/apiClient'
import { formatDateTimeIST } from '../utils/datetime'
import {
  getRequirement,
  getRequirementEditAccess,
  getSectionRevisions,
  getRequirementBaselines,
  updateRequirement,
  createRequirementSection,
  updateRequirementSection,
  deleteRequirementSection,
  reorderRequirementSections,
  restoreRequirementSectionRevision,
  submitRequirementForReview,
  approveRequirement,
  rejectRequirement,
  updateRequirementStatus,
  deleteRequirement,
  rollbackRequirementToVersion,
  createDevItemFromRequirement,
  Requirement,
  RequirementSection,
  RequirementSectionRevision,
  RequirementBaseline,
} from '../services/requirementService'
import {
  SECTION_LABELS,
  getRequirementStatusStyle,
  getSectionLabelStyle,
  hasRichFormatting,
  htmlToPlainText,
  plainTextToHtml,
  previewText,
  sectionContentUnchanged,
} from '../utils/requirementHelpers'
import {
  canCreateDevItem,
  canDeleteRequirement,
  canReviewRequirement,
  canSubmitForReview,
  lifecycleStatusOptions,
} from '../utils/requirementPermissions'

type RouteParams = {
  requirementId: string
  projectId?: string
}

export default function RequirementDetailScreen() {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { requirementId } = (route.params || {}) as RouteParams

  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [requirement, setRequirement] = useState<Requirement | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [users, setUsers] = useState<User[]>([])
  /** Reviewers and DEV assignees must be project members, not any company user. */
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [baselines, setBaselines] = useState<RequirementBaseline[]>([])
  // Answered by the server (requirementEditAccess). Every edit control used to be
  // shown to every project member, so a viewer collected a FORBIDDEN per tap.
  const [canEdit, setCanEdit] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Header edit dialog
  const [editHeaderOpen, setEditHeaderOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editReviewerId, setEditReviewerId] = useState('')
  const [savingHeader, setSavingHeader] = useState(false)

  // Approval / lifecycle
  const [submitting, setSubmitting] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveNote, setApproveNote] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Create section dialog
  const [createSectionOpen, setCreateSectionOpen] = useState(false)
  const [newHeading, setNewHeading] = useState('New section')
  const [newLabel, setNewLabel] = useState<string>(SECTION_LABELS[0])
  const [newContent, setNewContent] = useState('')
  const [creatingSection, setCreatingSection] = useState(false)

  // Edit section dialog
  const [editSection, setEditSection] = useState<RequirementSection | null>(null)
  const [editSectionHeading, setEditSectionHeading] = useState('')
  const [editSectionLabel, setEditSectionLabel] = useState<string>(SECTION_LABELS[0])
  const [editSectionContent, setEditSectionContent] = useState('')
  const [savingSection, setSavingSection] = useState(false)

  // History dialog
  const [historySection, setHistorySection] = useState<RequirementSection | null>(null)
  const [revisions, setRevisions] = useState<RequirementSectionRevision[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [restoringRevId, setRestoringRevId] = useState<string | null>(null)

  // DEV handoff dialog
  const [devOpen, setDevOpen] = useState(false)
  const [devAssignee, setDevAssignee] = useState('')
  const [creatingDev, setCreatingDev] = useState(false)

  const [reordering, setReordering] = useState(false)

  const handleError = useCallback((err: unknown) => {
    Alert.alert('Error', (err as any)?.message || 'Something went wrong')
  }, [])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [req, user, usersRes] = await Promise.all([
        getRequirement(requirementId),
        getUserData(),
        getAllUsers(),
      ])

      if (!req) {
        setRequirement(null)
        setError('Requirement not found')
        return
      }

      setRequirement(req)
      setCurrentUser(user)
      setUsers(usersRes.success ? usersRes.data || [] : [])

      // Fetched separately: a failure here must not blank the requirement itself.
      setCanEdit(await getRequirementEditAccess(req.projectId))

      // A non-member cannot open the requirement, so offering them as reviewer or
      // DEV assignee only produced a dead end.
      try {
        const membersRes = await apiClient.get(`/api/projects/${req.projectId}/users`)
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

      try {
        const bl = await getRequirementBaselines(req.projectId)
        setBaselines(bl)
      } catch {
        setBaselines([])
      }
    } catch (err) {
      setError((err as any)?.message || 'Failed to load requirement')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [requirementId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  // Picker item builders
  // Fall back to every user only when the member list could not be loaded, so the
  // pickers are never empty just because one request failed.
  const candidates = projectMembers.length > 0 ? projectMembers : users

  const reviewerItems = useMemo(
    () => [
      { label: '- None -', value: '' },
      ...candidates.map((u) => ({ label: u.name, value: u.employeeId })),
    ],
    [candidates]
  )

  const assigneeItems = useMemo(
    () => [
      { label: '- Unassigned -', value: '' },
      ...candidates.map((u) => ({ label: u.name, value: u.employeeId })),
    ],
    [candidates]
  )

  const labelItems = useMemo(
    () => SECTION_LABELS.map((l) => ({ label: l, value: l })),
    []
  )

  const sortedSections = useMemo(
    () =>
      requirement
        ? [...requirement.sections].sort((a, b) => a.displayOrder - b.displayOrder)
        : [],
    [requirement]
  )

  const sortedApprovals = useMemo(
    () =>
      requirement
        ? [...requirement.approvals].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        : [],
    [requirement]
  )

  // --- Header edit ---
  const openEditHeader = () => {
    if (!requirement) return
    setEditTitle(requirement.title)
    setEditReviewerId(requirement.reviewerId || '')
    setEditHeaderOpen(true)
  }

  const handleSaveHeader = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Validation', 'Title is required')
      return
    }
    try {
      setSavingHeader(true)
      await updateRequirement(requirementId, {
        title: editTitle.trim(),
        reviewerId: editReviewerId || null,
      })
      setEditHeaderOpen(false)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setSavingHeader(false)
    }
  }

  // --- Approval / lifecycle ---
  const handleSubmitForReview = async () => {
    try {
      setSubmitting(true)
      await submitRequirementForReview(requirementId)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async () => {
    try {
      setApproving(true)
      await approveRequirement(requirementId, approveNote.trim() || undefined)
      setApproveOpen(false)
      setApproveNote('')
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!rejectNote.trim()) return
    try {
      setRejecting(true)
      await rejectRequirement(requirementId, rejectNote.trim())
      setRejectOpen(false)
      setRejectNote('')
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setRejecting(false)
    }
  }

  const handleChangeStatus = async (next: string) => {
    if (!next) return
    try {
      setChangingStatus(true)
      await updateRequirementStatus(requirementId, next)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setChangingStatus(false)
    }
  }

  // --- Sections ---
  const openCreateSection = () => {
    setNewHeading('New section')
    setNewLabel(SECTION_LABELS[0])
    setNewContent('')
    setCreateSectionOpen(true)
  }

  const handleCreateSection = async () => {
    try {
      setCreatingSection(true)
      await createRequirementSection({
        requirementId,
        heading: newHeading.trim() || 'New section',
        label: newLabel,
        contentHtml: plainTextToHtml(newContent),
      })
      setCreateSectionOpen(false)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setCreatingSection(false)
    }
  }

  const openEditSection = (section: RequirementSection) => {
    // A section authored on the web can hold lists, headings and emphasis that the
    // plain-text round trip cannot rebuild. Saving it here used to flatten it
    // silently, so those sections are read-only on mobile.
    if (hasRichFormatting(section.contentHtml)) {
      Alert.alert(
        'Formatted section',
        'This section was written with formatting (lists, headings or emphasis) that ' +
          'the mobile editor cannot preserve. Open it on the web to edit it.'
      )
      return
    }
    setEditSection(section)
    setEditSectionHeading(section.heading)
    setEditSectionLabel(section.label)
    setEditSectionContent(htmlToPlainText(section.contentHtml))
  }

  const handleSaveSection = async () => {
    if (!editSection) return

    // Every save writes a revision and returns an approved requirement to In
    // Review, so saving an untouched section was never harmless. Closing the
    // dialog with nothing changed now changes nothing.
    const unchanged =
      editSectionHeading.trim() === editSection.heading &&
      editSectionLabel === editSection.label &&
      sectionContentUnchanged(editSection.contentHtml, editSectionContent)
    if (unchanged) {
      setEditSection(null)
      return
    }

    try {
      setSavingSection(true)
      await updateRequirementSection(editSection.id, {
        heading: editSectionHeading.trim() || 'New section',
        label: editSectionLabel,
        contentHtml: plainTextToHtml(editSectionContent),
        lockVersion: editSection.lockVersion,
      })
      setEditSection(null)
      await loadData()
    } catch (err) {
      const message = (err as any)?.message || ''
      if (message.startsWith('CONFLICT')) {
        setEditSection(null)
        Alert.alert(
          'Section changed',
          'This section was updated by someone else. Reloading the latest version.'
        )
        await loadData()
      } else {
        handleError(err)
      }
    } finally {
      setSavingSection(false)
    }
  }

  const handleDeleteSection = (section: RequirementSection) => {
    Alert.alert('Delete section', `Delete "${section.heading}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRequirementSection(section.id)
            await loadData()
          } catch (err) {
            handleError(err)
          }
        },
      },
    ])
  }

  const handleMoveSection = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sortedSections.length) return
    const ids = sortedSections.map((s) => s.id)
    const swapped = ids[index]
    ids[index] = ids[target]
    ids[target] = swapped
    try {
      setReordering(true)
      await reorderRequirementSections(requirementId, ids)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setReordering(false)
    }
  }

  const openHistory = async (section: RequirementSection) => {
    setHistorySection(section)
    setRevisions([])
    try {
      setLoadingHistory(true)
      const revs = await getSectionRevisions(section.id)
      setRevisions(revs)
    } catch (err) {
      handleError(err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleRestoreRevision = (rev: RequirementSectionRevision) => {
    if (!historySection) return
    // Restoring overwrites whatever the section says now and adds a revision of
    // its own — and it was one tap in a scrolling list of near-identical rows.
    Alert.alert(
      'Restore this version?',
      `"${historySection.heading}" will be replaced with ${rev.editorName}'s version from ` +
        `${formatDateTimeIST(rev.createdAt)}. The current text becomes a revision you can restore back to.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => { void performRestoreRevision(rev) } },
      ]
    )
  }

  const performRestoreRevision = async (rev: RequirementSectionRevision) => {
    if (!historySection) return
    try {
      setRestoringRevId(rev.id)
      await restoreRequirementSectionRevision(historySection.id, rev.id)
      setHistorySection(null)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setRestoringRevId(null)
    }
  }

  /**
   * Delete the whole requirement. The server allows the author or a privileged
   * role (requirement-resolvers.deleteRequirement); there was no way to do it from
   * mobile at all, so an accidentally created requirement was permanent here.
   */
  const handleDeleteRequirement = () => {
    if (!requirement) return
    Alert.alert(
      'Delete this requirement?',
      `${requirement.requirementId} "${requirement.title}" and all its sections will be removed. ` +
        'This cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteRequirement(requirementId)
                navigation.goBack()
              } catch (err) {
                handleError(err)
              }
            })()
          },
        },
      ]
    )
  }

  // --- DEV handoff ---
  const openDev = () => {
    setDevAssignee('')
    setDevOpen(true)
  }

  const handleCreateDev = async () => {
    try {
      setCreatingDev(true)
      const result = await createDevItemFromRequirement(requirementId, devAssignee || undefined)
      setDevOpen(false)
      Alert.alert('DEV item created', 'Created ' + result.bugId)
      await loadData()
    } catch (err) {
      handleError(err)
    } finally {
      setCreatingDev(false)
    }
  }

  // --- Rollback ---
  const handleRollbackSelect = (baselineId: string) => {
    if (!baselineId) return
    const baseline = baselines.find((b) => b.id === baselineId)
    if (!baseline) return
    Alert.alert(
      'Roll back requirement',
      'Roll this requirement content back to v' +
        baseline.versionLabel +
        '? It will return to In Review for re-approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Roll back',
          style: 'destructive',
          onPress: async () => {
            try {
              await rollbackRequirementToVersion(requirementId, baseline.id)
              await loadData()
            } catch (err) {
              handleError(err)
            }
          },
        },
      ]
    )
  }

  // ---------- render helpers ----------
  const Badge = ({ badge, label }: { badge: { bg: string; text: string }; label: string }) => (
    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
      <Text style={[styles.badgeText, { color: badge.text }]}>{label}</Text>
    </View>
  )

  const renderMetaRow = (label: string, value: string) => (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )

  // ---------- loading / error ----------
  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error || !requirement) {
    return (
      <View style={styles.errorContainer}>
        <IconButton icon="alert-circle-outline" size={48} iconColor={materialColors.error} />
        <Text style={styles.errorText}>{error || 'Requirement not found'}</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          Go Back
        </Button>
      </View>
    )
  }

  const statusStyle = getRequirementStatusStyle(requirement.status)
  const actor = { employeeId: currentUser?.employeeId, role: currentUser?.role }
  const canSubmit = canEdit && canSubmitForReview(requirement.status)
  // Approve/Reject were shown to every project member; the server allows only the
  // designated reviewer (who is not the author) or a privileged role.
  const canReview = canReviewRequirement(requirement, actor)
  // The picker offered Implemented, which updateRequirementStatus always rejects.
  const lifecycleOptions = canEdit ? lifecycleStatusOptions(requirement, actor) : []
  // DEV items come from an Approved requirement only.
  const canCreateDev = canEdit && canCreateDevItem(requirement.status)
  const canDelete = canEdit && canDeleteRequirement(requirement, actor)

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* A. HEADER CARD */}
        <Card style={styles.mainCard}>
          <Card.Content>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{requirement.title}</Text>
              {canEdit ? (
                <IconButton icon="pencil" size={22} onPress={openEditHeader} style={{ margin: 0 }} />
              ) : null}
              {canDelete ? (
                <IconButton
                  icon="trash-can-outline"
                  size={22}
                  iconColor={colors.error}
                  onPress={handleDeleteRequirement}
                  style={{ margin: 0 }}
                />
              ) : null}
            </View>

            <View style={styles.statusRow}>
              <Badge badge={statusStyle} label={requirement.status} />
            </View>

            <Divider style={styles.divider} />

            {renderMetaRow('Requirement ID', requirement.requirementId)}
            {renderMetaRow('Project', requirement.projectId)}
            {requirement.subprojectId
              ? renderMetaRow('Subproject', requirement.subprojectId)
              : null}
            {renderMetaRow('Reviewer', requirement.reviewerUser?.name || '-')}
            {renderMetaRow(
              'Created by',
              requirement.createdByUser?.name || requirement.createdBy
            )}
            {renderMetaRow('Updated', formatDateTimeIST(requirement.updatedAt))}
          </Card.Content>
        </Card>

        {/* B. APPROVAL / LIFECYCLE CARD */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.cardTitle}>Approval & Lifecycle</Text>
            <Divider style={styles.divider} />

            <View style={styles.currentStatusRow}>
              <Text style={styles.currentStatusLabel}>Current status</Text>
              <Badge badge={statusStyle} label={requirement.status} />
            </View>

            {canSubmit ? (
              <Button
                mode="contained"
                icon="send"
                onPress={handleSubmitForReview}
                loading={submitting}
                disabled={submitting}
                style={styles.blockBtn}
              >
                Submit for Review
              </Button>
            ) : null}

            {canReview ? (
              <View style={styles.reviewActions}>
                <Button
                  mode="contained"
                  icon="check"
                  onPress={() => setApproveOpen(true)}
                  buttonColor={colors.success}
                  style={styles.reviewBtn}
                >
                  Approve
                </Button>
                <Button
                  mode="outlined"
                  icon="close"
                  textColor={colors.error}
                  onPress={() => setRejectOpen(true)}
                  style={[styles.reviewBtn, { borderColor: colors.error }]}
                >
                  Reject
                </Button>
              </View>
            ) : null}

            {lifecycleOptions.length > 0 ? (
              <View style={styles.statusPicker}>
                <SearchablePicker
                  label="Change status"
                  placeholder={changingStatus ? 'Updating…' : 'Select new status'}
                  selectedValue=""
                  onValueChange={handleChangeStatus}
                  items={lifecycleOptions.map((s) => ({ label: s, value: s }))}
                  disabled={changingStatus}
                />
              </View>
            ) : null}

            <Text style={styles.subHeading}>Approval history</Text>
            {sortedApprovals.length === 0 ? (
              <Text style={styles.emptyText}>No approval activity yet.</Text>
            ) : (
              sortedApprovals.map((ap) => (
                <View key={ap.id} style={styles.approvalItem}>
                  <View style={styles.approvalHeader}>
                    <Text style={styles.approvalName}>{ap.approverName}</Text>
                    <View style={styles.approvalHeaderRight}>
                      <Text
                        style={[
                          styles.approvalDecision,
                          {
                            color:
                              ap.decision === 'Approved'
                                ? colors.success
                                : ap.decision === 'Rejected'
                                ? colors.error
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {ap.decision}
                      </Text>
                      {ap.isCurrent ? (
                        <Chip compact style={styles.currentChip} textStyle={styles.currentChipText}>
                          current
                        </Chip>
                      ) : null}
                    </View>
                  </View>
                  {ap.note ? <Text style={styles.approvalNote}>{ap.note}</Text> : null}
                  <Text style={styles.approvalDate}>{formatDateTimeIST(ap.createdAt)}</Text>
                </View>
              ))
            )}
          </Card.Content>
        </Card>

        {/* C. SECTIONS CARD */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Sections</Text>
              {canEdit ? (
                <Button compact mode="text" icon="plus" onPress={openCreateSection}>
                  Add Section
                </Button>
              ) : null}
            </View>
            <Divider style={styles.divider} />

            {sortedSections.length === 0 ? (
              <Text style={styles.emptyText}>No sections yet.</Text>
            ) : (
              sortedSections.map((section, index) => {
                const body = htmlToPlainText(section.contentHtml)
                const labelStyle = getSectionLabelStyle(section.label)
                const isFormatted = hasRichFormatting(section.contentHtml)
                return (
                  <View key={section.id} style={styles.subCard}>
                    <View style={styles.subCardHeader}>
                      <Text style={styles.subCardHeading}>{section.heading}</Text>
                      <Badge badge={labelStyle} label={section.label} />
                    </View>

                    {body ? (
                      <Text style={styles.subCardBody}>{body}</Text>
                    ) : (
                      <Text style={styles.mutedBody}>No content yet.</Text>
                    )}

                    <Text style={styles.revisionCount}>
                      {section.revisionCount} revision(s)
                    </Text>

                    {isFormatted ? (
                      <Text style={styles.hintText}>
                        Formatted on the web — edit it there to keep its formatting.
                      </Text>
                    ) : null}

                    <View style={styles.sectionActions}>
                      {canEdit && !isFormatted ? (
                        <IconButton
                          icon="pencil"
                          size={20}
                          onPress={() => openEditSection(section)}
                          style={styles.actionIcon}
                        />
                      ) : null}
                      <IconButton
                        icon="history"
                        size={20}
                        onPress={() => openHistory(section)}
                        style={styles.actionIcon}
                      />
                      {canEdit ? (
                        <>
                          <IconButton
                            icon="arrow-up"
                            size={20}
                            disabled={index === 0 || reordering}
                            onPress={() => handleMoveSection(index, -1)}
                            style={styles.actionIcon}
                          />
                          <IconButton
                            icon="arrow-down"
                            size={20}
                            disabled={index === sortedSections.length - 1 || reordering}
                            onPress={() => handleMoveSection(index, 1)}
                            style={styles.actionIcon}
                          />
                          <IconButton
                            icon="trash-can-outline"
                            size={20}
                            iconColor={colors.error}
                            onPress={() => handleDeleteSection(section)}
                            style={styles.actionIcon}
                          />
                        </>
                      ) : null}
                    </View>
                  </View>
                )
              })
            )}

            <Text style={styles.hintText}>
              {canEdit
                ? 'Editing a section on mobile saves it as plain text. Sections written with formatting on the web are read-only here.'
                : 'You have read-only access to this project’s requirements.'}
            </Text>
          </Card.Content>
        </Card>

        {/* D. DEVELOPMENT CARD */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Development</Text>
              {canCreateDev ? (
                <Button compact mode="text" icon="rocket-launch-outline" onPress={openDev}>
                  Create DEV feature
                </Button>
              ) : null}
            </View>
            <Divider style={styles.divider} />

            {requirement.devLinks.length === 0 ? (
              <Text style={styles.emptyText}>No linked development items yet.</Text>
            ) : (
              requirement.devLinks.map((link) => {
                const devStyle = getRequirementStatusStyle(link.devStatus || '')
                return (
                  <TouchableOpacity
                    key={link.id}
                    style={styles.devItem}
                    onPress={() => navigation.navigate('BugDetails', { bugId: link.devId })}
                  >
                    <View style={styles.devItemMain}>
                      <Text style={styles.devId}>{link.devId}</Text>
                      {link.devTitle ? (
                        <Text style={styles.devTitle} numberOfLines={1}>
                          {link.devTitle}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.devItemRight}>
                      {link.devStatus ? <Badge badge={devStyle} label={link.devStatus} /> : null}
                      <IconButton icon="chevron-right" size={20} style={{ margin: 0 }} />
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </Card.Content>
        </Card>

        {/* E. VERSIONS / ROLLBACK CARD */}
        {canEdit && baselines.length > 0 ? (
          <Card style={styles.sectionCard}>
            <Card.Content>
              <Text style={styles.cardTitle}>Versions</Text>
              <Divider style={styles.divider} />
              <SearchablePicker
                label="Roll back to a frozen version"
                placeholder="Select a version"
                selectedValue=""
                onValueChange={handleRollbackSelect}
                items={baselines.map((b) => ({
                  label: 'v' + b.versionLabel + ' - ' + formatDateTimeIST(b.createdAt),
                  value: b.id,
                }))}
              />
              <Text style={styles.hintText}>
                Frozen versions are view-only in the list. This rolls back only this requirement and
                sends it back for approval.
              </Text>
            </Card.Content>
          </Card>
        ) : null}
      </ScrollView>

      {/* ---------- Portal Dialogs ---------- */}
      <Portal>
        {/* Edit header */}
        <Dialog visible={editHeaderOpen} onDismiss={() => setEditHeaderOpen(false)}>
          <Dialog.Title>Edit Requirement</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Title *"
              value={editTitle}
              onChangeText={setEditTitle}
              mode="outlined"
              style={styles.dialogInput}
            />
            <SearchablePicker
              label="Reviewer"
              selectedValue={editReviewerId}
              onValueChange={setEditReviewerId}
              items={reviewerItems}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditHeaderOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleSaveHeader}
              loading={savingHeader}
              disabled={savingHeader}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Approve */}
        <Dialog visible={approveOpen} onDismiss={() => setApproveOpen(false)}>
          <Dialog.Title>Approve Requirement</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Note (optional)"
              value={approveNote}
              onChangeText={setApproveNote}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleApprove}
              loading={approving}
              disabled={approving}
              buttonColor={colors.success}
            >
              Approve
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reject */}
        <Dialog visible={rejectOpen} onDismiss={() => setRejectOpen(false)}>
          <Dialog.Title>Reject Requirement</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Reason *"
              value={rejectNote}
              onChangeText={setRejectNote}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleReject}
              loading={rejecting}
              disabled={rejecting || !rejectNote.trim()}
              buttonColor={colors.error}
            >
              Reject
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Create section */}
        <Dialog visible={createSectionOpen} onDismiss={() => setCreateSectionOpen(false)}>
          <Dialog.Title>Add Section</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Heading"
              value={newHeading}
              onChangeText={setNewHeading}
              mode="outlined"
              style={styles.dialogInput}
            />
            <SearchablePicker
              label="Label"
              selectedValue={newLabel}
              onValueChange={setNewLabel}
              items={labelItems}
            />
            <TextInput
              label="Content"
              value={newContent}
              onChangeText={setNewContent}
              mode="outlined"
              multiline
              numberOfLines={5}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCreateSectionOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleCreateSection}
              loading={creatingSection}
              disabled={creatingSection}
            >
              Add
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Edit section */}
        <Dialog visible={editSection !== null} onDismiss={() => setEditSection(null)}>
          <Dialog.Title>Edit Section</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Heading"
              value={editSectionHeading}
              onChangeText={setEditSectionHeading}
              mode="outlined"
              style={styles.dialogInput}
            />
            <SearchablePicker
              label="Label"
              selectedValue={editSectionLabel}
              onValueChange={setEditSectionLabel}
              items={labelItems}
            />
            <TextInput
              label="Content"
              value={editSectionContent}
              onChangeText={setEditSectionContent}
              mode="outlined"
              multiline
              numberOfLines={5}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditSection(null)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleSaveSection}
              loading={savingSection}
              disabled={savingSection}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* History */}
        <Dialog visible={historySection !== null} onDismiss={() => setHistorySection(null)}>
          <Dialog.Title>Section History</Dialog.Title>
          <Dialog.Content>
            {loadingHistory ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : revisions.length === 0 ? (
              <Text style={styles.emptyText}>No revisions yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {revisions.map((rev) => (
                  <View key={rev.id} style={styles.revItem}>
                    <Text style={styles.revEditor}>{rev.editorName}</Text>
                    <Text style={styles.revDate}>{formatDateTimeIST(rev.createdAt)}</Text>
                    <Text style={styles.revPreview}>{previewText(rev.contentHtml)}</Text>
                    {canEdit ? (
                      <Button
                        compact
                        mode="outlined"
                        onPress={() => handleRestoreRevision(rev)}
                        loading={restoringRevId === rev.id}
                        disabled={restoringRevId !== null}
                        style={styles.restoreBtn}
                      >
                        Restore
                      </Button>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setHistorySection(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Create DEV item */}
        <Dialog visible={devOpen} onDismiss={() => setDevOpen(false)}>
          <Dialog.Title>Create DEV feature</Dialog.Title>
          <Dialog.Content>
            <SearchablePicker
              label="Assignee"
              selectedValue={devAssignee}
              onValueChange={setDevAssignee}
              items={assigneeItems}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDevOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleCreateDev}
              loading={creatingDev}
              disabled={creatingDev}
            >
              Create
            </Button>
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
    errorContainer: {
      flex: 1,
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
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
    sectionCard: {
      marginHorizontal: materialSpacing.md,
      marginBottom: materialSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      ...materialTypography.headlineSmall,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    statusRow: {
      flexDirection: 'row',
      marginTop: materialSpacing.xs,
    },
    divider: {
      marginVertical: materialSpacing.md,
      backgroundColor: colors.border,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    metaLabel: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      flex: 1,
    },
    metaValue: {
      ...materialTypography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      textAlign: 'right',
    },
    cardTitle: {
      ...materialTypography.titleMedium,
      fontWeight: 'bold',
      color: colors.text,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      alignSelf: 'flex-start',
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    // Approval / lifecycle
    currentStatusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: materialSpacing.md,
    },
    currentStatusLabel: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
    },
    blockBtn: {
      marginTop: materialSpacing.xs,
    },
    reviewActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: materialSpacing.xs,
    },
    reviewBtn: {
      flex: 1,
    },
    statusPicker: {
      marginTop: materialSpacing.xs,
    },
    subHeading: {
      ...materialTypography.bodyMedium,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: materialSpacing.md,
      marginBottom: materialSpacing.sm,
    },
    approvalItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: 8,
    },
    approvalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    approvalHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    approvalName: {
      ...materialTypography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    approvalDecision: {
      ...materialTypography.bodyMedium,
      fontWeight: '700',
    },
    approvalNote: {
      ...materialTypography.bodySmall,
      color: colors.text,
      marginTop: 4,
    },
    approvalDate: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
    },
    currentChip: {
      backgroundColor: colors.info,
      height: 22,
    },
    currentChipText: {
      fontSize: 10,
      color: '#FFFFFF',
      marginVertical: 0,
    },
    // Sections
    subCard: {
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: 10,
    },
    subCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    subCardHeading: {
      ...materialTypography.bodyLarge,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    subCardBody: {
      ...materialTypography.bodyMedium,
      color: colors.text,
      marginTop: 6,
    },
    mutedBody: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 6,
    },
    revisionCount: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 6,
    },
    sectionActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 4,
    },
    actionIcon: {
      margin: 0,
    },
    hintText: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: materialSpacing.sm,
    },
    // Development
    devItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginBottom: 8,
    },
    devItemMain: {
      flex: 1,
      paddingRight: 8,
    },
    devId: {
      ...materialTypography.bodyLarge,
      fontWeight: 'bold',
      color: colors.text,
    },
    devTitle: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    devItemRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    emptyText: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 16,
    },
    // Dialogs
    dialogInput: {
      marginBottom: 12,
      backgroundColor: colors.surface,
    },
    historyLoading: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    revItem: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    revEditor: {
      ...materialTypography.bodyMedium,
      fontWeight: '600',
      color: colors.text,
    },
    revDate: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    revPreview: {
      ...materialTypography.bodySmall,
      color: colors.text,
      marginTop: 4,
    },
    restoreBtn: {
      alignSelf: 'flex-start',
      marginTop: 8,
    },
  })
