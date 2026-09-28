/**
 * WFH Details Screen
 * Displays full WFH application details with approve/reject actions
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
import { formatDateIST, formatTimeIST } from '../utils/datetime'
import apiClient from '../services/apiClient'
import { APPROVER_ROLES } from '../utils/permissions'

interface WFHApplication {
  id: string
  applicationId: string
  employeeId: string
  employeeName: string
  wfhType: string
  reason: string
  fromDate: string
  toDate: string
  workLocation: string
  availableFrom: string | null
  availableTo: string | null
  contactNumber: string
  status: string
  managerId: string | null
  approvedBy: string | null
  approvalDate: string | null
  approvalRemarks: string | null
  createdAt: string
  updatedAt: string
}

export default function WFHDetailsScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { wfhId } = route.params as { wfhId: string }
  const { colors } = useTheme()
  const responsive = useResponsive()
  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [wfh, setWFH] = useState<WFHApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [remarks, setRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadCurrentUser = useCallback(async () => {
    const user = await getUserData()
    setCurrentUser(user)
  }, [])

  const fetchWFHDetails = useCallback(async () => {
    try {
      setLoading(true)
      const result = await apiClient.get(`/api/wfh/${wfhId}`)
      if (result.success && result.data) {
        setWFH(result.data)
      } else {
        // There was no else branch at all, so a 403 or 404 left the screen on a
        // blank spinner-less card with no explanation.
        Alert.alert('Error', result.error || result.message || 'Failed to load WFH details')
      }
    } catch (error) {
      console.error('Failed to fetch WFH details:', error)
      Alert.alert('Error', 'Failed to load WFH details')
    } finally {
      setLoading(false)
    }
  }, [wfhId])

  const canApprove = useCallback(() => {
    if (!currentUser || !wfh) return false
    if (wfh.status !== 'Pending') return false
    // Never your own request — the server refuses it too (authz.canApproveFor).
    if (wfh.employeeId === currentUser.employeeId) return false
    // 'amtarikshian' is the plain employee role, so this used to offer Approve to
    // everyone while leaving it off for admins.
    if (wfh.managerId && wfh.managerId === currentUser.employeeId) return true
    return APPROVER_ROLES.includes(currentUser.role)
  }, [currentUser, wfh])

  const canDelete = useCallback(() => {
    if (!currentUser || !wfh) return false
    return wfh.employeeId === currentUser.employeeId && wfh.status === 'Pending'
  }, [currentUser, wfh])

  useEffect(() => {
    loadCurrentUser()
  }, [loadCurrentUser])

  useEffect(() => {
    if (currentUser) {
      fetchWFHDetails()
    }
  }, [currentUser, fetchWFHDetails])

  const handleApprove = useCallback(async () => {
    Alert.alert(
      'Approve WFH',
      'Are you sure you want to approve this WFH application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.post(
                `/api/wfh/${wfhId}/approve`,
                {
                  remarks: remarks || null,
                }
              )

              if (result.success) {
                Alert.alert('Success', 'WFH application approved')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to approve WFH')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to approve WFH')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [wfhId, currentUser, remarks, navigation])

  const handleReject = useCallback(async () => {
    if (!remarks.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection')
      return
    }

    Alert.alert(
      'Reject WFH',
      'Are you sure you want to reject this WFH application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.post(
                `/api/wfh/${wfhId}/reject`,
                {
                  reason: remarks,
                  remarks: remarks,
                }
              )

              if (result.success) {
                Alert.alert('Success', 'WFH application rejected')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to reject WFH')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to reject WFH')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [wfhId, currentUser, remarks, navigation])

  const handleDelete = useCallback(async () => {
    Alert.alert(
      'Delete WFH',
      'Are you sure you want to delete this WFH application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true)
              const result = await apiClient.del(`/api/wfh/${wfhId}`)

              if (result.success) {
                Alert.alert('Success', 'WFH application deleted')
                navigation.goBack()
              } else {
                Alert.alert('Error', result.error || 'Failed to delete WFH')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete WFH')
            } finally {
              setActionLoading(false)
            }
          },
        },
      ]
    )
  }, [wfhId, navigation])

  // Use formatDateIST and formatTimeIST from utils
  // const formatDate = ...
  // const formatTime = ...

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

  const getWFHTypeColor = useCallback((type: string) => {
    switch (type) {
      case 'Full Day':
        return colors.primary
      case 'Half Day':
        return colors.purple
      case 'Flexible Hours':
        return colors.pink
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

  if (!wfh) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>WFH application not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: getWFHTypeColor(wfh.wfhType) },
            ]}
          >
            <Text style={styles.typeText}>{wfh.wfhType}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(wfh.status) },
            ]}
          >
            <Text style={styles.statusText}>{wfh.status}</Text>
          </View>
        </View>
        <Text style={styles.applicationId}>{wfh.applicationId}</Text>
      </View>

      {/* Employee Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Employee Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{wfh.employeeName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Employee ID:</Text>
          <Text style={styles.infoValue}>{wfh.employeeId}</Text>
        </View>
      </View>

      {/* WFH Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WFH Details</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>From:</Text>
          <Text style={styles.infoValue}>{formatDateIST(wfh.fromDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>To:</Text>
          <Text style={styles.infoValue}>{formatDateIST(wfh.toDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Duration:</Text>
          <Text style={styles.infoValue}>
            {calculateDays(wfh.fromDate, wfh.toDate)} day(s)
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Work Location:</Text>
          <Text style={styles.infoValue}>{wfh.workLocation}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Contact Number:</Text>
          <Text style={styles.infoValue}>{wfh.contactNumber}</Text>
        </View>
        {wfh.wfhType === 'Flexible Hours' && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Available From:</Text>
              <Text style={styles.infoValue}>{wfh.availableFrom ? formatTimeIST(wfh.availableFrom) : 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Available To:</Text>
              <Text style={styles.infoValue}>{wfh.availableTo ? formatTimeIST(wfh.availableTo) : 'N/A'}</Text>
            </View>
          </>
        )}
      </View>

      {/* Reason */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reason</Text>
        <Text style={styles.reasonText}>{wfh.reason}</Text>
      </View>

      {/* Approval Info */}
      {(wfh.approvedBy || wfh.approvalRemarks) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Approval Information</Text>
          {wfh.approvedBy && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {wfh.status === 'Approved' ? 'Approved By:' : 'Rejected By:'}
              </Text>
              <Text style={styles.infoValue}>{wfh.approvedBy}</Text>
            </View>
          )}
          {wfh.approvalDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{formatDateIST(wfh.approvalDate)}</Text>
            </View>
          )}
          {wfh.approvalRemarks && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Remarks:</Text>
              <Text style={styles.infoValue}>{wfh.approvalRemarks}</Text>
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
            <Text style={styles.timelineDate}>{formatDateIST(wfh.createdAt)}</Text>
          </View>
        </View>
        {wfh.approvalDate && (
          <View style={styles.timelineItem}>
            <View
              style={[
                styles.timelineDot,
                { backgroundColor: getStatusColor(wfh.status) },
              ]}
            />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>
                {wfh.status === 'Approved' ? 'Approved' : 'Rejected'}
              </Text>
              <Text style={styles.timelineDate}>{formatDateIST(wfh.approvalDate)}</Text>
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

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: responsive.spacing.sm,
    fontSize: responsive.fontSize.md,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: responsive.fontSize.md,
    color: colors.error,
  },
  header: {
    backgroundColor: colors.card,
    padding: responsive.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxWidth: responsive.maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  headerTop: {
    flexDirection: 'row',
    gap: responsive.spacing.xs,
    marginBottom: responsive.spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: responsive.spacing.sm,
    paddingVertical: responsive.spacing.xxs,
    borderRadius: responsive.borderRadius.full,
  },
  typeText: {
    fontSize: responsive.fontSize.xs,
    fontWeight: '600',
    color: colors.card,
  },
  statusBadge: {
    paddingHorizontal: responsive.spacing.sm,
    paddingVertical: responsive.spacing.xxs,
    borderRadius: responsive.borderRadius.full,
  },
  statusText: {
    fontSize: responsive.fontSize.xs,
    fontWeight: '600',
    color: colors.card,
  },
  applicationId: {
    fontSize: responsive.fontSize.sm,
    color: colors.textTertiary,
  },
  section: {
    backgroundColor: colors.card,
    padding: responsive.spacing.lg,
    marginTop: responsive.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxWidth: responsive.maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: responsive.fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: responsive.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: responsive.spacing.xs,
  },
  infoLabel: {
    fontSize: responsive.fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: responsive.fontSize.sm,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  reasonText: {
    fontSize: responsive.fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: responsive.spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: responsive.spacing.sm,
    marginTop: responsive.spacing.xxs,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: responsive.fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    marginBottom: responsive.spacing.xxs,
  },
  timelineDate: {
    fontSize: responsive.fontSize.xs,
    color: colors.textTertiary,
  },
  remarksInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: responsive.borderRadius.md,
    padding: responsive.spacing.sm,
    fontSize: responsive.fontSize.sm,
    color: colors.text,
    marginBottom: responsive.spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.card,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: responsive.spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: responsive.spacing.sm,
    borderRadius: responsive.borderRadius.md,
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
    fontSize: responsive.fontSize.md,
    fontWeight: '600',
    color: colors.card,
  },
})

