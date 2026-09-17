import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import type { TextInput as NativeTextInput } from 'react-native'
import { Button, Text, TextInput } from 'react-native-paper'
import { useTheme } from '../../contexts/ThemeContext'
import type { FounderCloseoutEntryInput, FounderThread } from '../../types/founder'

export const CLOSEOUT_FOCUS_DELAY_MS = 150

/** One close-out chip: an existing thread, or a pending new thread (thread === null). */
export interface CloseoutChipItem { key: string; label: string; thread: FounderThread | null }
export interface CloseoutEntryDraft { nextAction: string; note: string; waitingOn: string; showDetails: boolean }
type ThemeColors = ReturnType<typeof useTheme>['colors']

export function emptyCloseoutDraft(thread: FounderThread | null): CloseoutEntryDraft {
  return { nextAction: '', note: '', waitingOn: thread?.waitingOn ?? '', showDetails: false }
}

export function chipDisplayLabel(item: CloseoutChipItem): string {
  return item.thread ? item.label : `${item.label} (new)`
}

/** waitingOn is sent only when changed, so an untouched field never overwrites what the server has. */
export function buildCloseoutEntry(item: CloseoutChipItem, draft: CloseoutEntryDraft): FounderCloseoutEntryInput {
  const nextAction = draft.nextAction.trim()
  const note = draft.note.trim()
  const waitingOn = draft.waitingOn.trim()
  const originalWaitingOn = (item.thread?.waitingOn ?? '').trim()
  return {
    ...(item.thread ? { resumePointId: item.thread.id } : { label: item.label }),
    ...(nextAction ? { nextAction } : {}),
    ...(note ? { note } : {}),
    ...(waitingOn !== originalWaitingOn ? { waitingOn: waitingOn || null } : {}),
  }
}

export interface FounderCloseoutEntryProps {
  item: CloseoutChipItem
  draft: CloseoutEntryDraft
  /** Changes each time this entry should take focus; null = leave focus alone. */
  focusNonce: number | null
  onChange: (item: CloseoutChipItem, patch: Partial<CloseoutEntryDraft>) => void
}

export function FounderCloseoutEntry({ item, draft, focusNonce, onChange }: FounderCloseoutEntryProps): JSX.Element {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const inputRef = useRef<NativeTextInput>(null)

  // Delayed so focus lands after the chip tap / sheet animation instead of being dropped.
  useEffect(() => {
    if (focusNonce === null) return
    const handle = setTimeout(() => inputRef.current?.focus(), CLOSEOUT_FOCUS_DELAY_MS)
    return () => clearTimeout(handle)
  }, [focusNonce])

  return (
    <View style={styles.entry}>
      <Text style={styles.label} numberOfLines={2}>{chipDisplayLabel(item)}</Text>
      <TextInput
        ref={inputRef}
        mode="outlined"
        multiline
        dense
        label="Next action"
        placeholder={item.thread?.nextAction || 'One physical step'}
        value={draft.nextAction}
        onChangeText={(text) => onChange(item, { nextAction: text })}
        style={styles.input}
        accessibilityLabel={`Next action for ${item.label}`}
      />
      {draft.showDetails ? (
        <>
          <TextInput
            mode="outlined"
            multiline
            dense
            label="What happened"
            value={draft.note}
            onChangeText={(text) => onChange(item, { note: text })}
            style={styles.input}
            accessibilityLabel={`What happened on ${item.label}`}
          />
          <TextInput
            mode="outlined"
            dense
            label="Waiting on"
            value={draft.waitingOn}
            onChangeText={(text) => onChange(item, { waitingOn: text })}
            style={styles.input}
            accessibilityLabel={`Waiting on for ${item.label}`}
          />
        </>
      ) : (
        <Button
          mode="text"
          compact
          onPress={() => onChange(item, { showDetails: true })}
          style={styles.detailsButton}
          accessibilityRole="button"
          accessibilityLabel={`Add details for ${item.label}`}
        >
          + details
        </Button>
      )}
    </View>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  entry: { marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: { backgroundColor: colors.card, marginTop: 8 },
  detailsButton: { alignSelf: 'flex-start', marginTop: 4 },
})
