import { useMemo, type JSX } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { useTheme } from '../../contexts/ThemeContext'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import type { BrainDumpReview, BrainDumpRow, ThreadsState } from '../../utils/brainDump'
import { FounderBrainDumpRow, type BrainDumpRowPatch } from './FounderBrainDumpRow'

export interface FounderBrainDumpReviewProps {
  rows: BrainDumpRow[]
  review: BrainDumpReview
  threadsState: ThreadsState
  draftNote: string | null
  editable: boolean
  onRetryThreads: () => void
  onChangeRow: (key: string, patch: BrainDumpRowPatch) => void
  onRemoveRow: (key: string) => void
}

type ThemeColors = ReturnType<typeof useTheme>['colors']
type ReviewStyles = ReturnType<typeof getStyles>

const HINT = 'Check each row, then save. Saved threads can be parked but not deleted, so fix dictation slips here. '
  + 'A row you remove is left out of this save and stays in your draft. '
  + 'New threads have no rank: rank them on ⋮ → Rank threads to fill your Top 3.'

interface ThreadsNoticeProps {
  threadsState: ThreadsState
  styles: ReviewStyles
  onRetry: () => void
}

function ThreadsNotice({ threadsState, styles, onRetry }: ThreadsNoticeProps): JSX.Element | null {
  if (threadsState === 'ready') return null
  if (threadsState === 'loading') {
    return (
      <View style={styles.notice}>
        <ActivityIndicator size="small" accessibilityLabel="Checking your threads" />
        <Text style={styles.noticeText}>Checking which of these are already threads…</Text>
      </View>
    )
  }
  return (
    <View style={styles.notice}>
      <Text style={[styles.noticeText, styles.errorText]}>Couldn’t load your threads to check for matches.</Text>
      <Button mode="outlined" compact onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading threads">
        Retry
      </Button>
    </View>
  )
}

export function FounderBrainDumpReview(props: FounderBrainDumpReviewProps): JSX.Element {
  const { rows, review, threadsState, draftNote, editable, onRetryThreads, onChangeRow, onRemoveRow } = props
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])

  // A ScrollView, not a FlatList: recycling would drop the focused input.
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.hint}>{HINT}</Text>
      {draftNote ? <Text style={styles.draftNote}>{draftNote}</Text> : null}
      <ThreadsNotice threadsState={threadsState} styles={styles} onRetry={onRetryThreads} />
      {rows.length === 0 ? (
        <Text style={styles.empty}>No rows left. Tap Edit text to add your thoughts.</Text>
      ) : null}
      {rows.map((row, index) => (
        <FounderBrainDumpRow key={row.key} position={index + 1} row={row} review={review.rows[index]}
          editable={editable} onChange={onChangeRow} onRemove={onRemoveRow} />
      ))}
    </ScrollView>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { padding: materialSpacing.md, paddingBottom: materialSpacing.xl, gap: materialSpacing.sm },
  hint: { ...materialTypography.bodySmall, color: colors.textSecondary },
  draftNote: { ...materialTypography.bodySmall, color: colors.textTertiary },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: materialSpacing.sm, padding: materialSpacing.sm,
    borderRadius: 8, backgroundColor: colors.surfaceVariant,
  },
  noticeText: { ...materialTypography.bodySmall, color: colors.textSecondary, flex: 1 },
  errorText: { color: colors.error },
  empty: { ...materialTypography.bodyMedium, color: colors.textSecondary, textAlign: 'center', marginTop: materialSpacing.lg },
})
