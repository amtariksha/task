/**
 * Bug Details Screen
 * View bug details, comments, subtasks, timer, log hours
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native'
import { Card, Text, Surface, Button, TextInput, ActivityIndicator, Chip, Divider, IconButton } from 'react-native-paper'
import {
  getBugByIdRest,
  getBugComments,
  addBugComment,
  updateBug,
  updateBugReleaseState,
  Bug,
  BugComment,
} from '../services/bugService'
import ReleaseChecklistView from '../components/ReleaseChecklistView'
import { ReleaseState } from '../types'
import { getCurrentUser, User } from '../services/userService'
import { getStatusColor, getStatusTextColor, getSeverityColor, getSeverityTextColor,
  getBugTypeDisplayName,
} from '../utils/bugHelpers'
import { useRoute, useNavigation } from '@react-navigation/native'
import BugSubtasks from '../components/BugSubtasks'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { formatDateTimeIST } from '../utils/datetime'
import UnifiedTimeline from '../components/UnifiedTimeline'
import BugChecklistManager from '../components/BugChecklistManager'
import RelatedItemsManager from '../components/RelatedItemsManager'
import BugFlow from '../components/BugFlow'
import QuickActionsModal from '../components/QuickActionsModal'

export default function BugDetailsScreen() {
  const route = useRoute()
  const navigation = useNavigation()
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()

  const { bugId } = route.params as { bugId: string }

  const [bug, setBug] = useState<Bug | null>(null)
  const [comments, setComments] = useState<BugComment[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editedStatus, setEditedStatus] = useState('')
  const [editedPriority, setEditedPriority] = useState('')
  const [editedDescription, setEditedDescription] = useState('')

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const user = await getCurrentUser()
      setCurrentUser(user)

      // Fetch over REST so `releaseState` (omitted by the GraphQL selection)
      // is present for release work-items.
      const [bugResponse, commentsResponse] = await Promise.all([
        getBugByIdRest(bugId),
        getBugComments(bugId),
      ])

      if (bugResponse.success && bugResponse.data) {
        setBug(bugResponse.data)
        // Initialize edit form with current values
        setEditedStatus(bugResponse.data.status)
        setEditedPriority(bugResponse.data.priority)
        setEditedDescription(bugResponse.data.description)
      } else if (!bugResponse.success) {
        const err = (bugResponse.error || '').toLowerCase()
        if (err.includes('forbidden') || err.includes('no access') || err.includes('403')) {
          Alert.alert(
            'No Access',
            "You don't have access to this item. It may belong to a project you're not assigned to.",
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          )
          return
        }
        // Handle other errors (like "Not found")
        setError(bugResponse.error || 'Failed to load bug details')
      }

      if (commentsResponse.success && commentsResponse.data) {
        setComments(commentsResponse.data)
      }
    } catch (error) {
      console.error('Failed to load bug details:', error)
      Alert.alert('Error', 'Failed to load bug details')
    } finally {
      setIsLoading(false)
    }
  }, [bugId, navigation])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Add edit and quick action buttons to header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        !isEditing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              icon="flash"
              size={24}
              iconColor={colors.primary}
              onPress={() => setQuickActionsVisible(true)}
              disabled={isOffline}
            />
            <IconButton
              icon="pencil"
              size={24}
              iconColor={colors.primary}
              onPress={() => setIsEditing(true)}
              disabled={isOffline}
            />
          </View>
        ) : null
      ),
    })
  }, [navigation, isEditing, isOffline, colors.primary])

  const handleSave = useCallback(async () => {
    if (!bug) return

    try {
      setIsSaving(true)

      const updates: Partial<Bug> = {
        status: editedStatus,
        priority: editedPriority,
        description: editedDescription,
      }

      const response = await updateBug(bugId, updates)

      if (response.success) {
        Alert.alert('Success', `${getBugTypeDisplayName(bug?.type)} updated successfully`)
        setIsEditing(false)
        loadData()
      } else {
        Alert.alert('Error', response.error || 'Failed to update bug')
      }
    } catch (error) {
      console.error('Failed to update bug:', error)
      Alert.alert('Error', 'Failed to update bug')
    } finally {
      setIsSaving(false)
    }
  }, [bug, editedStatus, editedPriority, editedDescription, bugId, loadData])

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !currentUser) return

    try {
      setIsSubmittingComment(true)
      const response = await addBugComment(
        bugId,
        newComment.trim(),
        currentUser.employeeId
      )

      if (response.success) {
        setNewComment('')
        // Reload comments
        const commentsResponse = await getBugComments(bugId)
        if (commentsResponse.success && commentsResponse.data) {
          setComments(commentsResponse.data)
        }
      } else {
        Alert.alert('Error', response.error || 'Failed to add comment')
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
      Alert.alert('Error', 'Failed to add comment')
    } finally {
      setIsSubmittingComment(false)
    }
  }, [newComment, currentUser, bugId, loadData])

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!bug) return

    try {
      const response = await updateBug(bugId, { status: newStatus })
      if (response.success && response.data) {
        setBug(response.data)
        Alert.alert('Success', 'Status updated successfully')
      } else {
        Alert.alert('Error', response.error || 'Failed to update status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      Alert.alert('Error', 'Failed to update status')
    }
  }, [bug, bugId])

  const handleReleaseStateChange = useCallback(async (nextState: ReleaseState) => {
    if (!bug) return
    // Optimistic update, then persist via REST PATCH.
    const previous = bug
    setBug({ ...bug, releaseState: nextState })
    try {
      const response = await updateBugReleaseState(bugId, nextState)
      if (!response.success) {
        setBug(previous)
        Alert.alert('Error', response.error || 'Failed to save release checklist')
      }
    } catch (error) {
      console.error('Failed to save release state:', error)
      setBug(previous)
      Alert.alert('Error', 'Failed to save release checklist')
    }
  }, [bug, bugId])

  const formatTime = useCallback((milliseconds?: number | string): string => {
    if (!milliseconds) return '00:00:00'
    const ms = typeof milliseconds === 'string' ? Number(milliseconds) : milliseconds
    if (isNaN(ms)) return '00:00:00'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')
      }:${seconds.toString().padStart(2, '0')} `
  }, [])

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading bug details...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <Surface style={styles.errorContainer} elevation={0}>
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={loadData} style={{ marginTop: 16 }}>
          Retry
        </Button>
      </Surface>
    )
  }

  if (!bug) {
    return (
      <Surface style={styles.errorContainer} elevation={0}>
        <Text style={styles.errorText}>Item not found</Text>
      </Surface>
    )
  }

  const isRelease = bug.type === 'release'
  // Features, bugs and releases all live in the bugs table; the headings said
  // "Bug" regardless of which one the user actually filed.
  const itemNoun = getBugTypeDisplayName(bug.type)

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header Card */}
        <Card style={styles.headerCard} elevation={1}>
          <Card.Content>
            <View style={styles.header}>
              <Text style={styles.bugId}>{bug.bugId}</Text>
              <View style={styles.badges}>
                <Chip
                  mode="flat"
                  compact
                  style={[styles.statusChip, { backgroundColor: getStatusColor(bug.status, colors) }]}
                  textStyle={[styles.chipText, { color: getStatusTextColor(bug.status, colors) }]}
                >
                  {bug.status}
                </Chip>
                <Chip
                  mode="flat"
                  compact
                  style={[styles.severityChip, { backgroundColor: getSeverityColor(bug.severity, colors) }]}
                  textStyle={[styles.chipText, { color: getSeverityTextColor(bug.severity, colors) }]}
                >
                  {bug.severity}
                </Chip>
              </View>
            </View>
            <Text style={styles.title}>{bug.title}</Text>
          </Card.Content>
        </Card>

        {/* Description Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{isRelease ? 'Release Notes' : 'Description'}</Text>
            <Divider style={styles.divider} />
            <Text style={styles.description}>{bug.description}</Text>
          </Card.Content>
        </Card>

        {/* Release Checklist (release work-items only) */}
        {isRelease && (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Release Checklist</Text>
              <Divider style={styles.divider} />
              <ReleaseChecklistView
                bug={bug}
                canEdit={!isOffline}
                onChange={handleReleaseStateChange}
              />
            </Card.Content>
          </Card>
        )}

        {/* Convert Test Case to Bug button */}
        {bug.type === 'testcase' && (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Convert to Bug</Text>
              <Divider style={styles.divider} />
              <Text style={[styles.description, { marginBottom: materialSpacing.sm }]}>
                Promote this test case to a tracked bug. Title, description,
                behaviors, logs, and project context will be pre-filled on the
                new bug; this test case stays linked to it.
              </Text>
              <Button
                mode="contained"
                icon="bug"
                onPress={() => {
                  (navigation as any).navigate('CreateBug', {
                    convertFrom: bug.bugId,
                    type: 'bug',
                    title: bug.title,
                    description: bug.description,
                    expectedBehavior: (bug as any).expectedBehavior || '',
                    actualBehavior: (bug as any).actualBehavior || '',
                    serverLogs: (bug as any).serverLogs || '',
                    frontendLogs: (bug as any).frontendLogs || '',
                    projectId: bug.projectId || '',
                    subprojectId: (bug as any).subprojectId || '',
                    category: bug.category || '',
                    severity: bug.severity || '',
                    platform: bug.platform || '',
                    environment: bug.environment || '',
                  })
                }}
                disabled={isOffline}
              >
                Convert to Bug
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Expected Behavior */}
        {(bug as any).expectedBehavior ? (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Expected Behavior</Text>
              <Divider style={styles.divider} />
              <Text style={styles.description}>{(bug as any).expectedBehavior}</Text>
            </Card.Content>
          </Card>
        ) : null}

        {/* Actual Behavior */}
        {(bug as any).actualBehavior ? (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Actual Behavior</Text>
              <Divider style={styles.divider} />
              <Text style={styles.description}>{(bug as any).actualBehavior}</Text>
            </Card.Content>
          </Card>
        ) : null}

        {/* Server Logs */}
        {(bug as any).serverLogs ? (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Server Logs</Text>
              <Divider style={styles.divider} />
              <Text style={[styles.description, styles.logsText]} selectable>
                {(bug as any).serverLogs}
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        {/* Frontend Logs */}
        {(bug as any).frontendLogs ? (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Frontend Logs</Text>
              <Divider style={styles.divider} />
              <Text style={[styles.description, styles.logsText]} selectable>
                {(bug as any).frontendLogs}
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        {/* Bug Information Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{itemNoun} Information</Text>
            <Divider style={styles.divider} />
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Category</Text>
                <Text style={styles.infoValue}>{bug.category}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Platform</Text>
                <Text style={styles.infoValue}>{bug.platform}</Text>
              </View>
              {bug.environment && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Environment</Text>
                  <Text style={styles.infoValue}>{bug.environment}</Text>
                </View>
              )}
              {bug.browser && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Browser</Text>
                  <Text style={styles.infoValue}>{bug.browser}</Text>
                </View>
              )}
              {bug.device && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Device</Text>
                  <Text style={styles.infoValue}>{bug.device}</Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Time Tracking Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Time Tracking</Text>
            <Divider style={styles.divider} />
            <View style={styles.timeContainer}>
              <Surface style={styles.timeItem} elevation={0}>
                <Text style={styles.timeLabel}>Timer</Text>
                <Text style={styles.timeValue}>
                  0:00
                </Text>
              </Surface>
              <Surface style={styles.timeItem} elevation={0}>
                <Text style={styles.timeLabel}>Logged Hours</Text>
                <Text style={styles.timeValue}>
                  {bug.actualHours ? Number(bug.actualHours).toFixed(2) : '0.00'} hrs
                </Text>
              </Surface>
            </View>
          </Card.Content>
        </Card>

        {/* Metadata Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Metadata</Text>
            <Divider style={styles.divider} />
            <View style={styles.infoGrid}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Created:</Text>
                <Text style={styles.infoValue}>{formatDateTimeIST(bug.createdAt)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Updated:</Text>
                <Text style={styles.infoValue}>{formatDateTimeIST(bug.updatedAt)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Reporter</Text>
                <Text style={styles.infoValue}>{bug.reportedBy}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Subtasks Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <BugSubtasks bugId={bugId} editable={true} />
          </Card.Content>
        </Card>

        {/* Bug Flow Section (not applicable to releases) */}
        {!isRelease && (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>{itemNoun} Flow</Text>
              <Divider style={styles.divider} />
              <BugFlow currentStatus={bug.status} />
            </Card.Content>
          </Card>
        )}

        {/* Activity & Comments Section (Unified Timeline) */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Activity & Comments</Text>
            <Divider style={styles.divider} />
            <View style={styles.timelineContainer}>
              <UnifiedTimeline
                entityType="bug"
                entityId={bugId}
                showCommentInput={true}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Checklists Section (releases use the Release Checklist above instead) */}
        {!isRelease && (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Checklists</Text>
              <Divider style={styles.divider} />
              <View style={styles.checklistContainer}>
                <BugChecklistManager
                  bugId={bugId}
                  canEdit={!isOffline}
                />
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Related Items Section */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Related Items</Text>
            <Divider style={styles.divider} />
            <View style={styles.relatedItemsContainer}>
              <RelatedItemsManager
                itemId={bugId}
                itemType="bug"
                onItemPress={(item) => {
                  if (item.type === 'task') {
                    (navigation as any).push('TaskDetails', { taskId: item.id })
                  } else {
                    (navigation as any).push('BugDetails', { bugId: item.id })
                  }
                }}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Edit Form */}
        {isEditing && (
          <Card style={styles.sectionCard} elevation={1}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Edit Bug</Text>
              <Divider style={styles.divider} />

              {/* Status */}
              <Text style={styles.fieldLabel}>Status</Text>
              <TextInput
                mode="outlined"
                value={editedStatus}
                onChangeText={setEditedStatus}
                style={styles.textInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                disabled={isOffline}
              />

              {/* Priority */}
              <Text style={styles.fieldLabel}>Priority</Text>
              <TextInput
                mode="outlined"
                value={editedPriority}
                onChangeText={setEditedPriority}
                style={styles.textInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                disabled={isOffline}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                mode="outlined"
                value={editedDescription}
                onChangeText={setEditedDescription}
                multiline
                numberOfLines={4}
                style={styles.textInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                disabled={isOffline}
              />

              {/* Save/Cancel Buttons */}
              <View style={styles.editActions}>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setIsEditing(false)
                    setEditedStatus(bug.status)
                    setEditedPriority(bug.priority)
                    setEditedDescription(bug.description)
                  }}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSave}
                  loading={isSaving}
                  disabled={isSaving || isOffline}
                  style={styles.saveButton}
                  buttonColor={colors.primary}
                  textColor="#FFFFFF"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Comments Card */}
        <Card style={styles.sectionCard} elevation={1}>
          <Card.Content>
            <Text style={styles.sectionTitle}>
              Comments ({comments.length})
            </Text>
            <Divider style={styles.divider} />
            {comments.map((comment, index) => (
              <Surface key={index} style={styles.comment} elevation={0}>
                <Text style={styles.commentUser}>{comment.userId}</Text>
                <Text style={styles.commentText}>{comment.comment}</Text>
                <Text style={styles.commentTime}>
                  {formatDateTimeIST(comment.createdAt)}
                </Text>
              </Surface>
            ))}

            {/* Add Comment */}
            <View style={styles.addCommentContainer}>
              <TextInput
                mode="outlined"
                placeholder="Add a comment..."
                value={newComment}
                onChangeText={setNewComment}
                multiline
                numberOfLines={3}
                style={styles.commentInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                disabled={isOffline}
              />
              <Button
                mode="contained"
                onPress={handleAddComment}
                disabled={!newComment.trim() || isSubmittingComment || isOffline}
                loading={isSubmittingComment}
                style={styles.commentButton}
                buttonColor={colors.primary}
                textColor="#FFFFFF"
              >
                {isSubmittingComment ? 'Posting...' : 'Post Comment'}
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Status Change Buttons */}
      <Surface style={styles.actionBar} elevation={3}>
        {bug.status !== 'In Progress' && (
          <Button
            mode="contained"
            onPress={() => handleStatusChange('In Progress')}
            style={styles.actionButton}
            buttonColor={colors.warning}
            textColor="#000000"
            disabled={isOffline}
          >
            Start Progress
          </Button>
        )}
        {bug.status !== 'Resolved' && (
          <Button
            mode="contained"
            onPress={() => handleStatusChange('Resolved')}
            style={styles.actionButton}
            buttonColor={colors.success}
            textColor="#FFFFFF"
            disabled={isOffline}
          >
            Mark Resolved
          </Button>
        )}
      </Surface>
      <QuickActionsModal
        visible={quickActionsVisible}
        onDismiss={() => setQuickActionsVisible(false)}
        type="bug"
        item={bug}
        onSuccess={loadData}
      />
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
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    padding: materialSpacing.md,
  },
  headerCard: {
    marginBottom: materialSpacing.md,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: materialSpacing.sm,
  },
  bugId: {
    ...materialTypography.headlineMedium,
    color: colors.primary,
    fontWeight: '700',
  },
  badges: {
    flexDirection: 'row',
    gap: materialSpacing.xs,
  },
  statusChip: {
    height: 28,
  },
  severityChip: {
    height: 28,
  },
  chipText: {
    ...materialTypography.labelMedium,
    color: colors.surface,
  },
  title: {
    ...materialTypography.titleLarge,
    color: colors.text,
    marginTop: materialSpacing.xs,
  },
  sectionCard: {
    marginBottom: materialSpacing.md,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    ...materialTypography.titleMedium,
    color: colors.text,
    marginBottom: materialSpacing.xs,
  },
  divider: {
    marginBottom: materialSpacing.md,
    backgroundColor: colors.border,
  },
  description: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  logsText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
    backgroundColor: colors.surfaceVariant,
    padding: materialSpacing.sm,
    borderRadius: 6,
  },
  infoGrid: {
    gap: materialSpacing.sm,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: materialSpacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
  },
  infoValue: {
    ...materialTypography.bodyMedium,
    color: colors.text,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: materialSpacing.xs,
  },
  timeContainer: {
    flexDirection: 'row',
    gap: materialSpacing.md,
  },
  timeItem: {
    flex: 1,
    padding: materialSpacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    alignItems: 'center',
  },
  timeLabel: {
    ...materialTypography.labelMedium,
    color: colors.textSecondary,
    marginBottom: materialSpacing.xs,
  },
  timeValue: {
    ...materialTypography.headlineSmall,
    color: colors.text,
    fontWeight: '700',
  },
  comment: {
    padding: materialSpacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    marginBottom: materialSpacing.sm,
  },
  commentUser: {
    ...materialTypography.labelLarge,
    color: colors.text,
    fontWeight: '600',
    marginBottom: materialSpacing.xs,
  },
  commentText: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: materialSpacing.xs,
  },
  commentDate: {
    ...materialTypography.labelSmall,
    color: colors.textTertiary,
  },
  commentTime: {
    ...materialTypography.labelSmall,
    color: colors.textTertiary,
    alignSelf: 'flex-end',
    marginTop: materialSpacing.xs,
  },
  addCommentContainer: {
    marginTop: materialSpacing.md,
    gap: materialSpacing.sm,
  },
  commentInput: {
    backgroundColor: colors.surface,
  },
  commentButton: {
    marginTop: materialSpacing.xs,
  },
  actionBar: {
    flexDirection: 'row',
    padding: materialSpacing.md,
    gap: materialSpacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
  },
  fieldLabel: {
    ...materialTypography.labelMedium,
    color: colors.textSecondary,
    marginTop: materialSpacing.md,
    marginBottom: materialSpacing.xs,
  },
  textInput: {
    backgroundColor: colors.surface,
  },
  editActions: {
    flexDirection: 'row',
    gap: materialSpacing.sm,
    marginTop: materialSpacing.lg,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
  },
  saveButton: {
    flex: 1,
    borderRadius: 8,
  },
  timelineContainer: {
    minHeight: 200,
    maxHeight: 500,
  },
  checklistContainer: {
    minHeight: 150,
    maxHeight: 400,
  },
  relatedItemsContainer: {
    minHeight: 150,
    maxHeight: 400,
  },
})

