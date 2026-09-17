import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Divider, IconButton, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@apollo/client/react'
import { FOUNDER_RESUME_POINTS, FOUNDER_START, UPDATE_FOUNDER_RANKS } from '../../config/founder-queries'
import { useTheme, lightColors } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { moveItem } from '../../utils/founderFormat'
import type { FounderResumePointsQueryData, FounderThread } from '../../types/founder'

type ThemeColors = typeof lightColors
type RankStyles = ReturnType<typeof getStyles>

interface RankLists {
  ranked: FounderThread[]
  unranked: FounderThread[]
}

interface UpdateRanksData { updateFounderRanks: Array<{ id: string; rank: number | null }> }
interface UpdateRanksVariables { orderedIds: string[] }

const SAVE_FALLBACK_ERROR = 'Could not save ranks'

function splitByRank(threads: FounderThread[]): RankLists {
  const ranked = threads
    .filter((thread) => thread.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
  const unranked = threads
    .filter((thread) => thread.rank === null)
    .sort((a, b) => a.label.localeCompare(b.label))
  return { ranked, unranked }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

interface RankRowProps {
  thread: FounderThread
  position?: number
  styles: RankStyles
  children: ReactNode
}

function RankRow({ thread, position, styles, children }: RankRowProps): JSX.Element {
  return (
    <View style={styles.row}>
      {position !== undefined && (
        <View style={styles.positionBadge}>
          <Text style={styles.positionText}>{position}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.label} numberOfLines={2}>{thread.label}</Text>
        <Text style={thread.nextAction ? styles.nextAction : styles.noNextAction} numberOfLines={2}>
          {thread.nextAction ?? 'no next action'}
        </Text>
      </View>
      <View style={styles.rowActions}>{children}</View>
    </View>
  )
}

interface RowButtonProps {
  icon: string
  label: string
  disabled?: boolean
  onPress: () => void
}

function RowButton({ icon, label, disabled = false, onPress }: RowButtonProps): JSX.Element {
  return (
    <IconButton icon={icon} size={20} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} />
  )
}

export function FounderRankScreen(): JSX.Element {
  const navigation = useNavigation<any>()
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // Unknown (null) reachability is not offline.
  const isOffline = isConnected === false || isInternetReachable === false
  const [lists, setLists] = useState<RankLists | null>(null)

  const { data, loading, error, refetch } = useQuery<FounderResumePointsQueryData, { includeParked: boolean }>(
    FOUNDER_RESUME_POINTS,
    { variables: { includeParked: false }, fetchPolicy: 'network-only' },
  )
  const [saveRanks, { loading: saving }] = useMutation<UpdateRanksData, UpdateRanksVariables>(
    UPDATE_FOUNDER_RANKS,
    { refetchQueries: [{ query: FOUNDER_START }] },
  )

  const threads = data?.founderResumePoints
  // Seed once: later refetches must not wipe the order the founder is editing.
  useEffect(() => {
    if (lists !== null || !Array.isArray(threads)) return
    setLists(splitByRank(threads))
  }, [threads, lists])

  const moveRanked = useCallback((index: number, direction: -1 | 1) => {
    setLists((prev) => (prev ? { ...prev, ranked: moveItem(prev.ranked, index, direction) } : prev))
  }, [])

  const transfer = useCallback((threadId: string, toRanked: boolean) => {
    setLists((prev) => {
      if (!prev) return prev
      const thread = (toRanked ? prev.unranked : prev.ranked).find((item) => item.id === threadId)
      if (!thread) return prev
      const ranked = prev.ranked.filter((item) => item.id !== threadId)
      const unranked = prev.unranked.filter((item) => item.id !== threadId)
      // Ranking appends to the end; unranking puts the thread at the top of the unranked list.
      return toRanked
        ? { ranked: [...ranked, thread], unranked }
        : { ranked, unranked: [thread, ...unranked] }
    })
  }, [])

  const handleRetry = useCallback(async () => {
    try {
      await refetch()
    } catch (caught) {
      showToast(errorText(caught, 'Could not load threads'), 'error')
    }
  }, [refetch, showToast])

  const handleSave = useCallback(async () => {
    if (!lists) return
    try {
      const result = await saveRanks({ variables: { orderedIds: lists.ranked.map((thread) => thread.id) } })
      if (result.error) {
        showToast(result.error.message || SAVE_FALLBACK_ERROR, 'error')
        return
      }
      showToast('Ranks saved', 'success')
      navigation.goBack()
    } catch (caught) {
      showToast(errorText(caught, SAVE_FALLBACK_ERROR), 'error')
    }
  }, [lists, saveRanks, showToast, navigation])

  if (!lists) {
    if (error && !loading) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error.message || 'Could not load threads'}</Text>
          <Button mode="outlined" onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry loading threads">
            Retry
          </Button>
        </View>
      )
    }
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const isEmpty = lists.ranked.length === 0 && lists.unranked.length === 0
  const lastRankedIndex = lists.ranked.length - 1

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isEmpty ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No active threads to rank.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {lists.ranked.length === 0 && (
            <Text style={styles.hint}>Nothing ranked yet. Rank a thread from the list below.</Text>
          )}
          {lists.ranked.map((thread, index) => (
            <RankRow key={thread.id} thread={thread} position={index + 1} styles={styles}>
              <RowButton
                icon="arrow-up"
                label={`Move ${thread.label} up from position ${index + 1}`}
                disabled={index === 0}
                onPress={() => moveRanked(index, -1)}
              />
              <RowButton
                icon="arrow-down"
                label={`Move ${thread.label} down from position ${index + 1}`}
                disabled={index === lastRankedIndex}
                onPress={() => moveRanked(index, 1)}
              />
              <RowButton icon="arrow-collapse-down" label={`Unrank ${thread.label}`} onPress={() => transfer(thread.id, false)} />
            </RankRow>
          ))}
          <View style={styles.sectionHeader}>
            <Divider style={styles.divider} />
            <Text style={styles.sectionTitle}>Unranked</Text>
          </View>
          {lists.unranked.length === 0 && <Text style={styles.hint}>Every active thread is ranked.</Text>}
          {lists.unranked.map((thread) => (
            <RankRow key={thread.id} thread={thread} styles={styles}>
              <RowButton icon="arrow-collapse-up" label={`Rank ${thread.label}`} onPress={() => transfer(thread.id, true)} />
            </RankRow>
          ))}
        </ScrollView>
      )}
      <View style={styles.bottomBar}>
        {isOffline && <Text style={styles.offlineText}>You are offline. Connect to save ranks.</Text>}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || isOffline || isEmpty}
          accessibilityRole="button"
          accessibilityLabel="Save ranks"
        >
          Save
        </Button>
      </View>
    </SafeAreaView>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: materialSpacing.lg, gap: materialSpacing.md, backgroundColor: colors.background,
  },
  scrollContent: { padding: materialSpacing.md, paddingBottom: materialSpacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    paddingVertical: materialSpacing.sm, paddingLeft: materialSpacing.md, marginBottom: materialSpacing.sm,
  },
  positionBadge: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primaryLight, marginRight: materialSpacing.sm,
  },
  positionText: { ...materialTypography.labelLarge, color: colors.primary },
  rowBody: { flex: 1, minWidth: 0 },
  label: { ...materialTypography.titleSmall, color: colors.text },
  nextAction: { ...materialTypography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  noNextAction: { ...materialTypography.bodySmall, color: colors.textTertiary, fontStyle: 'italic', marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  sectionHeader: { marginTop: materialSpacing.md, marginBottom: materialSpacing.sm },
  divider: { backgroundColor: colors.border },
  sectionTitle: { ...materialTypography.labelLarge, color: colors.textSecondary, marginTop: materialSpacing.sm },
  hint: { ...materialTypography.bodySmall, color: colors.textTertiary, marginBottom: materialSpacing.sm },
  emptyText: { ...materialTypography.bodyMedium, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...materialTypography.bodyMedium, color: colors.error, textAlign: 'center' },
  bottomBar: {
    padding: materialSpacing.md, gap: materialSpacing.sm, backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  offlineText: { ...materialTypography.bodySmall, color: colors.warning, textAlign: 'center' },
})
