import { useMemo, useState, type JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { useMutation, useQuery } from '@apollo/client/react'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemeContextType } from '../../contexts/Providers'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { FOUNDER_RESUME_POINTS, UPDATE_FOUNDER_RESUME_POINT } from '../../config/founder-queries'
import type { FounderResumePointsQueryData, FounderThread } from '../../types/founder'

type ThemeColors = ThemeContextType['colors']
type Styles = ReturnType<typeof getStyles>

const FALLBACK_ERROR = 'Could not unpark the thread.'

interface ResumePointsVariables {
  includeParked: boolean
}

interface UpdateResumePointData {
  updateFounderResumePoint: FounderThread
}

interface UpdateResumePointVariables {
  id: string
  isActive: boolean
}

export interface FounderParkedListProps {
  onChanged: () => void
}

interface ParkedRowProps {
  thread: FounderThread
  isLast: boolean
  isUnparking: boolean
  disabled: boolean
  styles: Styles
  onUnpark: (thread: FounderThread) => void
}

function ParkedRow({ thread, isLast, isUnparking, disabled, styles, onUnpark }: ParkedRowProps): JSX.Element {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.rowBody}>
        <Text style={styles.label} numberOfLines={1}>
          {thread.label}
        </Text>
        <Text style={styles.nextAction} numberOfLines={2}>
          {thread.nextAction ?? 'no next action'}
        </Text>
      </View>
      <Button
        mode="outlined"
        compact
        onPress={() => onUnpark(thread)}
        loading={isUnparking}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Unpark ${thread.label}`}
      >
        Unpark
      </Button>
    </View>
  )
}

export function FounderParkedList({ onChanged }: FounderParkedListProps): JSX.Element {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only treat an explicit false as offline.
  const isOffline = isConnected === false || isInternetReachable === false

  const [unparkingId, setUnparkingId] = useState<string | null>(null)
  const { data, loading, error, refetch } = useQuery<FounderResumePointsQueryData, ResumePointsVariables>(
    FOUNDER_RESUME_POINTS,
    { variables: { includeParked: true }, fetchPolicy: 'cache-and-network' },
  )
  const [updateResumePoint] = useMutation<UpdateResumePointData, UpdateResumePointVariables>(
    UPDATE_FOUNDER_RESUME_POINT,
  )

  const parked = useMemo(
    () => (data?.founderResumePoints ?? []).filter((thread) => thread.isActive === false),
    [data],
  )

  const refetchParked = async (): Promise<void> => {
    try {
      await refetch()
    } catch (refetchError: unknown) {
      console.warn('Failed to refresh parked threads', refetchError)
    }
  }

  const handleUnpark = async (thread: FounderThread): Promise<void> => {
    if (unparkingId !== null) return
    setUnparkingId(thread.id)
    try {
      const result = await updateResumePoint({ variables: { id: thread.id, isActive: true } })
      if (result.error || !result.data?.updateFounderResumePoint) {
        showToast(result.error?.message ?? FALLBACK_ERROR, 'error')
        return
      }
      showToast('Thread unparked', 'success')
      await refetchParked()
      onChanged()
    } catch (unparkError: unknown) {
      showToast(unparkError instanceof Error ? unparkError.message : FALLBACK_ERROR, 'error')
    } finally {
      setUnparkingId(null)
    }
  }

  const renderBody = (): JSX.Element => {
    if (loading && !data) {
      return (
        <View style={styles.placeholder}>
          <ActivityIndicator accessibilityLabel="Loading parked threads" />
        </View>
      )
    }
    if (error && !data) {
      return <Text style={[styles.placeholderText, styles.errorText]}>{error.message}</Text>
    }
    if (parked.length === 0) {
      return <Text style={styles.placeholderText}>No parked threads</Text>
    }
    return (
      <View style={styles.card}>
        {parked.map((thread, index) => (
          <ParkedRow
            key={thread.id}
            thread={thread}
            isLast={index === parked.length - 1}
            isUnparking={unparkingId === thread.id}
            disabled={unparkingId !== null || isOffline}
            styles={styles}
            onUnpark={(target) => void handleUnpark(target)}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Parked threads
      </Text>
      {error && data ? <Text style={[styles.inlineError, styles.errorText]}>{error.message}</Text> : null}
      {renderBody()}
    </View>
  )
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      paddingHorizontal: materialSpacing.md,
      paddingTop: materialSpacing.md,
    },
    sectionTitle: {
      ...materialTypography.titleSmall,
      color: colors.textSecondary,
      marginBottom: materialSpacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: materialSpacing.md,
      paddingVertical: 12,
      minHeight: 56,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      marginRight: materialSpacing.sm,
    },
    label: {
      ...materialTypography.bodyLarge,
      color: colors.text,
    },
    nextAction: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: 2,
    },
    placeholder: {
      paddingVertical: materialSpacing.md,
      alignItems: 'center',
    },
    placeholderText: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      paddingVertical: materialSpacing.sm,
    },
    inlineError: {
      ...materialTypography.bodySmall,
      marginBottom: materialSpacing.sm,
    },
    errorText: {
      color: colors.error,
    },
  })
