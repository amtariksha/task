import React, { useState, useEffect, useContext } from 'react'
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native'
import { Text, Switch, Button, IconButton, Divider, Card, Title, ActivityIndicator } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { AuthContext } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import apiClient from '../services/apiClient'
import { getUserData } from '../utils/secureStorage'
import DateTimePicker from '@react-native-community/datetimepicker'

interface NotificationPreferences {
    employeeId: string

    // Channels
    emailEnabled: boolean
    telegramEnabled: boolean
    inAppEnabled: boolean

    // Task Notifications
    taskAssigned: boolean
    taskUpdated: boolean
    taskCommented: boolean
    taskDueSoon: boolean
    taskOverdue: boolean
    taskCompleted: boolean
    taskSupportAssigned: boolean

    // Bug Notifications
    bugAssigned: boolean
    bugUpdated: boolean
    bugCommented: boolean
    bugStatusChanged: boolean
    bugSeverityChanged: boolean

    // Leave & WFH
    leaveApproved: boolean
    leaveRejected: boolean
    leavePendingApproval: boolean
    wfhApproved: boolean
    wfhRejected: boolean
    wfhPendingApproval: boolean

    // Project
    projectAssigned: boolean
    projectUpdated: boolean

    // Team
    teamMemberAdded: boolean
    teamTaskCreated: boolean

    // System
    systemAnnouncements: boolean
    dailySummary: boolean
    weeklySummary: boolean

    // Quiet Hours
    quietHoursEnabled: boolean
    quietHoursStart: string
    quietHoursEnd: string
}

export default function NotificationSettingsScreen() {
    const navigation = useNavigation()
    const { colors } = useTheme()
    const styles = getStyles(colors)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
    const [hasChanges, setHasChanges] = useState(false)
    const [showTimePicker, setShowTimePicker] = useState<{ show: boolean, key: 'quietHoursStart' | 'quietHoursEnd' | null }>({ show: false, key: null })

    useEffect(() => {
        loadPreferences()
    }, [])

    const loadPreferences = async () => {
        try {
            setLoading(true)
            const userData = await getUserData()
            if (!userData?.employeeId) {
                Alert.alert('Error', 'User data not found')
                return
            }

            const response = await apiClient.get(`/api/notification-preferences?employeeId=${userData.employeeId}`)

            if (response.success && response.data) {
                setPreferences(response.data)
                setHasChanges(false)
            } else {
                // The server's message says WHY — a 403 from the per-user access
                // check reads very differently from a database timeout.
                Alert.alert('Error', response.error || 'Failed to load preferences')
            }
        } catch (error) {
            console.error('Failed to load preferences:', error)
            Alert.alert('Error', 'Failed to load preferences')
        } finally {
            setLoading(false)
        }
    }

    const togglePreference = (key: keyof NotificationPreferences) => {
        if (!preferences) return

        setPreferences({
            ...preferences,
            [key]: !preferences[key]
        })
        setHasChanges(true)
    }

    const updateTimePreference = (key: 'quietHoursStart' | 'quietHoursEnd', date: Date) => {
        if (!preferences) return

        // Format HH:mm
        const hours = date.getHours().toString().padStart(2, '0')
        const minutes = date.getMinutes().toString().padStart(2, '0')
        const timeString = `${hours}:${minutes}`

        setPreferences({
            ...preferences,
            [key]: timeString
        })
        setHasChanges(true)
        setShowTimePicker({ show: false, key: null })
    }

    const saveChanges = async () => {
        if (!preferences) return

        try {
            setSaving(true)
            const userData = await getUserData()

            const response = await apiClient.post('/api/notification-preferences', {
                action: 'update',
                employeeId: userData?.employeeId,
                preferences
            })

            if (response.success) {
                setHasChanges(false)
                Alert.alert('Success', 'Preferences saved successfully')
            } else {
                Alert.alert('Error', response.error || 'Failed to save preferences')
            }
        } catch (error) {
            console.error('Failed to save preferences:', error)
            Alert.alert('Error', 'Failed to save preferences')
        } finally {
            setSaving(false)
        }
    }

    const resetToDefaults = async () => {
        Alert.alert(
            'Reset Defaults',
            'Are you sure you want to reset all notification preferences to defaults?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setSaving(true)
                            const userData = await getUserData()

                            const response = await apiClient.post('/api/notification-preferences', {
                                action: 'reset',
                                employeeId: userData?.employeeId
                            })

                            if (response.success && response.data) {
                                setPreferences(response.data)
                                setHasChanges(false)
                                Alert.alert('Success', 'Preferences reset to defaults')
                            } else {
                                // There was no else branch, so a failed reset was
                                // completely silent.
                                Alert.alert('Error', response.error || 'Failed to reset preferences')
                            }
                        } catch (error) {
                            console.error('Failed to reset preferences:', error)
                            Alert.alert('Error', 'Failed to reset preferences')
                        } finally {
                            setSaving(false)
                        }
                    }
                }
            ]
        )
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        )
    }

    if (!preferences) return null

    const SectionHeader = ({ title, icon }: { title: string, icon: string }) => (
        <View style={styles.sectionHeader}>
            <IconButton icon={icon} size={24} iconColor={colors.primary} />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    )

    const SettingRow = ({ label, description, valueKey }: { label: string, description?: string, valueKey: keyof NotificationPreferences }) => (
        <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>{label}</Text>
                {description && <Text style={styles.settingDescription}>{description}</Text>}
            </View>
            <Switch
                value={!!preferences[valueKey]}
                onValueChange={() => togglePreference(valueKey)}
                color={colors.primary}
            />
        </View>
    )

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Actions Header if changes exist */}
                {hasChanges && (
                    <View style={styles.unsavedChangesBanner}>
                        <Text style={styles.unsavedText}>You have unsaved changes</Text>
                        <View style={styles.bannerActions}>
                            <Button mode="text" onPress={loadPreferences} textColor={colors.error}>Undo</Button>
                            <Button mode="contained" onPress={saveChanges} loading={saving}>Save</Button>
                        </View>
                    </View>
                )}

                {/* Channels */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Notification Channels" icon="access-point" />
                        <SettingRow label="Email Notifications" description="Receive notifications via email" valueKey="emailEnabled" />
                        <Divider style={styles.divider} />
                        <SettingRow label="Telegram Notifications" description="Receive notifications via Telegram" valueKey="telegramEnabled" />
                        <Divider style={styles.divider} />
                        <SettingRow label="In-App Notifications" description="Receive notifications in the application" valueKey="inAppEnabled" />
                    </Card.Content>
                </Card>

                {/* Task Notifications */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Task Notifications" icon="checkbox-marked-circle-outline" />
                        <SettingRow label="Task Assigned to Me" valueKey="taskAssigned" />
                        <SettingRow label="Task Updated" valueKey="taskUpdated" />
                        <SettingRow label="Task Commented" valueKey="taskCommented" />
                        <SettingRow label="Task Due Soon" valueKey="taskDueSoon" />
                        <SettingRow label="Task Overdue" valueKey="taskOverdue" />
                        <SettingRow label="Task Completed" valueKey="taskCompleted" />
                        <SettingRow label="Support Team Assignment" valueKey="taskSupportAssigned" />
                    </Card.Content>
                </Card>

                {/* Bug Notifications */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Bug Notifications" icon="bug" />
                        <SettingRow label="Bug Assigned to Me" valueKey="bugAssigned" />
                        <SettingRow label="Bug Updated" valueKey="bugUpdated" />
                        <SettingRow label="Bug Commented" valueKey="bugCommented" />
                        <SettingRow label="Bug Status Changed" valueKey="bugStatusChanged" />
                        <SettingRow label="Bug Severity Changed" valueKey="bugSeverityChanged" />
                    </Card.Content>
                </Card>

                {/* Leave & WFH */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Leave & WFH" icon="calendar-account" />
                        <SettingRow label="Leave Approved" valueKey="leaveApproved" />
                        <SettingRow label="Leave Rejected" valueKey="leaveRejected" />
                        <SettingRow label="Leave Pending Approval" valueKey="leavePendingApproval" />
                        <Divider style={styles.divider} />
                        <SettingRow label="WFH Approved" valueKey="wfhApproved" />
                        <SettingRow label="WFH Rejected" valueKey="wfhRejected" />
                        <SettingRow label="WFH Pending Approval" valueKey="wfhPendingApproval" />
                    </Card.Content>
                </Card>

                {/* Project & Team */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Project & Team" icon="briefcase" />
                        <SettingRow label="Project Assigned" valueKey="projectAssigned" />
                        <SettingRow label="Project Updated" valueKey="projectUpdated" />
                        <SettingRow label="Team Member Added" valueKey="teamMemberAdded" />
                        <SettingRow label="Team Task Created" valueKey="teamTaskCreated" />
                    </Card.Content>
                </Card>

                {/* System */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="System" icon="cog" />
                        <SettingRow label="System Announcements" valueKey="systemAnnouncements" />
                        <SettingRow label="Daily Summary" valueKey="dailySummary" />
                        <SettingRow label="Weekly Summary" valueKey="weeklySummary" />
                    </Card.Content>
                </Card>

                {/* Quiet Hours */}
                <Card style={styles.card}>
                    <Card.Content>
                        <SectionHeader title="Quiet Hours" icon="moon-waning-crescent" />
                        <SettingRow label="Enable Quiet Hours" description="Don't send notifications during quiet hours" valueKey="quietHoursEnabled" />

                        {preferences.quietHoursEnabled && (
                            <View style={styles.timePickerContainer}>
                                <TouchableOpacity onPress={() => setShowTimePicker({ show: true, key: 'quietHoursStart' })} style={styles.timeInput}>
                                    <Text style={styles.timeLabel}>Start Time</Text>
                                    <Text style={styles.timeValue}>{preferences.quietHoursStart}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowTimePicker({ show: true, key: 'quietHoursEnd' })} style={styles.timeInput}>
                                    <Text style={styles.timeLabel}>End Time</Text>
                                    <Text style={styles.timeValue}>{preferences.quietHoursEnd}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Card.Content>
                </Card>

                <Button
                    mode="outlined"
                    onPress={resetToDefaults}
                    style={styles.resetButton}
                    textColor={colors.textSecondary}
                >
                    Reset to Defaults
                </Button>

                <View style={{ height: 40 }} />
            </ScrollView>

            {showTimePicker.show && (
                <DateTimePicker
                    value={new Date()} // Ideally parse the existing time strings to Date objects
                    mode="time"
                    is24Hour={true}
                    display="default"
                    onChange={(event, selectedDate) => {
                        if (event.type === 'set' && selectedDate) {
                            if (showTimePicker.key) {
                                updateTimePreference(showTimePicker.key, selectedDate)
                            }
                        } else {
                            setShowTimePicker({ ...showTimePicker, show: false })
                        }
                    }}
                />
            )}
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
    },
    scrollContent: {
        padding: materialSpacing.md,
    },
    card: {
        marginBottom: materialSpacing.md,
        backgroundColor: colors.surface,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: materialSpacing.sm,
    },
    sectionTitle: {
        ...materialTypography.titleMedium,
        color: colors.text,
        marginLeft: -8, // compensate for IconButton padding
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: materialSpacing.sm,
    },
    settingTextContainer: {
        flex: 1,
        paddingRight: materialSpacing.md,
    },
    settingLabel: {
        ...materialTypography.bodyLarge,
        color: colors.text,
    },
    settingDescription: {
        ...materialTypography.bodySmall,
        color: colors.textSecondary,
        marginTop: 2,
    },
    divider: {
        marginVertical: 4,
    },
    timePickerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: materialSpacing.md,
    },
    timeInput: {
        flex: 1,
        padding: materialSpacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        marginHorizontal: 4,
        alignItems: 'center',
    },
    timeLabel: {
        ...materialTypography.bodySmall,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    timeValue: {
        ...materialTypography.bodyLarge,
        color: colors.text,
        fontWeight: 'bold',
    },
    resetButton: {
        marginTop: materialSpacing.md,
        borderColor: colors.textSecondary,
    },
    unsavedChangesBanner: {
        backgroundColor: colors.warningLight,
        padding: materialSpacing.sm,
        marginBottom: materialSpacing.md,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: colors.warning,
    },
    unsavedText: {
        ...materialTypography.bodyMedium,
        color: colors.warning,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    bannerActions: {
        flexDirection: 'row',
    }
})
