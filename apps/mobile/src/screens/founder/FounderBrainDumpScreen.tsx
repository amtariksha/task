import { useCallback, useMemo, useRef, useState, type JSX } from 'react'
import { Alert, KeyboardAvoidingView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@apollo/client/react'
import { FounderBrainDumpReview } from '../../components/founder/FounderBrainDumpReview'
import type { BrainDumpRowPatch } from '../../components/founder/FounderBrainDumpRow'
import { FounderBrainDumpWrite } from '../../components/founder/FounderBrainDumpWrite'
import { useBrainDumpDraft } from '../../components/founder/useBrainDumpDraft'
import { CREATE_FOUNDER_CLOSEOUT, FOUNDER_RESUME_POINTS, FOUNDER_START } from '../../config/founder-queries'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { useTheme } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { FounderCloseoutEntryInput, FounderResumePointsQueryData, FounderThread } from '../../types/founder'
import {
  draftStatusText, parseBrainDump, reviewBrainDump, rowsMatchText, saveBlocker, savedToastText, thoughtCountText,
  type ThreadsState,
} from '../../utils/brainDump'
import { logger } from '../../utils/debugLogger'

type ThemeColors = ReturnType<typeof useTheme>['colors']

interface CloseoutMutationData { createFounderCloseout: FounderThread[] }
interface CloseoutMutationVars { entries: FounderCloseoutEntryInput[] }

const SAVE_FALLBACK_ERROR = 'Could not save the brain dump'

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * KeyboardAvoidingView compares its parent-relative frame with the keyboard's window Y, so under
 * the native header it needs the frame's own window Y as its offset. Measured rather than taken
 * from the header height, which would also need the status bar on edge-to-edge Android.
 */
function useWindowTop() {
  const ref = useRef<View>(null)
  const [top, setTop] = useState(0)
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setTop(y))
  }, [])
  return { ref, top, onLayout }
}

export function FounderBrainDumpScreen(): JSX.Element {
  const navigation = useNavigation<any>()
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only an explicit false means offline.
  const isOffline = isConnected === false || isInternetReachable === false
  const frame = useWindowTop()
  const { draft, ready, status, update, clear } = useBrainDumpDraft()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // Parked threads too: a label that matches one updates that thread, which stays parked.
  const { data, previousData, error, refetch } = useQuery<FounderResumePointsQueryData, { includeParked: boolean }>(
    FOUNDER_RESUME_POINTS,
    { variables: { includeParked: true }, fetchPolicy: 'cache-and-network' },
  )
  // Document form: refetches every watcher, i.e. Start underneath and an open parked list.
  const [createCloseout] = useMutation<CloseoutMutationData, CloseoutMutationVars>(
    CREATE_FOUNDER_CLOSEOUT,
    { refetchQueries: [FOUNDER_START, FOUNDER_RESUME_POINTS] },
  )

  const threads = (data ?? previousData)?.founderResumePoints ?? null
  const threadsState: ThreadsState = threads ? 'ready' : error ? 'failed' : 'loading'
  const rows = draft.review
  const thoughtCount = useMemo(() => parseBrainDump(draft.text).length, [draft.text])
  const review = useMemo(() => reviewBrainDump(rows ?? [], threads), [rows, threads])
  const blocker = rows ? saveBlocker({ isOffline, threads: threadsState, rowCount: rows.length, review }) : null
  const draftNote = draftStatusText(status, draft.text.trim() !== '')

  const changeText = useCallback((text: string) => update(() => ({ text, review: null })), [update])
  const startReview = useCallback(() => update((current) => ({ ...current, review: parseBrainDump(current.text) })), [update])
  const changeRow = useCallback((key: string, patch: BrainDumpRowPatch) => update((current) => ({
    ...current,
    review: (current.review ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)),
  })), [update])
  const removeRow = useCallback((key: string) => update((current) => ({
    ...current,
    review: (current.review ?? []).filter((row) => row.key !== key),
  })), [update])

  const backToText = useCallback(() => {
    const discardReview = () => update((current) => ({ ...current, review: null }))
    if (!rows || rowsMatchText(rows, draft.text)) {
      discardReview()
      return
    }
    // Rows do not turn back into text reliably (a label can contain ': '), so their edits are dropped.
    Alert.alert('Undo your changes to the rows?', 'Going back to the text undoes the edits and removals made here. The text is kept.', [
      { text: 'Keep reviewing', style: 'cancel' },
      { text: 'Undo changes', style: 'destructive', onPress: discardReview },
    ])
  }, [rows, draft.text, update])

  const handleRetryThreads = useCallback(async () => {
    try {
      await refetch()
    } catch (caught: unknown) {
      showToast(errorText(caught, 'Could not load threads'), 'error')
    }
  }, [refetch, showToast])

  const leave = useCallback(() => {
    // Back pressed while saving: this screen is gone, and goBack would pop whatever is showing now.
    if (!navigation.isFocused()) return
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('FounderStart')
  }, [navigation])

  // The draft is cleared only after the server answered without an error. A close-out is all or
  // nothing, so on any failure nothing was saved and the draft still holds everything.
  const handleSave = useCallback(async () => {
    if (savingRef.current || blocker || !rows) return
    const entries = review.entries
    const fail = (message: string) => {
      showToast(message, 'error')
      savingRef.current = false
      setSaving(false)
    }
    savingRef.current = true
    setSaving(true)
    try {
      const result = await createCloseout({ variables: { entries } })
      const saved = result.data?.createFounderCloseout
      if (result.error || !saved) {
        fail(result.error?.message || SAVE_FALLBACK_ERROR)
        return
      }
      if (saved.length !== entries.length) {
        logger.warn('Founder', 'Brain dump: the close-out returned a different number of threads', { sent: entries.length, received: saved.length })
      }
      await clear()
      showToast(savedToastText(saved), 'success')
      leave()
    } catch (caught: unknown) {
      fail(errorText(caught, SAVE_FALLBACK_ERROR))
    }
  }, [blocker, rows, review.entries, createCloseout, clear, showToast, leave])

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading your draft" />
      </View>
    )
  }

  const entryCount = review.entries.length
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View ref={frame.ref} style={styles.flex} onLayout={frame.onLayout}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={frame.top} style={styles.flex}>
          {rows ? (
            <FounderBrainDumpReview rows={rows} review={review} threadsState={threadsState} draftNote={draftNote}
              editable={!saving} onRetryThreads={handleRetryThreads} onChangeRow={changeRow} onRemoveRow={removeRow} />
          ) : (
            <FounderBrainDumpWrite text={draft.text} thoughtCount={thoughtCount} draftNote={draftNote}
              editable={!saving} onChangeText={changeText} />
          )}
          <View style={styles.bottomBar}>
            {rows ? (
              <>
                {blocker ? <Text style={isOffline ? styles.offlineText : styles.blockerText}>{blocker}</Text> : null}
                <View style={styles.actions}>
                  <Button mode="text" onPress={backToText} disabled={saving} accessibilityRole="button"
                    accessibilityLabel="Edit the text">
                    Edit text
                  </Button>
                  <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving || blocker !== null}
                    accessibilityRole="button" accessibilityLabel={`Save ${entryCount} ${entryCount === 1 ? 'thread' : 'threads'}`}>
                    {entryCount > 0 ? `Save (${entryCount})` : 'Save'}
                  </Button>
                </View>
              </>
            ) : (
              <Button mode="contained" onPress={startReview} disabled={thoughtCount === 0} accessibilityRole="button"
                accessibilityLabel={`Review ${thoughtCountText(thoughtCount)}`}>
                {thoughtCount > 0 ? `Review (${thoughtCount})` : 'Review'}
              </Button>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  bottomBar: {
    padding: materialSpacing.md, gap: materialSpacing.sm, backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: materialSpacing.sm },
  blockerText: { ...materialTypography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  offlineText: { ...materialTypography.bodySmall, color: colors.warning, textAlign: 'center' },
})
