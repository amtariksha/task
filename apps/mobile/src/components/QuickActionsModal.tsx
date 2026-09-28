import React, { useState, useEffect } from 'react'
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native'
import { Portal, Dialog, Button, TextInput, Text, IconButton, Chip } from 'react-native-paper'
import { SearchablePicker } from './SearchablePicker'
import { updateTask } from '../services/taskService'
import { updateBug, addBugComment } from '../services/bugService'
import { post } from '../services/apiClient'
import { useTheme } from '../contexts/ThemeContext'
import { getAllUsers } from '../services/userService'
import { getUserData } from '../utils/secureStorage'
import DateTimePicker from '@react-native-community/datetimepicker'
import { MaterialCommunityIcons } from '@expo/vector-icons'

interface QuickActionsModalProps {
  visible: boolean
  onDismiss: () => void
  type: 'task' | 'bug'
  item: any // task or bug object
  users?: any[] // optional, will be loaded internally if not passed
  onSuccess: () => void // call to refresh parent list
}

export default function QuickActionsModal({
  visible,
  onDismiss,
  type,
  item,
  users,
  onSuccess
}: QuickActionsModalProps) {
  const { colors } = useTheme()
  const [internalUsers, setInternalUsers] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [assignedTo, setAssignedTo] = useState('')
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dueDate, setDueDate] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Fetch users & current user internally if needed
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        if (!users || users.length === 0) {
          const res = await getAllUsers()
          if (res.success && res.data) {
            setInternalUsers(res.data)
          }
        }
      } catch (error) {
        console.error('Failed to load users in QuickActionsModal:', error)
      }
    }
    const fetchCurrentUser = async () => {
      try {
        const u = await getUserData()
        setCurrentUser(u)
      } catch (error) {
        console.error('Failed to load current user in QuickActionsModal:', error)
      }
    }
    
    if (visible) {
      fetchUsers()
      fetchCurrentUser()
    }
  }, [visible, users])

  useEffect(() => {
    if (item) {
      if (type === 'task') {
        const assignedArray = Array.isArray(item.assignedTo) ? item.assignedTo : []
        setAssignedTo(assignedArray[0] || '')
      } else {
        setAssignedTo(item.assignedTo || '')
      }

      if (item.endDate) {
        const parsedDate = new Date(item.endDate)
        if (!isNaN(parsedDate.getTime())) {
          setDueDate(parsedDate)
        } else {
          setDueDate(new Date())
        }
      } else {
        setDueDate(new Date())
      }
    }
    setCommentText('')
  }, [item, type, visible])

  const statusOptions = type === 'task'
    ? ['Yet to Start', 'In Progress', 'Delayed', 'Done', 'Cancel', 'Hold', 'ReOpened', 'Stop']
    : ['New', 'In Progress', 'Resolved', 'Closed', 'ReOpened']

  const priorityOptions = type === 'task'
    ? ['U&I (Urgent & Important)', 'NU&I (Not Urgent & Important)', 'NI&U (Not Important & Urgent)', 'NU&NI (Not Urgent & Not Important)']
    : ['High', 'Medium', 'Low']

  const formatReadableDate = (dateStr?: string) => {
    if (!dateStr) return 'Not Set'
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  /**
   * The task/bug services resolve with { success: false, error } instead of
   * throwing, so every handler here `await`ed the call and then announced
   * "Success" — including on a 403 from the server's authorization checks.
   * Throwing turns the existing catch blocks into real error reporting.
   */
  const assertOk = (result: { success?: boolean; error?: string }, fallback: string) => {
    if (!result?.success) throw new Error(result?.error || fallback)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!item) return
    if (newStatus === item.status) {
      onDismiss()
      return
    }
    try {
      setSubmitting(true)
      const result = type === 'task'
        ? await updateTask(item.taskId, { status: newStatus })
        : await updateBug(item.bugId, { status: newStatus })
      assertOk(result, 'Failed to update status')
      Alert.alert('Success', `Status updated to: ${newStatus}`)
      onSuccess()
      onDismiss()
    } catch (error: any) {
      console.error('Failed to update status:', error)
      Alert.alert('Error', error?.message || 'Failed to update status')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePriorityChange = async (newPriority: string) => {
    if (!item) return
    if (newPriority === item.priority) {
      onDismiss()
      return
    }
    try {
      setSubmitting(true)
      const result = type === 'task'
        ? await updateTask(item.taskId, { priority: newPriority })
        : await updateBug(item.bugId, { priority: newPriority })
      assertOk(result, 'Failed to update priority')
      Alert.alert('Success', `Priority updated to: ${newPriority}`)
      onSuccess()
      onDismiss()
    } catch (error: any) {
      console.error('Failed to update priority:', error)
      Alert.alert('Error', error?.message || 'Failed to update priority')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReassign = async (newAssignee: string) => {
    if (!item) return
    const oldAssignee = type === 'task' ? (Array.isArray(item.assignedTo) ? item.assignedTo[0] : item.assignedTo) : item.assignedTo
    if (newAssignee === oldAssignee) {
      onDismiss()
      return
    }
    try {
      setSubmitting(true)
      const result = type === 'task'
        ? await updateTask(item.taskId, { assignedTo: newAssignee })
        : await updateBug(item.bugId, { assignedTo: newAssignee })
      assertOk(result, 'Failed to reassign')
      Alert.alert('Success', 'Assignee updated successfully')
      setAssignedTo(newAssignee)
      onSuccess()
      onDismiss()
    } catch (error: any) {
      console.error('Failed to reassign:', error)
      Alert.alert('Error', error?.message || 'Failed to reassign')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDateChange = async (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios')
    if (selectedDate && item) {
      setDueDate(selectedDate)
      const dateStr = selectedDate.toISOString().split('T')[0]
      try {
        setSubmitting(true)
        const result = type === 'task'
          ? await updateTask(item.taskId, { endDate: dateStr })
          : await updateBug(item.bugId, { endDate: dateStr })
        assertOk(result, 'Failed to update due date')
        Alert.alert('Success', 'Due date updated successfully')
        onSuccess()
        onDismiss()
      } catch (error: any) {
        console.error('Failed to update due date:', error)
        Alert.alert('Error', error?.message || 'Failed to update due date')
      } finally {
        setSubmitting(false)
      }
    }
  }

  const handleAddComment = async () => {
    if (!item || !commentText.trim()) return
    try {
      setSubmitting(true)
      const result = type === 'task'
        ? await post('/api/activity-log', {
            entityType: 'task',
            entityId: item.taskId,
            actionType: 'comment',
            description: commentText.trim(),
            isComment: true
          })
        : await addBugComment(
            item.bugId,
            commentText.trim(),
            currentUser?.employeeId || 'system'
          )
      assertOk(result, 'Failed to add comment')
      Alert.alert('Success', 'Comment added successfully')
      setCommentText('')
      onSuccess()
      onDismiss()
    } catch (error: any) {
      console.error('Failed to add comment:', error)
      Alert.alert('Error', error?.message || 'Failed to add comment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkComplete = async () => {
    if (!item) return
    try {
      setSubmitting(true)
      const targetStatus = type === 'task' ? 'Done' : 'Resolved'
      const result = type === 'task'
        ? await updateTask(item.taskId, { status: targetStatus })
        : await updateBug(item.bugId, { status: targetStatus })
      assertOk(result, 'Failed to complete item')
      Alert.alert('Success', `${type === 'task' ? 'Task' : 'Bug'} marked as completed`)
      onSuccess()
      onDismiss()
    } catch (error: any) {
      console.error('Failed to complete item:', error)
      Alert.alert('Error', error?.message || 'Failed to complete item')
    } finally {
      setSubmitting(false)
    }
  }

  const activeUsers = users && users.length > 0 ? users : internalUsers
  const userItems = activeUsers.map(u => ({
    label: u.name,
    value: u.employeeId
  }))

  const itemId = item ? (type === 'task' ? item.taskId : item.bugId) : ''
  const isCompleted = item ? (type === 'task' ? item.status === 'Done' : item.status === 'Resolved') : false

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <Dialog.Title style={{ color: colors.text, fontSize: 18, fontWeight: 'bold' }}>
          Quick Actions: {itemId}
        </Dialog.Title>
        <Dialog.Content style={{ paddingBottom: 8, paddingHorizontal: 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Mark Complete Action */}
            {!isCompleted && (
              <Button
                mode="contained"
                icon="check-circle"
                buttonColor={colors.success || '#4CAF50'}
                textColor="#FFFFFF"
                style={styles.completeButton}
                labelStyle={{ fontWeight: 'bold' }}
                onPress={handleMarkComplete}
                disabled={submitting}
              >
                Mark Complete
              </Button>
            )}

            {/* Status Section */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="format-list-bulleted" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Status</Text>
            </View>
            <View style={styles.chipRow}>
              {statusOptions.map((opt) => {
                const isActive = item?.status === opt;
                return (
                  <Chip
                    key={opt}
                    selected={isActive}
                    onPress={() => handleStatusChange(opt)}
                    style={[
                      styles.actionChip,
                      { backgroundColor: isActive ? colors.primary : colors.surfaceVariant }
                    ]}
                    selectedColor={isActive ? '#ffffff' : colors.textSecondary}
                    textStyle={{ fontSize: 12 }}
                    disabled={submitting}
                  >
                    {opt}
                  </Chip>
                );
              })}
            </View>

            {/* Priority Section */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Change Priority</Text>
            </View>
            <View style={styles.chipRow}>
              {priorityOptions.map((opt) => {
                const isActive = item?.priority === opt;
                return (
                  <Chip
                    key={opt}
                    selected={isActive}
                    onPress={() => handlePriorityChange(opt)}
                    style={[
                      styles.actionChip,
                      { backgroundColor: isActive ? colors.primary : colors.surfaceVariant }
                    ]}
                    selectedColor={isActive ? '#ffffff' : colors.textSecondary}
                    textStyle={{ fontSize: 12 }}
                    disabled={submitting}
                  >
                    {opt}
                  </Chip>
                );
              })}
            </View>

            {/* Reassign Section */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="account-arrow-right" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Reassign</Text>
            </View>
            <SearchablePicker
              label="Assignee"
              placeholder="Select User"
              selectedValue={assignedTo}
              onValueChange={handleReassign}
              items={userItems}
              disabled={submitting}
            />

            {/* Set Due Date Section */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="calendar-month" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Due Date</Text>
            </View>
            <Button
              mode="outlined"
              icon="calendar"
              onPress={() => setShowDatePicker(true)}
              style={styles.dateButton}
              textColor={colors.text}
              disabled={submitting}
            >
              {item?.endDate ? `Due Date: ${formatReadableDate(item.endDate)}` : 'Set Due Date'}
            </Button>

            {/* Comments Section */}
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="message-text-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Add Comment</Text>
            </View>
            <View style={styles.commentRow}>
              <TextInput
                mode="outlined"
                placeholder="Type comment..."
                value={commentText}
                onChangeText={setCommentText}
                style={styles.commentInput}
                textColor={colors.text}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                disabled={submitting}
              />
              <IconButton
                icon="send"
                iconColor={colors.primary}
                size={24}
                disabled={!commentText.trim() || submitting}
                onPress={handleAddComment}
              />
            </View>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={submitting}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={dueDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
    maxHeight: '90%'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  actionChip: {
    borderRadius: 8,
    marginBottom: 2
  },
  completeButton: {
    borderRadius: 12,
    marginBottom: 8,
    paddingVertical: 4
  },
  dateButton: {
    borderRadius: 8,
    justifyContent: 'flex-start',
    alignItems: 'center'
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'transparent'
  }
})
