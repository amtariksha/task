/**
 * Leave Details Screen
 * Displays full leave application details with approve/reject actions
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native'
import { Card, Text, Surface, Button, TextInput, ActivityIndicator, Chip, Divider } from 'react-native-paper'
import { useNavigation, useRoute } from '@react-navigation/native'
import { getUserData } from '../utils/secureStorage'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { formatDateIST } from '../utils/datetime'
import apiClient from '../services/apiClient'
import { APPROVER_ROLES } from '../utils/permissions'

interface LeaveApplication {
  id: string
  applicationId: string
  employeeId: string
  employeeName: string
  leaveType: string
  reason: string
  fromDate: string
  toDate: string
  isHalfDay: boolean
  emergencyContact: string | null
  status: string
  managerId: string | null
  approvedBy: string | null
  approvalDate: string | null
  approvalRemarks: string | null
  createdAt: string
  updatedAt: string
}

export default function LeaveDetailsScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { leaveId } = route.params as { leaveId: string }
  const { colors } = useTheme()
  const responsive = useResponsive()

  const [leave, setLeave] = useState<LeaveApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [remarks, setRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  useEffect(() => {
    loadCurrentUser()
  }, [])

  useEffect(() => {
    if (currentUser) {
      fetchLeaveDetails()
    }
  }, [currentUser])

  const loadCurrentUser = useCallback(async () => {
    const user = await getUserData()
    setCurrentUser(user)
  }, [])

  const fetchLeaveDetails = useCallback(async () => {
    try {
      setLoading(true)
      console.log('Fetching leave details for ID:', leaveId)

      const result = await apiClient.get(`/api/leaves/${leaveId}`)
      console.log('Leave API result:', JSON.stringify(result, null, 2))

      if (result.success && result.data) {
        setLeave(result.data)
      } else {
        const errorMsg = result.error || result.message || 'Failed to load leave details'
        console.error('Leave API error:', errorMsg)
        Alert.alert('Error', errorMsg)
      }
    } catch (error: any) {
      console.error('Failed to fetch leave details:', error)
      const errorMessage = error.message || 'Failed to load leave details. Please check your connection and try again.'
      Alert.alert('Error', errorMessage)
    } finally {
      setLoading(false)
    }
  }, [leaveId])

  const canApprove = useCallback(() => {
    if (!currentUser || !leave) return false
    if (leave.status !== 'Pending') return false
    // Never your own application — the server refuses it too (authz.canApproveFor).
    if (leave.employeeId === currentUser.employeeId) return false
    // 'amtarikshian' is the plain employee role, so this used to offer Approve to
    // everyone while leaving it off for admins. The applicant's own manager may
    // approve whatever their global role is; the server has the final say.
    if (leave.managerId && leave.managerId === currentUser.employeeId) return true
    return APPROVER_ROLES.includes(currentUser.role)
  }, [currentUser, leave])

  const canDelete = useCallback(() => {
    if (!currentUser || !leave) return false
    return leave.employeeId === currentUser.employeeId && leave.status === 'Pending'
  }, [currentUser, leave])

  const handleApprove = useCallback(async () => {
    Alert.alert(
      'Approve Leave',
      'Are you sure you want to approve this leave application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.post(
                `/api/leaves/${leaveId}/approve`,
                {
                  remarks: remarks || null,
                }
              )

              if (result.success) {
                Alert.alert('Success', 'Leave application approved')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to approve leave')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to approve leave')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [currentUser, leaveId, remarks, navigation])

  const handleReject = useCallback(async () => {
    if (!remarks.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection')
      return
    }

    Alert.alert(
      'Reject Leave',
      'Are you sure you want to reject this leave application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.post(
                `/api/leaves/${leaveId}/reject`,
                {
                  remarks: remarks,
                  reason: remarks,
                }
              )

              if (result.success) {
                Alert.alert('Success', 'Leave application rejected')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to reject leave')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to reject leave')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [currentUser, leaveId, remarks, navigation])

  const handleDelete = useCallback(async () => {
    Alert.alert(
      'Delete Leave',
      'Are you sure you want to delete this leave application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.del(`/api/leaves/${leaveId}`)

              if (result.success) {
                Alert.alert('Success', 'Leave application deleted')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to delete leave')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete leave')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [leaveId, navigation])

  // Use formatDateIST from utils
  // const formatDate = (dateString: string) => { ... }

  const calculateDays = useCallback((fromDate: string, toDate: string) => {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    const diffTime = Math.abs(to.getTime() - from.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
  }, [])

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'Pending':
        return colors.warning
      case 'Approved':
        return colors.success
      case 'Rejected':
        return colors.error
      default:
        return colors.textSecondary
    }
  }, [colors])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    )
  }

  if (!leave) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Leave application not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.leaveType}>{leave.leaveType}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(leave.status) }]}>
            <Text style={styles.statusText}>{leave.status}</Text>
          </View>
        </View>
        <Text style={styles.applicationId}>{leave.applicationId}</Text>
      </View>

      {/* Employee Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Employee Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{leave.employeeName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Employee ID:</Text>
          <Text style={styles.infoValue}>{leave.employeeId}</Text>
        </View>
      </View>

      {/* Leave Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leave Details</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>From:</Text>
          <Text style={styles.infoValue}>{formatDateIST(leave.fromDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>To:</Text>
          <Text style={styles.infoValue}>{formatDateIST(leave.toDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Duration:</Text>
          <Text style={styles.infoValue}>
            {calculateDays(leave.fromDate, leave.toDate)} day(s)
            {leave.isHalfDay && ' (Half Day)'}
          </Text>
        </View>
        {leave.emergencyContact && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Emergency Contact:</Text>
            <Text style={styles.infoValue}>{leave.emergencyContact}</Text>
          </View>
        )}
      </View>

      {/* Reason */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reason</Text>
        <Text style={styles.reasonText}>{leave.reason}</Text>
      </View>

      {/* Approval Info */}
      {(leave.approvedBy || leave.approvalRemarks) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Approval Information</Text>
          {leave.approvedBy && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {leave.status === 'Approved' ? 'Approved By:' : 'Rejected By:'}
              </Text>
              <Text style={styles.infoValue}>{leave.approvedBy}</Text>
            </View>
          )}
          {leave.approvalDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{formatDateIST(leave.approvalDate)}</Text>
            </View>
          )}
          {leave.approvalRemarks && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Remarks:</Text>
              <Text style={styles.infoValue}>{leave.approvalRemarks}</Text>
            </View>
          )}
        </View>
      )}

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.timelineItem}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>Application Created</Text>
            <Text style={styles.timelineDate}>{formatDateIST(leave.createdAt)}</Text>
          </View>
        </View>
        {leave.approvalDate && (
          <View style={styles.timelineItem}>
            <View
              style={[
                styles.timelineDot,
                { backgroundColor: getStatusColor(leave.status) },
              ]}
            />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>
                {leave.status === 'Approved' ? 'Approved' : 'Rejected'}
              </Text>
              <Text style={styles.timelineDate}>{formatDateIST(leave.approvalDate)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {canApprove() && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remarks (Optional)</Text>
          <TextInput
            style={styles.remarksInput}
            placeholder="Add remarks..."
            value={remarks}
            onChangeText={setRemarks}
            multiline
            numberOfLines={3}
          />
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>
                {actionLoading ? 'Processing...' : 'Reject'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={handleApprove}
              disabled={actionLoading}
            >
              <Text style={styles.actionButtonText}>
                {actionLoading ? 'Processing...' : 'Approve'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {canDelete() && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDelete}
            disabled={actionLoading}
          >
            <Text style={styles.actionButtonText}>
              {actionLoading ? 'Deleting...' : 'Delete Application'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const getStyles = (colors: any, responsive: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      maxWidth: responsive.maxContentWidth,
      alignSelf: 'center',
      width: '100%',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: responsive.spacing.md,
      fontSize: responsive.fontSize.body,
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: responsive.fontSize.body,
      color: colors.error,
    },
    header: {
      backgroundColor: colors.card,
      padding: responsive.containerPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: responsive.spacing.sm,
    },
    leaveType: {
      fontSize: responsive.fontSize.heading,
      fontWeight: '600',
      color: colors.text,
    },
    statusBadge: {
      paddingHorizontal: responsive.spacing.md,
      paddingVertical: responsive.spacing.xs,
      borderRadius: responsive.isTablet ? 20 : 16,
    },
    statusText: {
      fontSize: responsive.fontSize.small,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    applicationId: {
      fontSize: responsive.fontSize.body,
      color: colors.textTertiary,
    },
    section: {
      backgroundColor: colors.card,
      padding: responsive.containerPadding,
      marginTop: responsive.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      fontSize: responsive.fontSize.body,
      fontWeight: '600',
      color: colors.text,
      marginBottom: responsive.spacing.md,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: responsive.spacing.sm,
    },
    infoLabel: {
      fontSize: responsive.fontSize.body,
      color: colors.textSecondary,
      flex: 1,
    },
    infoValue: {
      fontSize: responsive.fontSize.body,
      color: colors.text,
      fontWeight: '500',
      flex: 2,
      textAlign: 'right',
    },
    reasonText: {
      fontSize: responsive.fontSize.body,
      color: colors.text,
      lineHeight: 20,
    },
    timelineItem: {
      flexDirection: 'row',
      marginBottom: responsive.spacing.lg,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
      marginRight: responsive.spacing.md,
      marginTop: 4,
    },
    timelineContent: {
      flex: 1,
    },
    timelineTitle: {
      fontSize: responsive.fontSize.body,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    timelineDate: {
      fontSize: responsive.fontSize.small,
      color: colors.textTertiary,
    },
    remarksInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: responsive.isTablet ? 12 : 8,
      padding: responsive.spacing.md,
      fontSize: responsive.fontSize.body,
      color: colors.text,
      backgroundColor: colors.background,
      marginBottom: responsive.spacing.lg,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    actionButtons: {
      flexDirection: 'row',
      gap: responsive.spacing.md,
    },
    actionButton: {
      flex: 1,
      paddingVertical: responsive.spacing.md,
      borderRadius: responsive.isTablet ? 12 : 8,
      alignItems: 'center',
    },
    approveButton: {
      backgroundColor: colors.success,
    },
    rejectButton: {
      backgroundColor: colors.error,
    },
    deleteButton: {
      backgroundColor: colors.error,
    },
    actionButtonText: {
      fontSize: responsive.fontSize.body,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  })


