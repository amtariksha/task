import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import type { TextInput as NativeTextInput } from 'react-native'
import { Button, Chip, Text, TextInput } from 'react-native-paper'
import { useMutation } from '@apollo/client/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { CREATE_FOUNDER_CLOSEOUT } from '../../config/founder-queries'
import { orderForChips } from '../../utils/founderFormat'
import type { FounderCloseoutEntryInput, FounderThread } from '../../types/founder'
import {
  CLOSEOUT_FOCUS_DELAY_MS, FounderCloseoutEntry, buildCloseoutEntry, chipDisplayLabel, emptyCloseoutDraft,
} from './FounderCloseoutEntry'
import type { CloseoutChipItem, CloseoutEntryDraft } from './FounderCloseoutEntry'
import { FounderSheetFrame } from './FounderSheetFrame'
import { useEntryAutoScroll } from './useEntryAutoScroll'

export interface FounderCloseoutSheetProps {
  visible: boolean
  threads: FounderThread[]
  preselectedId?: string | null
  onDismiss: () => void
  onSaved: (savedCount: number) => void
}

const MAX_LABEL_LENGTH = 120
const NEW_LABEL_FOCUS_KEY = '__new_label__'
// Focus delay plus the keyboard animation, so the entry is measured against the shortened sheet.
const AUTO_SCROLL_DELAY_MS = CLOSEOUT_FOCUS_DELAY_MS + 300

interface FocusRequest { key: string; nonce: number }
interface CloseoutMutationData { createFounderCloseout: FounderThread[] }
interface CloseoutMutationVars { entries: FounderCloseoutEntryInput[] }
type ThemeColors = ReturnType<typeof useTheme>['colors']

const pendingKey = (label: string): string => `new:${label.toLowerCase()}`

export function FounderCloseoutSheet({ visible, threads, preselectedId, onDismiss, onSaved }: FounderCloseoutSheetProps): JSX.Element {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only an explicit false means offline.
  const isOffline = isConnected === false || isInternetReachable === false
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => getStyles(colors), [colors])
  const [createCloseout, { loading: saving }] = useMutation<CloseoutMutationData, CloseoutMutationVars>(CREATE_FOUNDER_CLOSEOUT)

  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [pendingLabels, setPendingLabels] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, CloseoutEntryDraft>>({})
  const [newLabel, setNewLabel] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const focusCounter = useRef(0)
  const newLabelRef = useRef<NativeTextInput>(null)

  const requestFocus = useCallback((key: string) => {
    focusCounter.current += 1
    setFocusRequest({ key, nonce: focusCounter.current })
  }, [])

  // Layout effect so the previous session's selection is never painted on reopen.
  // `threads` is left out on purpose: a background refetch must not wipe what was typed.
  useLayoutEffect(() => {
    if (!visible) return
    const preselected = preselectedId ? threads.find((thread) => thread.id === preselectedId) : undefined
    setSelectedKeys(preselected ? [preselected.id] : [])
    setPendingLabels([])
    setDrafts({})
    setNewLabel('')
    setShowNewInput(false)
    if (preselected) requestFocus(preselected.id)
    else setFocusRequest(null)
  }, [visible, preselectedId])

  const entryFocusKey = focusRequest && focusRequest.key !== NEW_LABEL_FOCUS_KEY ? focusRequest.key : null
  const autoScroll = useEntryAutoScroll(entryFocusKey, focusRequest?.nonce ?? null, AUTO_SCROLL_DELAY_MS)

  useEffect(() => {
    if (focusRequest?.key !== NEW_LABEL_FOCUS_KEY) return
    const handle = setTimeout(() => newLabelRef.current?.focus(), CLOSEOUT_FOCUS_DELAY_MS)
    return () => clearTimeout(handle)
  }, [focusRequest])

  const chipItems = useMemo<CloseoutChipItem[]>(() => [
    ...orderForChips(threads).map((thread) => ({ key: thread.id, label: thread.label, thread })),
    ...pendingLabels.map((label) => ({ key: pendingKey(label), label, thread: null })),
  ], [threads, pendingLabels])

  const selectedItems = useMemo(
    () => chipItems.filter((item) => selectedKeys.includes(item.key)),
    [chipItems, selectedKeys],
  )

  const selectKey = useCallback((key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
    requestFocus(key)
  }, [requestFocus])

  const toggleKey = (key: string): void => {
    if (selectedKeys.includes(key)) {
      setSelectedKeys((prev) => prev.filter((selected) => selected !== key))
      return
    }
    selectKey(key)
  }

  const updateDraft = useCallback((item: CloseoutChipItem, patch: Partial<CloseoutEntryDraft>) => {
    setDrafts((prev) => ({ ...prev, [item.key]: { ...(prev[item.key] ?? emptyCloseoutDraft(item.thread)), ...patch } }))
  }, [])

  const openNewInput = (): void => {
    setShowNewInput(true)
    requestFocus(NEW_LABEL_FOCUS_KEY)
  }

  const handleAddNew = (): void => {
    const label = newLabel.trim().slice(0, MAX_LABEL_LENGTH)
    if (!label) return
    const lower = label.toLowerCase()
    const existing = threads.find((thread) => thread.label.trim().toLowerCase() === lower)
    const alreadyPending = pendingLabels.some((pending) => pending.toLowerCase() === lower)
    if (!existing && !alreadyPending) setPendingLabels((prev) => [...prev, label])
    selectKey(existing ? existing.id : pendingKey(label))
    setNewLabel('')
    setShowNewInput(false)
  }

  const canSave = selectedItems.length > 0 && !saving && !isOffline
  // Typed input is only thrown away by an explicit Cancel, never by a stray tap above the sheet or Android back.
  const hasUnsavedInput = pendingLabels.length > 0 || newLabel.trim() !== '' || Object.keys(drafts).length > 0
  const dismissable = !saving && !hasUnsavedInput

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    const entries = selectedItems.map((item) => buildCloseoutEntry(item, drafts[item.key] ?? emptyCloseoutDraft(item.thread)))
    try {
      const result = await createCloseout({ variables: { entries } })
      if (result.error) {
        showToast(result.error.message, 'error')
        return
      }
      showToast('Close-out saved', 'success')
      onSaved(entries.length)
      onDismiss()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save close-out', 'error')
    }
  }

  return (
    <FounderSheetFrame visible={visible} dismissable={dismissable} onDismiss={onDismiss} dismissLabel="Close close-out">
      <View style={styles.header}>
        <Text style={styles.title}>Close out</Text>
        <Text style={styles.subtitle}>Tap what you touched, then set each next step.</Text>
      </View>
      <ScrollView
        ref={autoScroll.scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        onLayout={autoScroll.onViewportLayout}
        onScroll={autoScroll.onScroll}
        scrollEventThrottle={32}
      >
        <View style={styles.chips}>
          {chipItems.map((item) => {
            const selected = selectedKeys.includes(item.key)
            return (
              <Chip
                key={item.key}
                selected={selected}
                onPress={() => toggleKey(item.key)}
                style={selected ? styles.chipSelected : styles.chip}
                textStyle={selected ? styles.chipTextSelected : styles.chipText}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${chipDisplayLabel(item)}`}
              >
                {chipDisplayLabel(item)}
              </Chip>
            )
          })}
          <Chip onPress={openNewInput} style={styles.chip} textStyle={styles.chipText} accessibilityRole="button" accessibilityLabel="Add a new thread">
            + new
          </Chip>
        </View>
        {showNewInput ? (
          <View style={styles.newRow}>
            <TextInput
              ref={newLabelRef} mode="outlined" dense label="New thread" value={newLabel}
              onChangeText={setNewLabel} onSubmitEditing={handleAddNew} maxLength={MAX_LABEL_LENGTH}
              returnKeyType="done" style={styles.newInput} accessibilityLabel="New thread label"
            />
            <Button mode="contained-tonal" onPress={handleAddNew} disabled={!newLabel.trim()} accessibilityRole="button" accessibilityLabel="Add new thread">
              Add
            </Button>
          </View>
        ) : null}
        {selectedItems.map((item) => (
          <View key={item.key} onLayout={autoScroll.entryLayoutHandler(item.key)}>
            <FounderCloseoutEntry
              item={item}
              draft={drafts[item.key] ?? emptyCloseoutDraft(item.thread)}
              focusNonce={focusRequest?.key === item.key ? focusRequest.nonce : null}
              onChange={updateDraft}
            />
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isOffline ? <Text style={styles.offline}>Offline — close-out needs a connection</Text> : null}
        <View style={styles.actions}>
          <Button mode="text" onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cancel close-out">
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={`Save close-out for ${selectedItems.length} threads`}
          >
            {selectedItems.length > 0 ? `Save (${selectedItems.length})` : 'Save'}
          </Button>
        </View>
      </View>
    </FounderSheetFrame>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  chip: { backgroundColor: colors.surfaceVariant },
  chipSelected: { backgroundColor: colors.primaryLight },
  chipText: { color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  newInput: { flex: 1, backgroundColor: colors.card },
  footer: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  offline: { fontSize: 13, color: colors.warning, marginBottom: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
})
