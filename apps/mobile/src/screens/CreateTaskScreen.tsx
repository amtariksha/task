import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { TextInput, Button, Surface, Text, ActivityIndicator, SegmentedButtons, Switch } from 'react-native-paper'
import { SearchablePicker } from '../components/SearchablePicker'
import { MultiSelectPicker } from '../components/MultiSelectPicker'
import * as DocumentPicker from 'expo-document-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createTask } from '../services/taskService'
import { getAllUsers } from '../services/userService'
import { getUserData } from '../utils/secureStorage'
import { get } from '../services/apiClient'
import { getMainProjects, getSubprojects, type Project } from '../services/projectService'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialTypography, materialSpacing } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export default function CreateTaskScreen({ navigation }: any) {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectType, setSelectType] = useState('Normal')
  const [recursiveType, setRecursiveType] = useState('Weekly') // Default if recursive
  const [department, setDepartment] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [priority, setPriority] = useState('')
  const [status, setStatus] = useState('Open')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [projectId, setProjectId] = useState('')
  const [subprojectId, setSubprojectId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [support, setSupport] = useState<string[]>([]) // Support team members
  const [multiUserAssignment, setMultiUserAssignment] = useState(false) // Multi-user toggle (synced with web)
  const [assignees, setAssignees] = useState<string[]>([]) // Multi-user assignees
  const [attachedFile, setAttachedFile] = useState<any>(null)
  const [meetingLink, setMeetingLink] = useState('')
  const [meetingReminder, setMeetingReminder] = useState(false)

  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [subprojects, setSubprojects] = useState<Project[]>([])
  const [subprojectsError, setSubprojectsError] = useState<string | null>(null)
  const [settings, setSettings] = useState<any>({})
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [projectUsers, setProjectUsers] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Helper to safely format picker items and avoid undefined properties causing native Picker crashes
  const getPickerItems = (items: any) => {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => {
      if (typeof item === 'string') {
        return { id: `item-${index}`, label: item, value: item };
      }
      if (item && typeof item === 'object') {
        const val = item.value !== undefined ? item.value : (item.projectId || item.employeeId || item.settingValue || item.name || '');
        const label = item.label || item.projectName || item.name || val || '';
        const id = item.id !== undefined ? String(item.id) : (item.projectId || item.employeeId || `item-${index}`);
        return { id, label, value: val };
      }
      return { id: `item-${index}`, label: String(item), value: String(item) };
    });
  };

  // Only real projects are offered. A task filed under a made-up id belongs to
  // no project, so an empty or failed list is shown as such, never padded.
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const response = await getMainProjects()
      if (response.success) {
        setProjects(response.data)
        setProjectsError(null)
      } else {
        setProjects([])
        setProjectsError(response.error)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
      setProjects([])
      setProjectsError('Could not load projects')
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const loadInitialData = useCallback(async () => {
    try {
      // Get current user
      const user = await getUserData()
      if (user) {
        setCurrentUser(user)
        setAssignedTo(user.employeeId)
        setDepartment(user.department || '') // Default department from user
      }

      // Load users
      const usersResponse = await getAllUsers()
      if (usersResponse.success && usersResponse.data) {
        setUsers(usersResponse.data)
      }

      // Load settings
      const settingsResponse = await get('/api/settings')
      if (settingsResponse.success && settingsResponse.data) {
        const settingsMap: any = {}
        settingsResponse.data.forEach((setting: any) => {
          settingsMap[setting.key] = setting.value
        })
        setSettings(settingsMap)
      }

      // Set default dates
      const today = new Date().toISOString().split('T')[0]
      setStartDate(today)
      setEndDate(today)
    } catch (error) {
      console.error('Failed to load initial data:', error)
      Alert.alert('Error', 'Failed to load data')
    }
  }, [])

  // Loaded on its own so a failure elsewhere in the initial load cannot leave
  // the project picker stuck on "Loading".
  useEffect(() => {
    loadInitialData()
    loadProjects()
  }, [loadInitialData, loadProjects])


  // Fetch users assigned specifically to the selected project from the backend.
  // This ensures that assignees and support team members are scoped correctly to the project,
  // matching the business logic implemented in the web application.
  const loadProjectUsers = useCallback(async (pId: string) => {
    try {
      const response = await get(`/api/projects/${pId}/users`)
      if (response.success && response.data) {
        // Normalize the API response properties (userName -> name, userRole -> role)
        // so that picker and list components receive a uniform data shape.
        const normalized = response.data.map((pu: any) => ({
          ...pu,
          name: pu.userName || pu.name,
          role: pu.userRole || pu.role,
        }))
        setProjectUsers(normalized)
      } else {
        setProjectUsers([])
      }
    } catch (error) {
      console.error('Failed to load project users:', error)
      setProjectUsers([])
    }
  }, [])

  useEffect(() => {
    setSubprojects([])
    setSubprojectsError(null)
    if (!projectId) {
      setSubprojectId('')
      setProjectUsers([])
      return
    }
    loadProjectUsers(projectId)

    // A slow answer for the previously chosen project must not replace this one's.
    let cancelled = false
    getSubprojects(projectId)
      .then((response) => {
        if (cancelled) return
        if (response.success) {
          setSubprojects(response.data)
        } else {
          setSubprojectsError(response.error)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load subprojects:', error)
        if (!cancelled) setSubprojectsError('Could not load sub-projects')
      })
    return () => {
      cancelled = true
    }
  }, [projectId, loadProjectUsers])

  // The assignee defaults to the signed-in user before any project is chosen, so
  // it can end up naming someone who is not a member of the project that was
  // picked. The pickers are scoped to members; clear a stale value rather than
  // submitting an assignee the server will reject.
  useEffect(() => {
    if (!assignedTo || projectUsers.length === 0) return
    if (!projectUsers.some((u: any) => u.employeeId === assignedTo)) {
      setAssignedTo('')
    }
  }, [projectUsers, assignedTo])

  const validateTimeFormat = useCallback((time: string): boolean => {
    const timeRegex = /^(\d{1,2}):(\d{2}):(\d{2})$/
    const match = time.match(timeRegex)

    if (!match) return false

    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const seconds = parseInt(match[3], 10)

    return minutes < 60 && seconds < 60
  }, [])

  const convertTimeToHours = useCallback((time: string): number => {
    const [hours, minutes, seconds] = time.split(':').map(Number)
    return hours + (minutes / 60) + (seconds / 3600)
  }, [])

  const validateTimeFormatOptional = useCallback((time: string): boolean => {
    if (!time.trim()) return true // It is optional
    const timeRegex = /^(\d{1,2}):(\d{2}):(\d{2})$/
    const match = time.match(timeRegex)

    if (!match) return false

    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const seconds = parseInt(match[3], 10)

    return hours < 24 && minutes < 60 && seconds < 60
  }, [])

  const handleSubmit = useCallback(async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter task name')
      return
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please enter task description')
      return
    }

    if (!projectId) {
      Alert.alert('Error', 'Please select a project')
      return
    }

    if (!startDate || !endDate) {
      Alert.alert('Error', 'Please select start and end dates')
      return
    }

    if (startTime.trim() && !validateTimeFormatOptional(startTime)) {
      Alert.alert('Error', 'Please enter Start Time in hh:mm:ss format (e.g., 09:00:00)')
      return
    }

    if (dueTime.trim() && !validateTimeFormatOptional(dueTime)) {
      Alert.alert('Error', 'Please enter Due Time in hh:mm:ss format (e.g., 18:00:00)')
      return
    }

    if (!priority) {
      Alert.alert('Error', 'Please select priority')
      return
    }

    // Estimated hours is optional (synced with web)
    if (estimatedHours.trim() && !validateTimeFormat(estimatedHours)) {
      Alert.alert('Error', 'Please enter estimated hours in hh:mm:ss format (e.g., 02:30:00)')
      return
    }

    // Validate assignee(s) based on assignment mode
    if (multiUserAssignment) {
      if (assignees.length === 0) {
        Alert.alert('Error', 'Please select at least one assignee')
        return
      }
    } else {
      if (!assignedTo) {
        Alert.alert('Error', 'Please select assignee')
        return
      }
    }

    try {
      setIsSubmitting(true)

      // Convert estimated hours (optional, default 0)
      let estimatedHoursDecimal = 0
      if (estimatedHours.trim()) {
        estimatedHoursDecimal = convertTimeToHours(estimatedHours)
      }

      // Determine assignees based on multi-user mode
      const assignedToUsers: string[] = multiUserAssignment && assignees.length > 0
        ? assignees
        : [assignedTo]

      // Prepare payload
      let payload: any

      if (attachedFile) {
        // Use FormData for file upload
        const formData = new FormData()
        formData.append('name', name.trim())
        formData.append('selectType', selectType)
        if (selectType === 'Recursive') {
          formData.append('recursiveType', recursiveType)
        }
        formData.append('department', department)
        formData.append('description', description.trim())
        formData.append('assignedTo', JSON.stringify(assignedToUsers))
        formData.append('assignedBy', currentUser?.employeeId || '')
        if (support.length > 0) formData.append('support', JSON.stringify(support))
        formData.append('startDate', startDate)
        formData.append('endDate', endDate)
        formData.append('startTime', startTime.trim() || '')
        formData.append('dueTime', dueTime.trim() || '')
        formData.append('priority', priority)
        formData.append('estimatedHours', String(estimatedHoursDecimal))
        if (projectId) formData.append('projectId', projectId)
        if (subprojectId) formData.append('subprojectId', subprojectId)
        formData.append('status', status)
        formData.append('meetingLink', meetingLink.trim() || '')
        formData.append('meetingReminder', String(meetingReminder))

        // Append file
        formData.append('attachments', {
          uri: attachedFile.uri,
          name: attachedFile.name,
          type: attachedFile.mimeType || 'application/octet-stream',
        } as any)

        payload = formData
      } else {
        // Use JSON
        payload = {
          taskId: '',
          name: name.trim(),
          selectType: selectType as 'Normal' | 'Recursive',
          recursiveType: selectType === 'Recursive' ? recursiveType as any : undefined,
          department: department.trim(),
          description: description.trim(),
          assignedTo: assignedToUsers,
          assignedBy: currentUser?.employeeId || '',
          support: support.length > 0 ? support : undefined,
          startDate,
          endDate,
          startTime: startTime.trim() || undefined,
          dueTime: dueTime.trim() || undefined,
          priority,
          estimatedHours: estimatedHoursDecimal,
          projectId: projectId || undefined,
          subprojectId: subprojectId || undefined,
          status: status || 'Open',
          meetingLink: meetingLink.trim() || undefined,
          meetingReminder: meetingReminder,
        }
      }

      const response = await createTask(payload)

      if (response.success) {
        Alert.alert('Success', 'Task created successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ])
      } else {
        Alert.alert('Error', response.error || 'Failed to create task')
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      Alert.alert('Error', 'Failed to create task')
    } finally {
      setIsSubmitting(false)
    }
  }, [name, description, startDate, endDate, startTime, dueTime, priority, estimatedHours, assignedTo, assignees, multiUserAssignment, currentUser, projectId, subprojectId, status, support, attachedFile, selectType, recursiveType, department, convertTimeToHours, validateTimeFormat, validateTimeFormatOptional, navigation, meetingLink, meetingReminder])

  const taskStatuses = useMemo(() => settings.task_statuses || ['Open', 'In Progress', 'Delayed', 'On Hold', 'ReOpened', 'Cancelled', 'Completed'], [settings])
  const taskPriorities = useMemo(() => settings.task_priorities || ['U&I (Urgent & Important)', 'NU&I (Not Urgent & Important)', 'NI&U (Not Important & Urgent)', 'NU&NI (Not Urgent & Not Important)'], [settings])
  // Departments from API settings, matching web behavior (fallback to hardcoded defaults)
  const departmentOptions = useMemo(() => settings.departments || ['Management', 'Marketing', 'Sales', 'Operations', 'Accounts', 'HR', 'Research'], [settings])
  const recursionFrequencies = ['Daily', 'Weekly', 'Monthly', 'Annually']

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      })

      if (result.assets && result.assets.length > 0) {
        setAttachedFile(result.assets[0])
      }
    } catch (err) {
      console.warn(err)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <Surface style={styles.form} elevation={0}>
          {/* Task Type */}
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8, fontWeight: '500' }}>Task Type</Text>
          <SegmentedButtons
            value={selectType}
            onValueChange={setSelectType}
            buttons={[
              { value: 'Normal', label: 'Normal Task' },
              { value: 'Recursive', label: 'Recurring Task' },
            ]}
            style={{ marginBottom: 16 }}
          />

          {/* Recursion Type (only if Recursive) */}
          {selectType === 'Recursive' && (
            <SearchablePicker
              label="Frequency"
              selectedValue={recursiveType}
              onValueChange={setRecursiveType}
              items={recursionFrequencies.map((freq) => ({ label: freq, value: freq }))}
            />
          )}

          {/* Department (from API settings, synced with web) */}
          <SearchablePicker
            label="Department"
            placeholder="Select Department"
            selectedValue={department}
            onValueChange={setDepartment}
            items={getPickerItems(departmentOptions)}
          />

          {/* Task Name */}
          <TextInput
            mode="outlined"
            label="Task Name *"
            placeholder="Enter task name"
            value={name}
            onChangeText={setName}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Description */}
          <TextInput
            mode="outlined"
            label="Description *"
            placeholder="Enter task description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Project */}
          <SearchablePicker
            label="Project *"
            placeholder="Select Project"
            selectedValue={projectId}
            onValueChange={(value) => {
              console.log('Project selected:', value)
              setProjectId(value)
              setSubprojectId('')
            }}
            items={getPickerItems(projects)}
            disabled={isOffline || projects.length === 0}
          />
          {projectsLoading ? (
            <Text style={styles.helpText}>Loading your projects…</Text>
          ) : projectsError ? (
            <View style={styles.noticeRow}>
              <Text style={[styles.helpText, styles.noticeError, styles.noticeText]}>{projectsError}</Text>
              <Button mode="text" compact onPress={loadProjects} disabled={isOffline}>
                Retry
              </Button>
            </View>
          ) : projects.length === 0 ? (
            <Text style={styles.helpText}>
              No projects to choose from. Tasks can only be filed in projects you have been added to.
            </Text>
          ) : null}
          {subprojectsError ? (
            <Text style={[styles.helpText, styles.noticeError]}>{subprojectsError}</Text>
          ) : null}

          {/* Subproject */}
          {projectId && subprojects.length > 0 && (
            <SearchablePicker
              label="Subproject"
              placeholder="Select Subproject"
              selectedValue={subprojectId}
              onValueChange={(value) => {
                console.log('Subproject selected:', value)
                setSubprojectId(value)
              }}
              items={getPickerItems(subprojects)}
              disabled={isOffline}
            />
          )}

          {/* Priority */}
          <SearchablePicker
            label="Priority"
            placeholder="Select Priority"
            selectedValue={priority}
            onValueChange={setPriority}
            items={getPickerItems(taskPriorities)}
            required
          />

          {/* Status */}
          <SearchablePicker
            label="Status"
            selectedValue={status}
            onValueChange={setStatus}
            items={getPickerItems(taskStatuses)}
            required
          />

          {/* Task Assignment Section */}
          {/* Enables toggling between single-user assignment (default) and multi-user assignment, */}
          {/* in parity with the web dashboard. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '500' }}>Task Assignment</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Assign to multiple</Text>
              <Switch
                value={multiUserAssignment}
                onValueChange={(val) => {
                  setMultiUserAssignment(val)
                  if (val) {
                    setAssignees([])
                  } else {
                    setAssignedTo(currentUser?.employeeId || '')
                  }
                }}
                color={colors.primary}
              />
            </View>
          </View>

          {/* Scoped User Selection */}
          {/* Note: Assignees must belong to the selected project. Selection is disabled */}
          {/* and displays a placeholder prompting project selection if no project is active yet. */}
          {multiUserAssignment ? (
            <MultiSelectPicker
              label="Assign To Multiple Users *"
              placeholder={!projectId ? "Select a project first" : "Select assignees"}
              selectedValues={assignees}
              onValuesChange={setAssignees}
              items={(!projectId ? [] : projectUsers).map(u => ({
                label: `${u.name} (${u.employeeId})`,
                value: u.employeeId,
              }))}
              disabled={isOffline || !projectId}
            />
          ) : (
            <SearchablePicker
              label="Assigned To *"
              placeholder={!projectId ? "Select a project first" : "Select User"}
              selectedValue={assignedTo}
              onValueChange={setAssignedTo}
              items={getPickerItems(!projectId ? [] : projectUsers)}
              required
              disabled={isOffline || !projectId}
            />
          )}

          {/* Support Team Selection */}
          {/* Aligned with web logic: Only project-assigned users can be support members, */}
          {/* and the primary assignee is filtered out from selection to avoid duplicate role assignment. */}
          <MultiSelectPicker
            label="Support Team (Optional)"
            placeholder={!projectId ? "Select a project first" : "Select support members"}
            selectedValues={support}
            onValuesChange={setSupport}
            items={(!projectId ? [] : projectUsers)
              .filter(u => u.employeeId !== assignedTo)
              .map(u => ({
                label: u.name,
                value: u.employeeId,
              }))}
            disabled={isOffline || !projectId}
          />

          {/* Start Date */}
          <TextInput
            mode="outlined"
            label="Start Date *"
            placeholder="YYYY-MM-DD"
            value={startDate}
            onChangeText={setStartDate}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* End Date */}
          <TextInput
            mode="outlined"
            label="End Date *"
            placeholder="YYYY-MM-DD"
            value={endDate}
            onChangeText={setEndDate}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Start Time */}
          <TextInput
            mode="outlined"
            label="Start Time (Optional, hh:mm:ss)"
            placeholder="09:00:00"
            value={startTime}
            onChangeText={setStartTime}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Due Time */}
          <TextInput
            mode="outlined"
            label="Due Time (Optional, hh:mm:ss)"
            placeholder="18:00:00"
            value={dueTime}
            onChangeText={setDueTime}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Estimated Hours (Optional, synced with web) */}
          <TextInput
            mode="outlined"
            label="Estimated Hours (hh:mm:ss, Optional)"
            placeholder="02:30:00"
            value={estimatedHours}
            onChangeText={setEstimatedHours}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />
          <Text style={styles.helpText}>
            Enter time in hh:mm:ss format (e.g., 02:30:00 for 2.5 hours)
          </Text>

          {/* Google Meet Link */}
          <TextInput
            mode="outlined"
            label="Google Meet Link (Optional)"
            placeholder="https://meet.google.com/xxx-xxxx-xxx"
            value={meetingLink}
            onChangeText={setMeetingLink}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Meeting Reminder */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 16, color: colors.text }}>10-Minute Meeting Reminder</Text>
            <Switch
              value={meetingReminder}
              onValueChange={setMeetingReminder}
              color={colors.primary}
            />
          </View>

          {/* File Attachment */}
          <View style={styles.field}>
            <Text style={styles.label}>Attachment</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Button
                mode="outlined"
                onPress={handleFilePick}
                icon="paperclip"
              >
                {attachedFile ? 'Change File' : 'Attach File'}
              </Button>
              {attachedFile && (
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text }}>
                    {attachedFile.name}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                    {(attachedFile.size / 1024).toFixed(1)} KB
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              mode="outlined"
              onPress={() => navigation.goBack()}
              style={styles.cancelButton}
              textColor={colors.textSecondary}
              disabled={isSubmitting || isOffline}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={isSubmitting || isOffline}
              loading={isSubmitting}
              style={styles.submitButton}
              buttonColor={colors.primary}
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </Button>
          </View>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: materialSpacing.md,
    gap: materialSpacing.md,
    backgroundColor: colors.background,
  },
  field: {
    marginBottom: materialSpacing.md,
  },
  label: {
    ...materialTypography.labelLarge,
    color: colors.text,
    marginBottom: materialSpacing.xs,
  },
  required: {
    color: colors.error,
  },
  input: {
    backgroundColor: colors.surface,
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: colors.text,
  },

  helpText: {
    ...materialTypography.bodySmall,
    color: colors.textSecondary,
    marginTop: materialSpacing.xs,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeText: {
    flex: 1,
  },
  noticeError: {
    color: colors.error,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: materialSpacing.md,
    marginTop: materialSpacing.md,
  },
  cancelButton: {
    flex: 1,
    borderColor: colors.border,
  },
  submitButton: {
    flex: 1,
    marginTop: 0,
  },
  checkboxRow: {
    marginBottom: materialSpacing.xs,
  },
  checkboxButton: {
    justifyContent: 'flex-start',
  },
  checkboxLabel: {
    fontSize: 14,
  },
  selectedText: {
    ...materialTypography.bodySmall,
    color: colors.primary,
    marginTop: materialSpacing.sm,
    fontWeight: '600',
  },
})

