import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
    View,
    FlatList,
    StyleSheet,
    RefreshControl,
    Alert,
    TouchableOpacity,
} from 'react-native'
import { Card, Text, ActivityIndicator, Button, SegmentedButtons, Portal, Dialog, TextInput } from 'react-native-paper'
import { useTheme } from '../contexts/ThemeContext'
import { useQuery, useMutation } from '@apollo/client/react'
import {
    PENDING_ATTENDANCE_REQUESTS,
    APPROVE_ATTENDANCE_REQUEST,
    REJECT_ATTENDANCE_REQUEST
} from '../config/graphql-queries'
import { materialColors, materialTypography, materialSpacing } from '../config/materialTheme'
import { formatDateTimeIST, formatDateIST } from '../utils/datetime'
import { useResponsive } from '../hooks/useResponsive'
import { getUserData } from '../utils/secureStorage'
import apiClient from '../services/apiClient'

interface AttendanceRequest {
    id: string
    userId: string
    attendanceDate: string
    requestType: string
    originalTime: string | null
    newTime: string
    reason: string
    status: string
    createdAt: string
    user: {
        employeeId: string
        name: string
        department: string
        role: string
    }
}

interface LeaveRequest {
    id: string
    applicationId: string
    employeeId: string
    employeeName: string
    leaveType: string
    reason: string
    fromDate: string
    toDate: string
    isHalfDay: boolean
    status: string
    createdAt: string
}

interface WfhRequest {
    id: string
    applicationId: string
    employeeId: string
    employeeName: string
    wfhType: string
    reason: string
    fromDate: string
    toDate: string
    workLocation: string
    status: string
    createdAt: string
}

/**
 * The server's own message out of an Apollo mutate result. Apollo is configured
 * with errorPolicy 'all', so a FORBIDDEN from the server arrives as data on the
 * result rather than as a thrown exception, and the shape differs between
 * versions — hence the defensive read.
 */
const graphQLMessage = (result: unknown, fallback: string): string => {
    const r = result as {
        error?: { message?: string }
        errors?: ReadonlyArray<{ message?: string }> | null
    } | null
    return r?.errors?.[0]?.message || r?.error?.message || fallback
}

export default function AttendanceApprovalsScreen() {
    const { colors } = useTheme()
    const responsive = useResponsive()
    const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

    const [activeTab, setActiveTab] = useState<'attendance' | 'leaves' | 'wfh'>('attendance')
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [teamMembers, setTeamMembers] = useState<string[]>([])
    // Distinguishes "no team" from "team not fetched yet", so an empty team means
    // an empty queue rather than no filter at all.
    const [teamLoaded, setTeamLoaded] = useState(false)

    // Leaves & WFH states
    const [leaves, setLeaves] = useState<LeaveRequest[]>([])
    const [wfh, setWfh] = useState<WfhRequest[]>([])
    const [loadingREST, setLoadingREST] = useState(false)
    const [restError, setRestError] = useState('')

    // Rejection Modal states
    const [rejectionModalVisible, setRejectionModalVisible] = useState(false)
    const [rejectionId, setRejectionId] = useState<string | null>(null)
    const [rejectionType, setRejectionType] = useState<'leave' | 'wfh' | null>(null)
    const [rejectionReasonText, setRejectionReasonText] = useState('')
    const [submittingRejection, setSubmittingRejection] = useState(false)

    // Attendance Approvals GraphQL
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [rejectingId, setRejectingId] = useState<string | null>(null)

    const { data: attendanceData, loading: loadingAttendance, refetch: refetchAttendance } = useQuery<any, any>(PENDING_ATTENDANCE_REQUESTS, {
        fetchPolicy: 'cache-and-network',
    })

    const [approveAttendance] = useMutation<any, any>(APPROVE_ATTENDANCE_REQUEST)
    const [rejectAttendance] = useMutation<any, any>(REJECT_ATTENDANCE_REQUEST)

    const attendanceRequests = (attendanceData as any)?.pendingAttendanceRequests || []

    const loadUserAndTeam = useCallback(async () => {
        try {
            const user = await getUserData()
            if (user) {
                setCurrentUser(user)
                // recursive=true: managers have managers, so a senior manager
                // approves for their skip-level reports too.
                const result = await apiClient.get(`/api/users/team/${user.employeeId}?recursive=true`)
                const team = result.success ? result.data : []
                if (Array.isArray(team)) {
                    setTeamMembers(team.map((m: any) => m.employeeId))
                }
                setTeamLoaded(true)
            }
        } catch (e) {
            console.error('Failed to load user/team in approvals:', e)
        }
    }, [])

    useEffect(() => {
        loadUserAndTeam()
    }, [loadUserAndTeam])

    const fetchLeavesAndWFH = useCallback(async () => {
        if (!currentUser) return
        try {
            setLoadingREST(true)
            const roleLower = currentUser.role?.toLowerCase()
            const showAll = ['admin', 'top_management'].includes(roleLower)

            // `teamMembers.length > 0` meant an employee with no reports got NO
            // filter at all and saw every pending request in the list. The server
            // now scopes these endpoints too, but the client must not fall open.
            const restrictToTeam = (rows: any[]) =>
                showAll ? rows : rows.filter((r: any) => teamMembers.includes(r.employeeId))

            // Fetch Leaves
            const leaveResult = await apiClient.get('/api/leaves')
            if (leaveResult.success) {
                const pendingLeaves = restrictToTeam(
                    (leaveResult.data || []).filter((l: any) => l.status === 'Pending')
                )
                setLeaves(pendingLeaves)
                setRestError('')
            } else {
                setLeaves([])
                setRestError(leaveResult.error || 'Could not load pending leave requests.')
            }

            // Fetch WFH
            const wfhResult = await apiClient.get('/api/wfh')
            if (wfhResult.success) {
                const pendingWfh = restrictToTeam(
                    (wfhResult.data || []).filter((w: any) => w.status === 'Pending')
                )
                setWfh(pendingWfh)
            } else {
                setWfh([])
                setRestError(wfhResult.error || 'Could not load pending WFH requests.')
            }
        } catch (e) {
            console.error('Failed to fetch Leaves & WFH:', e)
            setRestError('Could not load pending requests. Check your connection and try again.')
        } finally {
            setLoadingREST(false)
        }
    }, [currentUser, teamMembers])

    useEffect(() => {
        if (currentUser && teamLoaded) {
            fetchLeavesAndWFH()
        }
    }, [currentUser, teamLoaded, fetchLeavesAndWFH, activeTab])

    const handleRefresh = useCallback(async () => {
        if (activeTab === 'attendance') {
            try {
                await refetchAttendance()
            } catch (e) {
                console.error(e)
            }
        } else {
            await fetchLeavesAndWFH()
        }
    }, [activeTab, refetchAttendance, fetchLeavesAndWFH])

    // Attendance Approval handlers
    const handleApproveAttendance = useCallback(async (id: string) => {
        try {
            setApprovingId(id)
            const res = await approveAttendance({ variables: { requestId: id } })
            if (res.data?.approveAttendanceRequest) {
                Alert.alert('Success', 'Attendance request approved')
                refetchAttendance()
            } else {
                // Apollo is configured with errorPolicy 'all', so a FORBIDDEN from
                // the server resolves instead of throwing and this branch was the
                // silent one.
                Alert.alert('Error', graphQLMessage(res, 'Failed to approve attendance request'))
            }
        } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to approve attendance request')
        } finally {
            setApprovingId(null)
        }
    }, [approveAttendance, refetchAttendance])

    const handleRejectAttendance = useCallback(async (id: string) => {
        try {
            setRejectingId(id)
            const res = await rejectAttendance({ variables: { requestId: id } })
            if (res.data?.rejectAttendanceRequest) {
                Alert.alert('Success', 'Attendance request rejected')
                refetchAttendance()
            } else {
                Alert.alert('Error', graphQLMessage(res, 'Failed to reject attendance request'))
            }
        } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reject attendance request')
        } finally {
            setRejectingId(null)
        }
    }, [rejectAttendance, refetchAttendance])

    // Leaves / WFH REST handlers
    const handleApproveLeave = async (id: string) => {
        try {
            // No approverId: the server takes the approver from the verified
            // session and ignores the body field (it used to trust it).
            const result = await apiClient.post(`/api/leaves/${id}/approve`, {
                remarks: 'Approved via Mobile App'
            })
            if (result.success) {
                Alert.alert('Success', 'Leave application approved')
                setLeaves(prev => prev.filter(l => l.id !== id))
            } else {
                Alert.alert('Error', result.error || 'Failed to approve leave')
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to approve leave')
        }
    }

    const openRejectLeave = (id: string) => {
        setRejectionId(id)
        setRejectionType('leave')
        setRejectionReasonText('')
        setRejectionModalVisible(true)
    }

    const handleApproveWFH = async (id: string) => {
        try {
            const result = await apiClient.post(`/api/wfh/${id}/approve`, {
                remarks: 'Approved via Mobile App'
            })
            if (result.success) {
                Alert.alert('Success', 'WFH application approved')
                setWfh(prev => prev.filter(w => w.id !== id))
            } else {
                Alert.alert('Error', result.error || 'Failed to approve WFH')
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to approve WFH')
        }
    }

    const openRejectWFH = (id: string) => {
        setRejectionId(id)
        setRejectionType('wfh')
        setRejectionReasonText('')
        setRejectionModalVisible(true)
    }

    const submitRejection = async () => {
        if (!rejectionReasonText.trim() || !rejectionId || !rejectionType) {
            Alert.alert('Error', 'Rejection reason is required')
            return
        }
        try {
            setSubmittingRejection(true)
            const endpoint = rejectionType === 'leave' ? 'leaves' : 'wfh'
            const result = await apiClient.post(`/api/${endpoint}/${rejectionId}/reject`, {
                remarks: rejectionReasonText,
                reason: rejectionReasonText
            })
            if (result.success) {
                Alert.alert('Success', `${rejectionType === 'leave' ? 'Leave' : 'WFH'} application rejected`)
                if (rejectionType === 'leave') {
                    setLeaves(prev => prev.filter(l => l.id !== rejectionId))
                } else {
                    setWfh(prev => prev.filter(w => w.id !== rejectionId))
                }
                setRejectionModalVisible(false)
            } else {
                Alert.alert('Error', result.error || 'Failed to reject request')
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to reject request')
        } finally {
            setSubmittingRejection(false)
        }
    }

    /**
     * Nobody approves their own request — the server refuses it outright
     * (lib/authz.canApproveFor), so offering the buttons only produced a 403.
     */
    const isOwn = (employeeId: string) =>
        Boolean(currentUser?.employeeId) && employeeId === currentUser.employeeId

    const renderAttendanceItem = ({ item }: { item: AttendanceRequest }) => (
        <Card style={styles.card}>
            <Card.Content>
                <Text style={styles.userName}>{item.user.name}</Text>
                <Text style={styles.userDept}>{item.user.department}</Text>
                <View style={styles.divider} />
                <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{formatDateIST(item.attendanceDate)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Type:</Text><Text style={styles.value}>{item.requestType}</Text></View>
                {item.originalTime && (
                    <View style={styles.row}><Text style={styles.label}>Original:</Text><Text style={styles.value}>{formatDateTimeIST(item.originalTime)}</Text></View>
                )}
                <View style={styles.row}><Text style={styles.label}>New:</Text><Text style={styles.value}>{formatDateTimeIST(item.newTime)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Reason:</Text><Text style={styles.value}>{item.reason}</Text></View>
                {isOwn(item.userId) ? (
                    <Text style={styles.ownNote}>Your own request — waiting for your manager.</Text>
                ) : (
                <View style={styles.actions}>
                    <Button mode="contained" onPress={() => handleApproveAttendance(item.id)} loading={approvingId === item.id} disabled={!!approvingId || !!rejectingId} style={styles.approveBtn}>Approve</Button>
                    <Button mode="outlined" onPress={() => handleRejectAttendance(item.id)} loading={rejectingId === item.id} disabled={!!approvingId || !!rejectingId} style={styles.rejectBtn} textColor={colors.error}>Reject</Button>
                </View>
                )}
            </Card.Content>
        </Card>
    )

    const renderLeaveItem = ({ item }: { item: LeaveRequest }) => (
        <Card style={styles.card}>
            <Card.Content>
                <Text style={styles.userName}>{item.employeeName}</Text>
                <Text style={styles.userDept}>ID: {item.employeeId}</Text>
                <View style={styles.divider} />
                <View style={styles.row}><Text style={styles.label}>Type:</Text><Text style={styles.value}>{item.leaveType}{item.isHalfDay && ' (Half Day)'}</Text></View>
                <View style={styles.row}><Text style={styles.label}>From:</Text><Text style={styles.value}>{formatDateIST(item.fromDate)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>To:</Text><Text style={styles.value}>{formatDateIST(item.toDate)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Reason:</Text><Text style={styles.value}>{item.reason}</Text></View>
                {isOwn(item.employeeId) ? (
                    <Text style={styles.ownNote}>Your own request — waiting for your manager.</Text>
                ) : (
                <View style={styles.actions}>
                    <Button mode="contained" onPress={() => handleApproveLeave(item.id)} style={styles.approveBtn}>Approve</Button>
                    <Button mode="outlined" onPress={() => openRejectLeave(item.id)} style={styles.rejectBtn} textColor={colors.error}>Reject</Button>
                </View>
                )}
            </Card.Content>
        </Card>
    )

    const renderWfhItem = ({ item }: { item: WfhRequest }) => (
        <Card style={styles.card}>
            <Card.Content>
                <Text style={styles.userName}>{item.employeeName}</Text>
                <Text style={styles.userDept}>ID: {item.employeeId}</Text>
                <View style={styles.divider} />
                <View style={styles.row}><Text style={styles.label}>Type:</Text><Text style={styles.value}>{item.wfhType}</Text></View>
                <View style={styles.row}><Text style={styles.label}>From:</Text><Text style={styles.value}>{formatDateIST(item.fromDate)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>To:</Text><Text style={styles.value}>{formatDateIST(item.toDate)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Location:</Text><Text style={styles.value}>{item.workLocation}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Reason:</Text><Text style={styles.value}>{item.reason}</Text></View>
                {isOwn(item.employeeId) ? (
                    <Text style={styles.ownNote}>Your own request — waiting for your manager.</Text>
                ) : (
                <View style={styles.actions}>
                    <Button mode="contained" onPress={() => handleApproveWFH(item.id)} style={styles.approveBtn}>Approve</Button>
                    <Button mode="outlined" onPress={() => openRejectWFH(item.id)} style={styles.rejectBtn} textColor={colors.error}>Reject</Button>
                </View>
                )}
            </Card.Content>
        </Card>
    )

    const loading = activeTab === 'attendance' ? loadingAttendance : loadingREST
    const currentList = activeTab === 'attendance' ? attendanceRequests : activeTab === 'leaves' ? leaves : wfh

    return (
        <View style={styles.container}>
            {/* Tabs Segmented Buttons */}
            <View style={styles.segmentedContainer}>
                <SegmentedButtons
                    value={activeTab}
                    onValueChange={(val: any) => setActiveTab(val)}
                    buttons={[
                        { value: 'attendance', label: `Attendance (${attendanceRequests.length})`, style: styles.segmentedBtn, labelStyle: styles.segmentedLabel },
                        { value: 'leaves', label: `Leaves (${leaves.length})`, style: styles.segmentedBtn, labelStyle: styles.segmentedLabel },
                        { value: 'wfh', label: `WFH (${wfh.length})`, style: styles.segmentedBtn, labelStyle: styles.segmentedLabel },
                    ]}
                />
            </View>

            {loading && currentList.length === 0 ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={currentList}
                    renderItem={({ item }: { item: any }) => {
                        if (activeTab === 'attendance') {
                            return renderAttendanceItem({ item });
                        } else if (activeTab === 'leaves') {
                            return renderLeaveItem({ item });
                        } else {
                            return renderWfhItem({ item });
                        }
                    }}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={loading} onRefresh={handleRefresh} colors={[colors.primary]} />
                    }
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Text style={styles.emptyText}>
                                {activeTab !== 'attendance' && restError
                                    ? restError
                                    : 'No pending requests'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Rejection Portal Dialog */}
            <Portal>
                <Dialog visible={rejectionModalVisible} onDismiss={() => setRejectionModalVisible(false)} style={styles.dialog}>
                    <Dialog.Title>Reject Application</Dialog.Title>
                    <Dialog.Content>
                        <Text style={{ marginBottom: 10, color: colors.text }}>Please enter the reason for rejection:</Text>
                        <TextInput
                            placeholder="Reason for rejection"
                            value={rejectionReasonText}
                            onChangeText={setRejectionReasonText}
                            mode="outlined"
                            multiline
                            numberOfLines={3}
                            outlineColor={colors.border}
                            activeOutlineColor={colors.primary}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setRejectionModalVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={submitRejection} loading={submittingRejection} disabled={submittingRejection} buttonColor={colors.error} textColor="white">Reject</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    )
}

const getStyles = (colors: any, responsive: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    segmentedContainer: {
        padding: materialSpacing.md,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    segmentedBtn: {
        minWidth: 90,
    },
    segmentedLabel: {
        fontSize: 11,
    },
    listContent: {
        padding: materialSpacing.md,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: materialSpacing.xl,
    },
    card: {
        marginBottom: materialSpacing.md,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    userName: {
        ...materialTypography.titleMedium,
        fontWeight: 'bold',
        color: colors.text,
    },
    userDept: {
        ...materialTypography.bodySmall,
        color: colors.textSecondary,
        marginBottom: materialSpacing.sm,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginBottom: materialSpacing.sm,
    },
    row: {
        flexDirection: 'row',
        marginBottom: materialSpacing.xs,
    },
    label: {
        ...materialTypography.bodyMedium,
        color: colors.textSecondary,
        width: 80,
        fontWeight: '600',
    },
    value: {
        ...materialTypography.bodyMedium,
        color: colors.text,
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: materialSpacing.md,
        gap: materialSpacing.sm,
    },
    ownNote: {
        ...materialTypography.bodySmall,
        color: colors.textSecondary,
        marginTop: materialSpacing.md,
        fontStyle: 'italic',
    },
    approveBtn: {
        backgroundColor: colors.success || materialColors.success,
    },
    rejectBtn: {
        borderColor: colors.error || materialColors.error,
    },
    emptyText: {
        ...materialTypography.bodyLarge,
        color: colors.textSecondary,
    },
    dialog: {
        backgroundColor: colors.surface,
        borderRadius: 8,
    }
})
