import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Alert, KeyboardAvoidingView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StackActions, useNavigation, useRoute } from '@react-navigation/native'
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
  draftStatusText, leftOutLines, parseBrainDump, reviewBrainDump, rowsMatchText, saveBlocker, savedToastText,
  thoughtCountText, threadsStateOf,
} from '../../utils/brainDump'
import { logger } from '../../utils/debugLogger'

type ThemeColors = ReturnType<typeof useTheme>['colors']
/** saved: the save succeeded and the screen is closing; nothing can be edited or saved again. */
type SavePhase = 'editing' | 'saving' | 'saved'

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
  const route = useRoute()
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only an explicit false means offline.
  const isOffline = isConnected === false || isInternetReachable === false
  const frame = useWindowTop()
  const { draft, ready, status, update, finishSave } = useBrainDumpDraft()
  const [phase, setPhase] = useState<SavePhase>('editing')
  const phaseRef = useRef<SavePhase>('editing')
  const changePhase = useCallback((next: SavePhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  // Parked threads too: a label that matches one updates that thread, which stays parked.
  // network-only: the persisted cache misses threads made since (Add thread does not refresh this list).
  const { data, error, loading, refetch } = useQuery<FounderResumePointsQueryData, { includeParked: boolean }>(
    FOUNDER_RESUME_POINTS,
    { variables: { includeParked: true }, fetchPolicy: 'network-only' },
  )
  // Document form: refetches every watcher, i.e. Start underneath and an open parked list.
  const [createCloseout] = useMutation<CloseoutMutationData, CloseoutMutationVars>(
    CREATE_FOUNDER_CLOSEOUT,
    { refetchQueries: [FOUNDER_START, FOUNDER_RESUME_POINTS] },
  )

  const threadsState = threadsStateOf({ hasData: Boolean(data?.founderResumePoints), hasError: Boolean(error), loading })
  const threads = threadsState === 'ready' ? data?.founderResumePoints ?? null : null
  const editable = phase === 'editing'
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

  // Under errorPolicy 'all' a failed refetch resolves with `error` rather than throwing.
  const handleRetryThreads = useCallback(async () => {
    try {
      const result = await refetch()
      if (result.error) showToast(result.error.message || 'Could not load threads', 'error')
    } catch (caught: unknown) {
      showToast(errorText(caught, 'Could not load threads'), 'error')
    }
  }, [refetch, showToast])

  useEffect(() => navigation.addListener('beforeRemove', (event: any) => {
    if (phaseRef.current !== 'saving') return
    event.preventDefault()
    Alert.alert('Still saving', 'If you leave now, the save carries on. If it fails, your draft is still here.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', onPress: () => navigation.dispatch(event.data.action) },
    ])
  }), [navigation])

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: phase !== 'saving' })
  }, [navigation, phase])

  // By this screen's key: by the time the save answers, a notification may have opened a screen on
  // top, and a plain goBack would close that one instead.
  const leave = useCallback(() => {
    const state = navigation.getState()
    const index = state.routes.findIndex((item: { key: string }) => item.key === route.key)
    if (index === -1) return
    const action = index > 0 ? StackActions.pop() : StackActions.replace('FounderStart')
    navigation.dispatch({ ...action, source: route.key, target: state.key })
  }, [navigation, route.key])

  // A close-out is all or nothing, so on any failure nothing was saved and the draft still holds everything.
  const saveEntries = useCallback(async (entries: FounderCloseoutEntryInput[]): Promise<FounderThread[] | null> => {
    const fail = (message: string) => {
      showToast(message, 'error')
      changePhase('editing')
      return null
    }
    try {
      const result = await createCloseout({ variables: { entries } })
      const saved = result.data?.createFounderCloseout
      if (result.error || !saved) return fail(result.error?.message || SAVE_FALLBACK_ERROR)
      if (saved.length !== entries.length) {
        logger.warn('Founder', 'Brain dump: the close-out returned a different number of threads', { sent: entries.length, received: saved.length })
      }
      return saved
    } catch (caught: unknown) {
      return fail(errorText(caught, SAVE_FALLBACK_ERROR))
    }
  }, [createCloseout, showToast, changePhase])

  // Rows removed in Review were left out of the save, not thrown away: their lines stay as the draft.
  const handleSave = useCallback(async () => {
    if (phaseRef.current !== 'editing' || blocker || !rows) return
    const keptLines = leftOutLines(draft.text, rows)
    changePhase('saving')
    const saved = await saveEntries(review.entries)
    if (!saved) return
    changePhase('saved')
    await finishSave({ text: keptLines.join('\n'), review: null })
    showToast(savedToastText(saved, keptLines.length), 'success')
    leave()
  }, [blocker, rows, draft.text, review.entries, saveEntries, changePhase, finishSave, showToast, leave])

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
              editable={editable} onRetryThreads={handleRetryThreads} onChangeRow={changeRow} onRemoveRow={removeRow} />
          ) : (
            <FounderBrainDumpWrite text={draft.text} thoughtCount={thoughtCount} draftNote={draftNote}
              editable={editable} onChangeText={changeText} />
          )}
          <View style={styles.bottomBar}>
            {rows ? (
              <>
                {blocker ? <Text style={isOffline ? styles.offlineText : styles.blockerText}>{blocker}</Text> : null}
                <View style={styles.actions}>
                  <Button mode="text" onPress={backToText} disabled={!editable} accessibilityRole="button"
                    accessibilityLabel="Edit the text">
                    Edit text
                  </Button>
                  <Button mode="contained" onPress={handleSave} loading={phase === 'saving'} disabled={!editable || blocker !== null}
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
