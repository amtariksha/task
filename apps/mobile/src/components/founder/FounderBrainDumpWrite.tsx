import { useMemo, type JSX } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useTheme } from '../../contexts/ThemeContext'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { thoughtCountText } from '../../utils/brainDump'

export interface FounderBrainDumpWriteProps {
  text: string
  thoughtCount: number
  draftNote: string | null
  editable: boolean
  onChangeText: (text: string) => void
}

type ThemeColors = ReturnType<typeof useTheme>['colors']

const HINT = 'One thought per line. Put its next action after -> or : (for example, Hiring -> Post job ad). '
  + 'When dictating, say “new line” between thoughts.'
const PLACEHOLDER = 'Hiring -> Post job ad\nInvestor deck: Update traction slide\nGST filing'

export function FounderBrainDumpWrite(props: FounderBrainDumpWriteProps): JSX.Element {
  const { text, thoughtCount, draftNote, editable, onChangeText } = props
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])

  // A plain TextInput, not inside a ScrollView: it scrolls itself, and nested scrolling fights on Android.
  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{HINT}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={onChangeText}
        editable={editable}
        multiline
        autoFocus={text === ''}
        textAlignVertical="top"
        autoCapitalize="sentences"
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.primary}
        accessibilityLabel="Brain dump text"
        accessibilityHint="One thought per line"
      />
      <View style={styles.statusRow}>
        <Text style={styles.count} accessibilityLiveRegion="polite">{thoughtCountText(thoughtCount)}</Text>
        {draftNote ? <Text style={styles.draftNote} numberOfLines={2}>{draftNote}</Text> : null}
      </View>
    </View>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, padding: materialSpacing.md, gap: materialSpacing.sm },
  hint: { ...materialTypography.bodySmall, color: colors.textSecondary },
  input: {
    ...materialTypography.bodyLarge, flex: 1, color: colors.text, backgroundColor: colors.card,
    borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    paddingHorizontal: materialSpacing.md, paddingTop: materialSpacing.sm + 4, paddingBottom: materialSpacing.sm + 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: materialSpacing.sm },
  count: { ...materialTypography.labelLarge, color: colors.textSecondary },
  draftNote: { ...materialTypography.bodySmall, color: colors.textTertiary, flexShrink: 1, textAlign: 'right' },
})
