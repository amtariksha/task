/**
 * Settings Screen (My Profile)
 * 
 * Displays user profile, statistics, and ID card generation/upload.
 * Mirrors the Web App's "My Profile" functionality.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Vibration
} from 'react-native'
import { Text, Button, ActivityIndicator, Divider, Surface, Switch, IconButton, TextInput as PaperInput, Portal, Dialog, SegmentedButtons } from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SearchablePicker } from '../components/SearchablePicker'
import CompanySwitcher from '../components/CompanySwitcher'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useNavigation } from '@react-navigation/native'
import Constants from 'expo-constants'

import { AuthContext } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import { getUserData, saveUserData as setUserData, getSecure, saveSecure, SECURE_KEYS, getCurrentUserPin, saveUserPin } from '../utils/secureStorage'
import apiClient from '../services/apiClient'
import { getAllSettings, GroupedSettings } from '../services/settingsService'
import {
  isBiometricSupported,
  isBiometricEnrolled,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  getBiometricTypeName,
  authenticateWithBiometrics,
} from '../utils/biometricAuth'

interface UserStats {
  totalTasks: number
  completedTasks: number
  totalLeaves: number
  totalWFH: number
}

interface EditFormData {
  name: string
  email: string
  phone: string
  department: string
  managerEmail: string
  telegramToken: string
}

export default function SettingsScreen() {
  const navigation = useNavigation()
  const { signOut } = React.useContext(AuthContext)
  const { colors, isDark, toggleTheme } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState<any>(null)

  // Stats State
  const [stats, setStats] = useState<UserStats>({
    totalTasks: 0,
    completedTasks: 0,
    totalLeaves: 0,
    totalWFH: 0
  })

  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<EditFormData>({
    name: '',
    email: '',
    phone: '',
    department: '',
    managerEmail: '',
    telegramToken: ''
  })

  // Settings/Departments
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [loadingSettings, setLoadingSettings] = useState(false)

  // Biometric State
  const [biometricSupported, setBiometricSupported] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricType, setBiometricType] = useState('Biometric')

  // ID Card Modal
  const [isIdCardVisible, setIdCardVisible] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Swipe Preferences States
  const [swipeLeftAction, setSwipeLeftAction] = useState('In Progress')
  const [swipeRightAction, setSwipeRightAction] = useState('Complete')

  const handleSaveSwipePreferences = async (side: 'left' | 'right', action: string) => {
    const userId = user?.employeeId
    if (!userId) return
    const key = side === 'left' ? `jsr_swipe_left_${userId}` : `jsr_swipe_right_${userId}`
    try {
      if (side === 'left') {
        setSwipeLeftAction(action)
      } else {
        setSwipeRightAction(action)
      }
      await AsyncStorage.setItem(key, action)
    } catch (err) {
      console.warn('Failed to save swipe preferences', err)
    }
  }

  // Change PIN Flow States
  const [changePinVisible, setChangePinVisible] = useState(false)
  const [changePinStep, setChangePinStep] = useState<'verify' | 'new' | 'confirm'>('verify')
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [confirmPinInput, setConfirmPinInput] = useState('')
  const [changePinError, setChangePinError] = useState('')

  const loadProfileData = useCallback(async () => {
    try {
      // 1. Get User Data
      const userData = await getUserData()
      if (!userData) {
        setLoading(false)
        return
      }
      setUser(userData)

      // Initialize Edit Form Data
      setFormData({
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        department: userData.department || '',
        managerEmail: userData.managerEmail || '',
        telegramToken: userData.telegramToken || ''
      })

      // Load user-specific swipe preferences
      try {
        const leftKey = `jsr_swipe_left_${userData.employeeId}`
        const rightKey = `jsr_swipe_right_${userData.employeeId}`
        const left = await AsyncStorage.getItem(leftKey)
        const right = await AsyncStorage.getItem(rightKey)
        setSwipeLeftAction(left || 'In Progress')
        setSwipeRightAction(right || 'Complete')
      } catch (err) {
        console.warn('Failed to load swipe preferences', err)
      }

      // 2. Fetch Stats (Mirroring Web App Logic)
      try {
        const [tasksRes, leavesRes, wfhRes] = await Promise.all([
          apiClient.get(`/api/tasks/user/${userData.employeeId}`),
          apiClient.get(`/api/leaves/user/${userData.employeeId}`),
          apiClient.get(`/api/wfh/user/${userData.employeeId}`)
        ])

        const tasks = tasksRes.success && tasksRes.data ? tasksRes.data : []
        const leaves = leavesRes.success && leavesRes.data ? leavesRes.data : []
        const wfh = wfhRes.success && wfhRes.data ? wfhRes.data : []

        setStats({
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t: any) => t.status === 'Done').length,
          totalLeaves: leaves.length,
          totalWFH: wfh.length
        })
      } catch (err) {
        console.warn('Failed to load user stats', err)
      }

      // 3. Load Departments for Edit Dropdown
      try {
        setLoadingSettings(true)
        const settingsRes = await getAllSettings(true, true)
        if (settingsRes.success && settingsRes.data) {
          const grouped = settingsRes.data as GroupedSettings
          const fetchedDepts = grouped['department'] || grouped['Department'] || []
          // Extract values if it's an object array, or use directly if string array
          // Based on services/settingsService, it returns Setting[] keyed by type
          const deptNames = Array.isArray(fetchedDepts)
            ? fetchedDepts.map((d: any) => (typeof d === 'string' ? d : d?.value)).filter(Boolean)
            : []
          setDepartmentOptions(deptNames)
        }
      } catch (err) {
        console.warn('Failed to load settings', err)
      } finally {
        setLoadingSettings(false)
      }

      // 4. Check Biometrics
      const supported = await isBiometricSupported()
      const enrolled = await isBiometricEnrolled()
      const enabled = await isBiometricEnabled()
      const type = await getBiometricTypeName()

      setBiometricSupported(supported)
      setBiometricEnrolled(enrolled)
      setBiometricEnabled(enabled)
      setBiometricType(type)

    } catch (error) {
      console.error('Failed to load profile data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadProfileData()
  }, [loadProfileData])

  const onRefresh = () => {
    setRefreshing(true)
    loadProfileData()
  }

  const handleEditChange = (field: keyof EditFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveProfile = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert('Validation Error', 'Full Name is required')
      return
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      Alert.alert('Validation Error', 'Valid Email Address is required')
      return
    }
    if (!formData.phone.trim()) {
      Alert.alert('Validation Error', 'Phone Number is required')
      return
    }
    if (!formData.department) {
      Alert.alert('Validation Error', 'Department is required')
      return
    }

    try {
      setIsSaving(true)

      const updatePayload = {
        ...user, // Keep existing fields
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        department: formData.department,
        managerEmail: formData.managerEmail || undefined,
        telegramToken: formData.telegramToken || undefined,
        // Ensure immutable fields are not changed or sent if API is strict, 
        // usually sending ID is fine for identification but let's be safe.
        // Web app uses updateUser(updatedUser) which sends everything. 
        // We'll mimic that structure.
      }

      // We'll assume a specific endpoint for updating user or use a generic one
      // Typically PUT /api/users/:id or PUT /api/user/profile
      // Using authentication token to identify user usually
      const res = await apiClient.put(`/api/users/${user.employeeId}`, updatePayload)

      if (res.success) {
        // Update local state
        setUser(updatePayload)
        await setUserData(updatePayload)
        setIsEditing(false)
        Alert.alert('Success', 'Profile updated successfully')
      } else {
        Alert.alert('Error', res.error || 'Failed to update profile')
      }
    } catch (error) {
      console.error('Profile update failed:', error)
      Alert.alert('Error', 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    // Reset form to current user data
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      department: user.department || '',
      managerEmail: user.managerEmail || '',
      telegramToken: user.telegramToken || ''
    })
    setIsEditing(false)
  }

  const handlePhotoUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        copyToCacheDirectory: true,
      })

      if (result.canceled || !result.assets || result.assets.length === 0) return

      const file = result.assets[0]
      const MAX_SIZE = 5 * 1024 * 1024 // 5MB

      if (file.size && file.size > MAX_SIZE) {
        Alert.alert('Error', 'File size exceeds 5MB limit.')
        return
      }

      setUploading(true)

      // 1. Get Presigned URL
      const presignRes = await apiClient.post('/api/upload/id-card-photo', {
        filename: file.name,
        fileType: file.mimeType || 'image/jpeg',
        fileSize: file.size
      })

      if (!presignRes.success) {
        throw new Error(presignRes.error || 'Failed to get upload URL')
      }

      const { uploadUrl, fileUrl } = presignRes.data

      // 2. Upload to S3 (Direct fetch, no API client headers)
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: await (await fetch(file.uri)).blob(),
        headers: {
          'Content-Type': file.mimeType || 'image/jpeg',
        }
      })

      if (!uploadRes.ok) {
        throw new Error('Failed to upload image to storage')
      }

      // 3. Confirm Update
      const updateRes = await apiClient.put('/api/upload/id-card-photo', {
        fileUrl
      })

      if (!updateRes.success) {
        throw new Error(updateRes.error || 'Failed to update user profile')
      }

      // Update local user state
      const newUser = { ...user, idCardPhoto: fileUrl }
      setUser(newUser)
      await setUserData(newUser) // Persist locally

      Alert.alert('Success', 'ID Card photo updated successfully')

    } catch (error: any) {
      console.error('Upload Error:', error)
      Alert.alert('Upload Failed', error.message || 'Could not upload photo')
    } finally {
      setUploading(false)
    }
  }

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const authResult = await authenticateWithBiometrics(`Enable ${biometricType} for login`)
      if (!authResult.success) {
        Alert.alert('Failed', authResult.error || 'Authentication failed')
        return
      }
      await enableBiometric()
      setBiometricEnabled(true)
    } else {
      await disableBiometric()
      setBiometricEnabled(false)
    }
  }

  const handleOpenChangePin = () => {
    setChangePinStep('verify')
    setCurrentPinInput('')
    setNewPinInput('')
    setConfirmPinInput('')
    setChangePinError('')
    setChangePinVisible(true)
  }

  const handleProcessChangePin = async () => {
    setChangePinError('')
    if (changePinStep === 'verify') {
      const storedPin = await getCurrentUserPin()
      if (storedPin === currentPinInput) {
        setChangePinStep('new')
      } else {
        setChangePinError('Incorrect current PIN')
        Vibration.vibrate(100)
      }
    } else if (changePinStep === 'new') {
      if (newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
        setChangePinError('PIN must be 4 digits')
        return
      }
      setChangePinStep('confirm')
    } else if (changePinStep === 'confirm') {
      if (newPinInput === confirmPinInput) {
        const employeeId = (await getUserData<{ employeeId?: string }>())?.employeeId
        if (!employeeId) {
          setChangePinError('Could not identify the signed-in user')
          return
        }
        // Per-user key: a device-wide PIN locked the next person to sign in.
        await saveUserPin(employeeId, newPinInput)
        Alert.alert('Success', 'Security PIN changed successfully')
        setChangePinVisible(false)
      } else {
        setChangePinError('PINs do not match')
        setConfirmPinInput('')
        Vibration.vibrate(100)
      }
    }
  }

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: signOut }
    ])
  }

  const getInitials = (name: string) => {
    return name
      ? name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2)
      : 'U'
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.headerTitle}>My Profile</Text>
            <Text style={styles.headerSubtitle}>Manage your personal information and account settings.</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <Button
            mode="text"
            icon="bell-outline"
            onPress={() => navigation.navigate('NotificationSettings' as never)}
            labelStyle={styles.actionButtonLabel}
            contentStyle={{ justifyContent: 'flex-start' }}
          >
            Notification Settings
          </Button>
          {!isEditing && (
            <Button
              mode="contained"
              icon="pencil"
              onPress={() => setIsEditing(true)}
              buttonColor={colors.primary}
              labelStyle={{ color: '#fff' }}
            >
              Edit Profile
            </Button>
          )}
        </View>

        <Divider style={styles.divider} />

        {isEditing ? (
          // EDIT FORM
          <Surface style={styles.card} elevation={1}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.formContainer}
            >

              {/* Employee ID (Read Only) */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Employee ID</Text>
                <PaperInput
                  mode="outlined"
                  value={user?.employeeId}
                  disabled={true}
                  style={[styles.input, { backgroundColor: colors.surfaceVariant }]}
                  editable={false}
                />
                <Text style={styles.helperText}>Employee ID cannot be changed</Text>
              </View>

              {/* Full Name */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Full Name <Text style={{ color: materialColors.error }}>*</Text></Text>
                <PaperInput
                  mode="outlined"
                  value={formData.name}
                  onChangeText={(text) => handleEditChange('name', text)}
                  style={styles.input}
                />
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Email Address <Text style={{ color: materialColors.error }}>*</Text></Text>
                <PaperInput
                  mode="outlined"
                  value={formData.email}
                  onChangeText={(text) => handleEditChange('email', text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              {/* Phone */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Phone Number <Text style={{ color: materialColors.error }}>*</Text></Text>
                <PaperInput
                  mode="outlined"
                  value={formData.phone}
                  onChangeText={(text) => handleEditChange('phone', text)}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              {/* Department Dropdown */}
              <View style={styles.inputGroup}>
                <SearchablePicker
                  label="Department *"
                  placeholder="Select Department"
                  selectedValue={formData.department}
                  onValueChange={(val) => handleEditChange('department', val)}
                  items={(
                    departmentOptions.length > 0
                      ? departmentOptions
                      : (formData.department ? [formData.department] : [])
                  ).map((dept: string) => ({ label: dept, value: dept }))}
                  required
                />
              </View>

              {/* Manager Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Manager Email</Text>
                <PaperInput
                  mode="outlined"
                  value={formData.managerEmail}
                  onChangeText={(text) => handleEditChange('managerEmail', text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              {/* Telegram Token */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Telegram Token</Text>
                <PaperInput
                  mode="outlined"
                  value={formData.telegramToken}
                  onChangeText={(text) => handleEditChange('telegramToken', text)}
                  placeholder="Optional telegram token"
                  style={styles.input}
                />
              </View>

              {/* Buttons */}
              <View style={styles.formActions}>
                <Button mode="outlined" onPress={handleCancelEdit} style={{ marginRight: 10 }}>
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveProfile}
                  loading={isSaving}
                  disabled={isSaving}
                  buttonColor={colors.primary}
                >
                  Save
                </Button>
              </View>
            </KeyboardAvoidingView>
          </Surface>
        ) : (
          // VIEW MODE
          <>
            {/* User Information Card */}
            <Surface style={styles.card} elevation={1}>
              <View style={styles.userCardContent}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user?.name}</Text>
                  <Text style={styles.userEmail}>{user?.employeeId}</Text>
                  <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: '#E0E7FF' }]}>
                      <Text style={[styles.tagText, { color: '#3730A3' }]}>{user?.role || 'User'}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.tagText, { color: '#166534' }]}>{user?.status || 'Active'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Surface>

            {/* Company switcher — renders nothing unless the user belongs to
                more than one company (web migration 062). */}
            <Surface style={styles.card} elevation={1}>
              <CompanySwitcher onSwitched={loadProfileData} />
            </Surface>

            {/* Detailed Profile Info (Read Only) */}
            <View style={styles.sectionContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Employee ID</Text>
                <Text style={styles.detailValue}>{user?.employeeId} <Text style={{ fontSize: 10, color: materialColors.primary }}>(Immutable)</Text></Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Full Name</Text>
                <Text style={styles.detailValue}>{user?.name}</Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Email Address</Text>
                <Text style={styles.detailValue}>{user?.email}</Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone Number</Text>
                <Text style={styles.detailValue}>{user?.phone || 'Not Set'}</Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Department</Text>
                <Text style={styles.detailValue}>{user?.department || 'Not Set'}</Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Manager Email</Text>
                <Text style={styles.detailValue}>{user?.managerEmail || 'Not Set'}</Text>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Telegram Token</Text>
                <Text style={styles.detailValue}>{user?.telegramToken || 'Not Set'}</Text>
              </View>
            </View>

            {/* Statistics Dashboard */}
            <View style={styles.statsGrid}>
              <Surface style={styles.statBox} elevation={0}>
                <Text style={styles.statNumber}>{stats.totalTasks}</Text>
                <Text style={styles.statLabel}>Total Tasks</Text>
              </Surface>
              <Surface style={styles.statBox} elevation={0}>
                <Text style={styles.statNumber}>{stats.completedTasks}</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </Surface>
              <Surface style={styles.statBox} elevation={0}>
                <Text style={styles.statNumber}>{stats.totalLeaves}</Text>
                <Text style={styles.statLabel}>Total Leaves</Text>
              </Surface>
              <Surface style={styles.statBox} elevation={0}>
                <Text style={styles.statNumber}>{stats.totalWFH}</Text>
                <Text style={styles.statLabel}>Total WFH</Text>
              </Surface>
            </View>

            {/* ID Card Section */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Employee ID Card</Text>
              <Button
                mode="contained"
                onPress={() => setIdCardVisible(true)}
                style={styles.idCardButton}
                contentStyle={{ height: 50 }}
                icon="card-account-details-outline"
              >
                View ID Card
              </Button>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>ID Card Photo</Text>
              <Surface style={styles.uploadCard} elevation={0}>
                <Text style={styles.uploadHelpText}>Accepted formats: PNG, JPG, WEBP. Max 5MB.</Text>
                <Button
                  mode="outlined"
                  onPress={handlePhotoUpload}
                  loading={uploading}
                  disabled={uploading}
                  icon="camera"
                >
                  {uploading ? 'Uploading...' : 'Select Photo'}
                </Button>
              </Surface>
            </View>

            {/* Other Settings (Biometrics, etc.) */}
            <Divider style={styles.divider} />
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>App Settings</Text>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Dark Mode</Text>
                <Switch value={isDark} onValueChange={toggleTheme} color={colors.primary} />
              </View>

              <TouchableOpacity
                style={styles.settingRow}
                onPress={handleOpenChangePin}
                activeOpacity={0.6}
              >
                <Text style={styles.settingLabel}>Security PIN</Text>
                <Button mode="text" labelStyle={{ color: colors.primary }}>Change PIN</Button>
              </TouchableOpacity>

              {biometricSupported && biometricEnrolled && (
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>{biometricType} Login</Text>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    color={colors.primary}
                  />
                </View>
              )}

              <Divider style={{ marginVertical: 12 }} />
              <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 8 }]}>Swipe Actions Configuration</Text>
              
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 6 }}>Swipe Left Action (swiping from right to left)</Text>
                <SegmentedButtons
                  value={swipeLeftAction}
                  onValueChange={(val) => handleSaveSwipePreferences('left', val)}
                  buttons={[
                    { value: 'In Progress', label: 'In Progress' },
                    { value: 'Complete', label: 'Complete' },
                    { value: 'None', label: 'None' }
                  ]}
                  style={{ marginBottom: 12 }}
                />

                <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 6 }}>Swipe Right Action (swiping from left to right)</Text>
                <SegmentedButtons
                  value={swipeRightAction}
                  onValueChange={(val) => handleSaveSwipePreferences('right', val)}
                  buttons={[
                    { value: 'In Progress', label: 'In Progress' },
                    { value: 'Complete', label: 'Complete' },
                    { value: 'None', label: 'None' }
                  ]}
                />
              </View>
            </View>

            <Button
              mode="contained"
              onPress={handleLogout}
              buttonColor={materialColors.error}
              style={styles.logoutButton}
            >
              Logout
            </Button>

            <Text style={styles.versionText}>Version {Constants.expoConfig?.version || '1.1.0'}</Text>
          </>
        )}
      </ScrollView>

      {/* ID Card Modal (Keep outside ScrollView or use Portal) */}
      <Modal
        visible={isIdCardVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIdCardVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Employee ID Card</Text>
              <IconButton icon="close" onPress={() => setIdCardVisible(false)} />
            </View>

            {/* Visual ID Card Representation */}
            <View style={styles.idCardVisual}>
              <View style={styles.idCardLeftBar} />
              <View style={styles.idCardBody}>
                <View style={styles.idCardHeader}>
                  <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
                  <Text style={styles.companyName}>Amtariksha</Text>
                </View>
                <View style={styles.idCardMain}>
                  {user?.idCardPhoto ? (
                    <Image source={{ uri: user.idCardPhoto }} style={styles.idCardPhoto} />
                  ) : (
                    <View style={styles.idCardPhotoPlaceholder}>
                      <Text style={styles.idCardPlaceholderText}>{getInitials(user?.name)}</Text>
                    </View>
                  )}
                  <View style={styles.idCardInfo}>
                    <Text style={styles.idCardName}>{user?.name}</Text>
                    <Text style={styles.idCardRole}>{user?.role} - {user?.department}</Text>
                  </View>
                </View>
                <View style={styles.idCardFooter}>
                  <View>
                    <Text style={styles.idCardLabel}>ID</Text>
                    <Text style={styles.idCardValue}>{user?.employeeId}</Text>
                  </View>
                  <View>
                    <Text style={styles.idCardLabel}>Joined</Text>
                    <Text style={styles.idCardValue}>
                      {user?.createdAt && !isNaN(new Date(user.createdAt).getTime())
                        ? new Date(user.createdAt).toLocaleDateString()
                        : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Button mode="outlined" onPress={() => setIdCardVisible(false)} style={{ marginTop: 20 }}>
              Close
            </Button>
          </View>
        </View>
      </Modal>

      {/* Change PIN Dialog */}
      <Portal>
        <Dialog visible={changePinVisible} onDismiss={() => setChangePinVisible(false)}>
          <Dialog.Title>
            {changePinStep === 'verify' && 'Verify Current PIN'}
            {changePinStep === 'new' && 'Enter New PIN'}
            {changePinStep === 'confirm' && 'Confirm New PIN'}
          </Dialog.Title>
          <Dialog.Content>
            {changePinStep === 'verify' && (
              <View>
                <Text style={{ marginBottom: 12 }}>Please enter your current 4-digit PIN to proceed.</Text>
                <PaperInput
                  mode="outlined"
                  label="Current PIN"
                  value={currentPinInput}
                  onChangeText={setCurrentPinInput}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus
                />
              </View>
            )}
            {changePinStep === 'new' && (
              <View>
                <Text style={{ marginBottom: 12 }}>Please enter your new 4-digit security PIN.</Text>
                <PaperInput
                  mode="outlined"
                  label="New PIN"
                  value={newPinInput}
                  onChangeText={setNewPinInput}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus
                />
              </View>
            )}
            {changePinStep === 'confirm' && (
              <View>
                <Text style={{ marginBottom: 12 }}>Please confirm your new 4-digit security PIN.</Text>
                <PaperInput
                  mode="outlined"
                  label="Confirm PIN"
                  value={confirmPinInput}
                  onChangeText={setConfirmPinInput}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus
                />
              </View>
            )}
            {changePinError ? (
              <Text style={{ color: colors.error, marginTop: 8 }}>{changePinError}</Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setChangePinVisible(false)}>Cancel</Button>
            <Button
              onPress={handleProcessChangePin}
              disabled={
                (changePinStep === 'verify' && currentPinInput.length < 4) ||
                (changePinStep === 'new' && newPinInput.length < 4) ||
                (changePinStep === 'confirm' && confirmPinInput.length < 4)
              }
            >
              {changePinStep === 'confirm' ? 'Save' : 'Next'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

    </View>
  )
}

const getStyles = (colors: any) => StyleSheet.create({
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
  headerContainer: {
    padding: materialSpacing.md,
    backgroundColor: colors.background,
  },
  headerTitle: {
    ...materialTypography.headlineMedium,
    color: colors.text,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: materialSpacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: materialSpacing.md,
    marginBottom: materialSpacing.md,
  },
  actionButtonLabel: {
    fontSize: 14,
    color: colors.primary,
  },
  editButton: {
    // marginLeft: 'auto', // Removed marginLeft auto, relies on space-between
  },
  divider: {
    marginVertical: materialSpacing.sm,
  },
  card: {
    margin: materialSpacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: materialSpacing.lg,
  },
  userCardContent: {
    flexDirection: 'row',
    padding: materialSpacing.lg,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: materialSpacing.md,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...materialTypography.titleLarge,
    fontWeight: 'bold',
    color: colors.text,
  },
  userEmail: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: materialSpacing.md,
    marginBottom: materialSpacing.lg,
    gap: 8,
  },
  statBox: {
    flex: 1,
    minWidth: '22%',
    alignItems: 'center',
    padding: materialSpacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 8,
  },
  statNumber: {
    ...materialTypography.headlineSmall,
    color: colors.primary,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionContainer: {
    paddingHorizontal: materialSpacing.md,
    marginBottom: materialSpacing.lg,
  },
  sectionTitle: {
    ...materialTypography.titleMedium,
    color: colors.text,
    fontWeight: '600',
    marginBottom: materialSpacing.sm,
  },
  idCardButton: {
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  uploadCard: {
    padding: materialSpacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outline,
    alignItems: 'center',
  },
  uploadHelpText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: materialSpacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: materialSpacing.md,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.text,
  },
  logoutButton: {
    margin: materialSpacing.lg,
    marginTop: 0,
  },
  versionText: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 12,
    marginBottom: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  idCardVisual: {
    flexDirection: 'row',
    height: 200,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  idCardLeftBar: {
    width: 24,
    backgroundColor: colors.primary,
  },
  idCardBody: {
    flex: 1,
    padding: 16,
  },
  idCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  idCardMain: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  idCardPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.surfaceVariant,
  },
  idCardPhotoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idCardPlaceholderText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  idCardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  idCardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  idCardRole: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  idCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  idCardLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  idCardValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  // Form Styles
  formContainer: {
    padding: materialSpacing.md,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
    height: 50,
    justifyContent: 'center',
  },
  picker: {
    height: 50,
    color: colors.text,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: materialSpacing.sm,
  },
  detailLabel: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    ...materialTypography.bodyMedium,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
})
