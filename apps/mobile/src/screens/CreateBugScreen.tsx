/**
 * Create Bug Screen
 * Create new bugs with all required fields
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { TextInput, Button, Surface, Text, ActivityIndicator, SegmentedButtons, Chip } from 'react-native-paper'
import { SearchablePicker } from '../components/SearchablePicker'
import { MultiSelectPicker } from '../components/MultiSelectPicker'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as DocumentPicker from 'expo-document-picker'
import { createBug, getCompletedBugsForRelease, Bug } from '../services/bugService'
import { getBugTypeDisplayName } from '../utils/bugHelpers'
import { get as apiGet } from '../services/apiClient'
import { getProjectHierarchy, getProjectById } from '../services/projectService'
import { getAllSettings, GroupedSettings } from '../services/settingsService'
import { getAllUsers, getCurrentUser, User } from '../services/userService'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialTypography, materialSpacing } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import {
  ReleaseState,
  ReleasePlatformChecklist,
  ReleaseChecklistSection,
} from '../types'

type ReleasePlatform = 'android' | 'ios'

/** Format a Date as YYYY-MM-DD to match the web's <input type="date"> value. */
const toDateString = (d: Date): string => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

interface CreateBugRouteParams {
  convertFrom?: string
  type?: string
  title?: string
  description?: string
  expectedBehavior?: string
  actualBehavior?: string
  serverLogs?: string
  frontendLogs?: string
  projectId?: string
  subprojectId?: string
  category?: string
  severity?: string
  platform?: string
  environment?: string
}

export default function CreateBugScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const routeParams = (route.params || {}) as CreateBugRouteParams
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])
  const { isOffline } = useNetworkStatus()

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [subprojectId, setSubprojectId] = useState('')
  const [bugType, setBugType] = useState('bug') // Default
  const [severity, setSeverity] = useState('')
  const [category, setCategory] = useState('')
  const [platform, setPlatform] = useState('')
  const [environment, setEnvironment] = useState('')
  const [browser, setBrowser] = useState('')
  const [device, setDevice] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [priority, setPriority] = useState('Low') // Default matches web
  const [feature, setFeature] = useState('') // Related feature name (synced with web)
  const [tags, setTags] = useState('') // Comma-separated tags (synced with web)
  const [relatedBugs, setRelatedBugs] = useState('') // Related bug/task IDs (synced with web)

  // Detailed Fields
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [actualBehavior, setActualBehavior] = useState('')
  const [behaviour, setBehaviour] = useState('') // For feature type
  const [serverLogs, setServerLogs] = useState('')
  const [frontendLogs, setFrontendLogs] = useState('')

  const [attachedFile, setAttachedFile] = useState<any>(null)

  // Release work-item state
  const [selectedSub, setSelectedSub] = useState<any | null>(null)
  const [releasePlatforms, setReleasePlatforms] = useState<ReleasePlatform[]>([])
  const [releaseBugs, setReleaseBugs] = useState<Bug[]>([])
  const [selectedReleaseBugIds, setSelectedReleaseBugIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [showStartDatePicker, setShowStartDatePicker] = useState(false)
  const [isLoadingReleaseBugs, setIsLoadingReleaseBugs] = useState(false)

  // Data state
  const [projects, setProjects] = useState<any[]>([])
  const [settings, setSettings] = useState<GroupedSettings>({})
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  /**
   * Members of the chosen project/sub-project. The Assign To picker listed every
   * user in the company, so a bug could be assigned to someone with no access to
   * the project — they then could not see or update it. CreateTaskScreen already
   * scopes its pickers this way.
   */
  const [projectUsers, setProjectUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [user, projectsRes, settingsRes, usersRes] = await Promise.all([
        getCurrentUser(),
        getProjectHierarchy(),
        getAllSettings(true, true),
        getAllUsers(),
      ])

      setCurrentUser(user)

      // Get projects from hierarchy
      const hierarchyArr: any[] = Array.isArray(projectsRes)
        ? (projectsRes as any)
        : (projectsRes && (projectsRes as any).success && Array.isArray((projectsRes as any).data))
          ? (projectsRes as any).data
          : []
      
      if (hierarchyArr.length > 0) {
        setProjects(hierarchyArr)
      }

      if (settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data as GroupedSettings)
      }

      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      Alert.alert('Error', 'Failed to load form data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Pre-fill form when navigating with conversion params (Test Case → Bug)
  useEffect(() => {
    if (!routeParams.convertFrom) return
    if (routeParams.type) setBugType(routeParams.type)
    if (routeParams.title) setTitle(routeParams.title)
    if (routeParams.description) setStepsToReproduce(routeParams.description)
    if (routeParams.expectedBehavior) setExpectedBehavior(routeParams.expectedBehavior)
    if (routeParams.actualBehavior) setActualBehavior(routeParams.actualBehavior)
    if (routeParams.serverLogs) setServerLogs(routeParams.serverLogs)
    if (routeParams.frontendLogs) setFrontendLogs(routeParams.frontendLogs)
    if (routeParams.projectId) setProjectId(routeParams.projectId)
    if (routeParams.subprojectId) setSubprojectId(routeParams.subprojectId)
    if (routeParams.category) setCategory(routeParams.category)
    if (routeParams.severity) setSeverity(routeParams.severity)
    if (routeParams.platform) setPlatform(routeParams.platform)
    if (routeParams.environment) setEnvironment(routeParams.environment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.convertFrom])

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

  const selectedProject = useMemo(() => projects.find((p) => p.projectId === projectId), [projects, projectId])
  
  const subprojects = useMemo(() => {
    const dynamicSubs =
      (selectedProject as any)?.children || (selectedProject as any)?.subprojects || []
    return dynamicSubs
  }, [selectedProject])

  // ----- Release work-item derivations (declared before handleSubmit, which reads them) -----
  const subName = useMemo(() => {
    if (selectedSub?.projectName) return selectedSub.projectName
    const found: any = subprojects.find(
      (s: any) => (s.subprojectId || s.projectId) === subprojectId
    )
    return found?.subprojectName || found?.projectName || ''
  }, [selectedSub, subprojects, subprojectId])

  const releaseSections: ReleaseChecklistSection[] = useMemo(
    () => selectedSub?.releaseChecklist?.sections ?? [],
    [selectedSub]
  )
  const isReleaseEnabled = selectedSub?.releaseEnabled === true && releaseSections.length > 0
  const hasCommon = releaseSections.some((s) => s.platform === 'common')
  const androidAvailable = releaseSections.some((s) => s.platform === 'android') || hasCommon
  const iosAvailable = releaseSections.some((s) => s.platform === 'ios') || hasCommon
  const isReleaseMode = bugType === 'release' && isReleaseEnabled

  const handleSubmit = useCallback(async () => {
    // Validation — release work-items have a different required-field set.
    if (isReleaseMode) {
      if (!projectId) {
        Alert.alert('Validation Error', 'Project is required')
        return
      }
      if (!subprojectId) {
        Alert.alert('Validation Error', 'Subproject is required')
        return
      }
      if (!description.trim()) {
        Alert.alert('Validation Error', 'Release notes are required')
        return
      }
      if (!assignedTo && !currentUser?.employeeId) {
        Alert.alert('Validation Error', 'Assignee is required')
        return
      }
      if (!startDate) {
        Alert.alert('Validation Error', 'Start date is required')
        return
      }
      if (releasePlatforms.length === 0) {
        Alert.alert('Validation Error', 'Select at least one platform')
        return
      }
    } else {
      if (!title.trim()) {
        Alert.alert('Validation Error', 'Feature is required')
        return
      }
      if (!description.trim()) {
        Alert.alert('Validation Error', 'Description is required')
        return
      }
      if (!projectId) {
        Alert.alert('Validation Error', 'Project is required')
        return
      }
      // Subproject is only required when the selected project has subprojects.
      if (subprojects.length > 0 && !subprojectId) {
        Alert.alert('Validation Error', 'Subproject is required')
        return
      }
      if (!severity) {
        Alert.alert('Validation Error', 'Criticality is required')
        return
      }
      if (!category) {
        Alert.alert('Validation Error', 'Category is required')
        return
      }
      if (!platform) {
        Alert.alert('Validation Error', 'Platform is required')
        return
      }
    }

    try {
      setIsSubmitting(true)      // Construct detailed description
      let fullDescription = description.trim()
 
      if (bugType === 'feature') {
        if (stepsToReproduce.trim()) {
          fullDescription += `\n\n## Feature Description\n${stepsToReproduce.trim()}`
        }
      } else {
        if (stepsToReproduce.trim()) {
          fullDescription += `\n\n## Steps to Reproduce\n${stepsToReproduce.trim()}`
        }
      }

      let payload: any

      if (isReleaseMode) {
        // Snapshot the template per selected platform (common + platform-specific).
        const startDateStr = startDate ? toDateString(startDate) : ''
        const checklists: ReleaseState['checklists'] = {}
        for (const p of releasePlatforms) {
          const template = releaseSections.filter(
            (s) => s.platform === 'common' || s.platform === p
          )
          const platformChecklist: ReleasePlatformChecklist = {
            template,
            manual: [],
            completed: {},
          }
          checklists[p] = platformChecklist
        }
        const releaseState: ReleaseState = {
          platforms: releasePlatforms,
          checklists,
          versions: {},
        }

        const releasePlatformLabel =
          releasePlatforms.length === 2
            ? 'All'
            : releasePlatforms[0] === 'android'
            ? 'Android'
            : 'iOS'

        payload = {
          title: title.trim() || `Release — ${subName} — ${startDateStr}`,
          description: description.trim(),
          projectId,
          subprojectId,
          type: 'release',
          // Locked fields for releases (mirrors web).
          severity: 'Critical',
          priority,
          environment: 'Production',
          platform: releasePlatformLabel,
          feature: feature.trim() || subName,
          startDate: startDateStr,
          relatedBugs: selectedReleaseBugIds.join(', ') || undefined,
          assignedTo: assignedTo || currentUser?.employeeId,
          reportedBy: currentUser?.employeeId || '',
          status: 'New',
          releaseState,
        }
      } else if (attachedFile) {
        const formData = new FormData()
        formData.append('title', title.trim())
        formData.append('description', fullDescription)
        formData.append('projectId', projectId)
        if (subprojectId) formData.append('subprojectId', subprojectId)
        formData.append('type', bugType)
        formData.append('severity', severity)
        formData.append('category', category)
        formData.append('platform', platform)
        if (environment) formData.append('environment', environment)
        if (browser) formData.append('browser', browser)
        if (device) formData.append('device', device)
        formData.append('assignedTo', assignedTo || currentUser?.employeeId || '')
        formData.append('reportedBy', currentUser?.employeeId || '')
        formData.append('status', 'New')
        formData.append('priority', priority)
        if (feature.trim()) formData.append('feature', feature.trim())
        if (tags.trim()) formData.append('tags', tags.trim())
        if (relatedBugs.trim()) formData.append('relatedBugs', relatedBugs.trim())

        // Send separate fields
        const expectedVal = bugType === 'feature' ? behaviour.trim() : expectedBehavior.trim()
        if (expectedVal) formData.append('expectedBehavior', expectedVal)

        if (bugType !== 'feature') {
          if (actualBehavior.trim()) formData.append('actualBehavior', actualBehavior.trim())
          if (serverLogs.trim()) formData.append('serverLogs', serverLogs.trim())
          if (frontendLogs.trim()) formData.append('frontendLogs', frontendLogs.trim())
        }

        formData.append('attachments', {
          uri: attachedFile.uri,
          name: attachedFile.name,
          type: attachedFile.mimeType || 'application/octet-stream',
        } as any)

        payload = formData
      } else {
        payload = {
          title: title.trim(),
          description: fullDescription,
          projectId,
          subprojectId,
          type: bugType,
          severity,
          priority,
          category,
          platform,
          environment: environment || undefined,
          browserInfo: browser || undefined,
          deviceInfo: device || undefined,
          feature: feature.trim() || undefined,
          tags: tags.trim() || undefined,
          relatedBugs: relatedBugs.trim() || undefined,
          assignedTo: assignedTo || currentUser?.employeeId,
          reportedBy: currentUser?.employeeId || '',
          status: 'New',
          expectedBehavior: bugType === 'feature' ? (behaviour.trim() || undefined) : (expectedBehavior.trim() || undefined),
          actualBehavior: bugType === 'feature' ? undefined : (actualBehavior.trim() || undefined),
          serverLogs: bugType === 'feature' ? undefined : (serverLogs.trim() || undefined),
          frontendLogs: bugType === 'feature' ? undefined : (frontendLogs.trim() || undefined),
        }
      }

      const response = await createBug(payload)

      if (response.success) {
        const newBugId = (response.data as any)?.bugId
        Alert.alert('Success', `${getBugTypeDisplayName(bugType)} created successfully`, [
          {
            text: 'OK',
            onPress: () => {
              if (isReleaseMode && newBugId) {
                ;(navigation as any).replace
                  ? (navigation as any).replace('BugDetails', { bugId: newBugId })
                  : (navigation as any).navigate('BugDetails', { bugId: newBugId })
              } else {
                navigation.goBack()
              }
            },
          },
        ])
      } else {
        Alert.alert('Error', response.error || 'Failed to create bug')
      }
    } catch (error) {
      console.error('Failed to create bug:', error)
      Alert.alert('Error', 'Failed to create bug')
    } finally {
      setIsSubmitting(false)
    }
  }, [title, description, projectId, subprojectId, subprojects, bugType, severity, priority, category, platform, environment, browser, device, feature, tags, relatedBugs, assignedTo, currentUser, navigation, attachedFile, stepsToReproduce, expectedBehavior, actualBehavior, serverLogs, frontendLogs, behaviour, isReleaseMode, releasePlatforms, releaseSections, selectedReleaseBugIds, startDate, subName])

  // Helper to safely format picker items and avoid undefined properties causing native Picker crashes
  const getPickerItems = (items: any) => {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => {
      if (typeof item === 'string') {
        return { id: `item-${index}`, label: item, value: item };
      }
      if (item && typeof item === 'object') {
        const val = item.value !== undefined ? item.value : (item.projectId || item.subprojectId || item.employeeId || item.settingValue || item.name || '');
        const label = item.label || item.projectName || item.subprojectName || item.name || val || '';
        const id = item.id !== undefined ? String(item.id) : (item.projectId || item.subprojectId || item.employeeId || `item-${index}`);
        return { id, label, value: val };
      }
      return { id: `item-${index}`, label: String(item), value: String(item) };
    });
  };

  // Fetch the full sub-project record (incl. release config) when it changes.
  useEffect(() => {
    if (!subprojectId) {
      setSelectedSub(null)
      return
    }
    let cancelled = false
    getProjectById(subprojectId)
      .then((res) => {
        if (!cancelled && res.success) setSelectedSub(res.data)
      })
      .catch(() => {
        if (!cancelled) setSelectedSub(null)
      })
    return () => {
      cancelled = true
    }
  }, [subprojectId])

  // Members of the sub-project if one is chosen, otherwise of the main project.
  useEffect(() => {
    const scopeId = subprojectId || projectId
    if (!scopeId) {
      setProjectUsers([])
      return
    }
    let cancelled = false
    apiGet(`/api/projects/${scopeId}/users`)
      .then((res: any) => {
        if (cancelled) return
        const rows = res?.success && Array.isArray(res.data) ? res.data : []
        setProjectUsers(
          rows.map((pu: any) => ({
            employeeId: pu.employeeId,
            name: pu.userName || pu.name || pu.employeeId,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setProjectUsers([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId, subprojectId])

  // Clear an assignee who is not a member of the newly chosen project — including
  // the signed-in user, who is the default on the task screen.
  useEffect(() => {
    if (!assignedTo || projectUsers.length === 0) return
    if (!projectUsers.some((u) => u.employeeId === assignedTo)) {
      setAssignedTo('')
    }
  }, [projectUsers, assignedTo])

  // If the chosen type is 'release' but the sub is no longer release-enabled, reset.
  useEffect(() => {
    if (bugType === 'release' && !isReleaseEnabled) {
      setBugType('bug')
    }
  }, [bugType, isReleaseEnabled])

  // Default platform selection when entering release mode / changing sub.
  useEffect(() => {
    if (!isReleaseMode) return
    const hasAndroidSpecific = releaseSections.some((s) => s.platform === 'android')
    const hasIosSpecific = releaseSections.some((s) => s.platform === 'ios')
    let defaults: ReleasePlatform[] = []
    if (hasAndroidSpecific) defaults.push('android')
    if (hasIosSpecific) defaults.push('ios')
    if (defaults.length === 0 && hasCommon) defaults = ['android', 'ios']
    setReleasePlatforms(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReleaseMode, subprojectId])

  // Fetch completed bugs since last release and pre-select them all.
  useEffect(() => {
    if (!isReleaseMode || !subprojectId) {
      setReleaseBugs([])
      setSelectedReleaseBugIds([])
      return
    }
    let cancelled = false
    setIsLoadingReleaseBugs(true)
    getCompletedBugsForRelease(subprojectId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setReleaseBugs(res.data)
          setSelectedReleaseBugIds(res.data.map((b) => b.bugId))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingReleaseBugs(false)
      })
    return () => {
      cancelled = true
    }
  }, [isReleaseMode, subprojectId])

  // Keep the relatedBugs string in sync with the selected completed bugs.
  useEffect(() => {
    if (isReleaseMode) {
      setRelatedBugs(selectedReleaseBugIds.join(', '))
    }
  }, [isReleaseMode, selectedReleaseBugIds])

  const togglePlatform = (p: ReleasePlatform) => {
    setReleasePlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading form...</Text>
      </View>
    )
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
          {/* Conversion banner */}
          {routeParams.convertFrom && (
            <View style={styles.convertBanner}>
              <Text style={styles.convertBannerText}>
                Converting test case {routeParams.convertFrom} to a bug. Fields
                have been pre-filled — review and submit.
              </Text>
            </View>
          )}

          {/* Project */}
          <SearchablePicker
            label="Project"
            placeholder="Select Project"
            selectedValue={projectId}
            onValueChange={(value) => {
              setProjectId(value)
              setSubprojectId('') // Reset subproject
            }}
            items={getPickerItems(projects)}
            required
          />

          {/* Subproject */}
          <SearchablePicker
            label="Subproject"
            placeholder="Select Subproject"
            selectedValue={subprojectId}
            onValueChange={setSubprojectId}
            items={getPickerItems(subprojects)}
            disabled={!projectId}
            required
          />

          {/* Bug Type */}
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8, fontWeight: '500' }}>Type</Text>
          <SegmentedButtons
            value={bugType}
            onValueChange={setBugType}
            buttons={[
              { value: 'bug', label: 'Bug' },
              { value: 'feature', label: 'Feature' },
              { value: 'other', label: 'Other' },
              // 'release' is only offered for release-enabled sub-projects.
              ...(isReleaseEnabled ? [{ value: 'release', label: 'Release' }] : []),
            ]}
            style={{ marginBottom: 16 }}
          />

          {/* Release configuration (release mode only) */}
          {isReleaseMode && (
            <View style={styles.releaseBox}>
              <Text style={styles.label}>Platforms <Text style={styles.required}>*</Text></Text>
              <View style={styles.platformRow}>
                {androidAvailable && (
                  <Chip
                    selected={releasePlatforms.includes('android')}
                    onPress={() => togglePlatform('android')}
                    icon="android"
                    style={styles.platformChip}
                    disabled={isOffline}
                  >
                    Android
                  </Chip>
                )}
                {iosAvailable && (
                  <Chip
                    selected={releasePlatforms.includes('ios')}
                    onPress={() => togglePlatform('ios')}
                    icon="apple"
                    style={styles.platformChip}
                    disabled={isOffline}
                  >
                    iOS
                  </Chip>
                )}
              </View>

              <Text style={[styles.label, { marginTop: materialSpacing.sm }]}>
                Start Date <Text style={styles.required}>*</Text>
              </Text>
              <Button
                mode="outlined"
                icon="calendar"
                onPress={() => setShowStartDatePicker(true)}
                disabled={isOffline}
                style={{ alignSelf: 'flex-start' }}
              >
                {startDate ? toDateString(startDate) : 'Select start date'}
              </Button>
              {showStartDatePicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selected) => {
                    setShowStartDatePicker(Platform.OS === 'ios')
                    if (event.type === 'dismissed') {
                      setShowStartDatePicker(false)
                      return
                    }
                    if (selected) setStartDate(selected)
                  }}
                />
              )}

              <View style={{ marginTop: materialSpacing.md }}>
                <MultiSelectPicker
                  label="Bugs solved in this release"
                  placeholder={isLoadingReleaseBugs ? 'Loading bugs…' : 'Select solved bugs'}
                  selectedValues={selectedReleaseBugIds}
                  onValuesChange={setSelectedReleaseBugIds}
                  items={releaseBugs.map((b) => ({
                    label: `${b.bugId} — ${b.title}`,
                    value: b.bugId,
                  }))}
                  disabled={isOffline}
                />
              </View>
            </View>
          )}

          {/* Feature (Title) */}
          <TextInput
            mode="outlined"
            label={isReleaseMode ? 'Release Title (optional — auto-generated)' : 'Feature *'}
            value={title}
            onChangeText={setTitle}
            placeholder={isReleaseMode ? 'Leave blank to auto-generate' : 'Enter feature name'}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Description & Reproduction Steps */}
          <TextInput
            mode="outlined"
            label={isReleaseMode ? 'Release Notes *' : 'Summary *'}
            value={description}
            onChangeText={setDescription}
            placeholder={isReleaseMode ? 'Notes for this release' : 'Brief summary of the bug'}
            multiline
            numberOfLines={2}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Reproduction & behavior — not applicable to releases */}
          {!isReleaseMode && (
          <>
          <Text style={styles.sectionHeader}>Reproduction & Behavior</Text>

          {/* Conditional rendering based on bug type */}
          {bugType === 'feature' ? (
            <>
              <TextInput
                mode="outlined"
                label="Feature Description *"
                value={stepsToReproduce}
                onChangeText={setStepsToReproduce}
                placeholder="Describe the feature in detail..."
                multiline
                numberOfLines={4}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />

              <TextInput
                mode="outlined"
                label="Behaviour"
                value={behaviour}
                onChangeText={setBehaviour}
                placeholder="Describe the expected behaviour of this feature..."
                multiline
                numberOfLines={3}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />
            </>
          ) : (
            <>
              <TextInput
                mode="outlined"
                label="Steps to Reproduce"
                value={stepsToReproduce}
                onChangeText={setStepsToReproduce}
                placeholder="1. Go to page... 2. Click button..."
                multiline
                numberOfLines={3}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />

              <TextInput
                mode="outlined"
                label="Expected Behavior"
                value={expectedBehavior}
                onChangeText={setExpectedBehavior}
                placeholder="What should happen?"
                multiline
                numberOfLines={2}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />

              <TextInput
                mode="outlined"
                label="Actual Behavior"
                value={actualBehavior}
                onChangeText={setActualBehavior}
                placeholder="What actually happened?"
                multiline
                numberOfLines={2}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />

              <TextInput
                mode="outlined"
                label="Server Logs"
                value={serverLogs}
                onChangeText={setServerLogs}
                placeholder="Paste server logs here..."
                multiline
                numberOfLines={2}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />

              <TextInput
                mode="outlined"
                label="Frontend Logs"
                value={frontendLogs}
                onChangeText={setFrontendLogs}
                placeholder="Paste console/network logs here..."
                multiline
                numberOfLines={2}
                style={styles.input}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.text}
                disabled={isOffline}
              />
            </>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Attachment</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Button
                mode="outlined"
                onPress={handleFilePick}
                icon="paperclip"
                disabled={isOffline}
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
          </>
          )}

          {/* Assigned To */}
          <SearchablePicker
            label={isReleaseMode ? 'Assign To *' : 'Assign To'}
            placeholder="Select User"
            selectedValue={assignedTo}
            onValueChange={setAssignedTo}
            items={(projectUsers.length > 0 ? projectUsers : users).map((user: any) => ({
              label: user.name || user.employeeId || '',
              value: user.employeeId || '',
            }))}
            disabled={isOffline || !projectId}
          />

          {/* Bug-only metadata — environment/severity are locked for releases */}
          {!isReleaseMode && (
          <>
          {/* Criticality (from API settings, synced with web) */}
          <SearchablePicker
            label="Criticality"
            placeholder="Select Criticality"
            selectedValue={severity}
            onValueChange={setSeverity}
            items={getPickerItems(settings['severity'] || settings['Bug Severity'] || ['Critical', 'Major', 'Minor'])}
            required
          />

          {/* Category (from API settings, synced with web) */}
          <SearchablePicker
            label="Category"
            placeholder="Select Category"
            selectedValue={category}
            onValueChange={setCategory}
            items={getPickerItems(settings['category'] || settings['Bug Category'] || ['UI', 'API', 'Backend', 'Performance', 'Security', 'Database', 'Integration', 'Other'])}
            required
          />

          {/* Platform */}
          <SearchablePicker
            label="Platform"
            placeholder="Select Platform"
            selectedValue={platform}
            onValueChange={setPlatform}
            items={getPickerItems(settings['Bug Platform'] || settings['platform'] || [{ id: 'p1', value: 'Web' }, { id: 'p2', value: 'Mobile' }, { id: 'p3', value: 'Desktop' }, { id: 'p4', value: 'API' }])}
            required
          />

          {/* Environment */}
          <SearchablePicker
            label="Environment"
            placeholder="Select Environment"
            selectedValue={environment}
            onValueChange={setEnvironment}
            items={getPickerItems(settings['Bug Environment'] || settings['environment'] || [{ id: 'e1', value: 'Development' }, { id: 'e2', value: 'QA' }, { id: 'e3', value: 'Staging' }, { id: 'e4', value: 'Production' }])}
          />

          {/* Browser Info (synced with web) */}
          <TextInput
            mode="outlined"
            label="Browser (Optional)"
            value={browser}
            onChangeText={setBrowser}
            placeholder="e.g., Chrome 120, Safari 17"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Device Info (synced with web) */}
          <TextInput
            mode="outlined"
            label="Device (Optional)"
            value={device}
            onChangeText={setDevice}
            placeholder="e.g., iPhone 12, Windows 10"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Related Items (synced with web) */}
          <TextInput
            mode="outlined"
            label="Related Items (Optional)"
            value={relatedBugs}
            onChangeText={setRelatedBugs}
            placeholder="e.g., JSR-0001, BUG-0001 (comma-separated)"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />

          {/* Tags (synced with web) */}
          <TextInput
            mode="outlined"
            label="Tags (Optional)"
            value={tags}
            onChangeText={setTags}
            placeholder="urgent, login, payment, mobile"
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.text}
            disabled={isOffline}
          />
          </>
          )}

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={isSubmitting || isOffline}
            loading={isSubmitting}
            style={styles.submitButton}
            buttonColor={colors.primary}
          >
            {isSubmitting ? 'Creating...' : `Create ${getBugTypeDisplayName(bugType)}`}
          </Button>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    ...materialTypography.bodyLarge,
    marginTop: materialSpacing.md,
    color: colors.textSecondary,
  },
  form: {
    padding: materialSpacing.md,
    gap: materialSpacing.md,
  },
  convertBanner: {
    backgroundColor: colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding: materialSpacing.sm,
    borderRadius: 6,
    marginBottom: materialSpacing.md,
  },
  convertBannerText: {
    ...materialTypography.bodySmall,
    color: colors.text,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: colors.text,
  },
  submitButton: {
    marginTop: materialSpacing.md,
    marginBottom: materialSpacing.xl,
  },
  sectionHeader: {
    ...materialTypography.titleMedium,
    color: colors.primary,
    marginTop: materialSpacing.sm,
    marginBottom: materialSpacing.xs,
  },
  releaseBox: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: materialSpacing.md,
    marginBottom: materialSpacing.md,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: materialSpacing.sm,
  },
  platformChip: {
    marginRight: materialSpacing.xs,
  },
})

