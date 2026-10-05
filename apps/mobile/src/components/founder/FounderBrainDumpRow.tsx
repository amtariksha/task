import { useMemo, type JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, Text, TextInput } from 'react-native-paper'
import { useTheme } from '../../contexts/ThemeContext'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import type { BrainDumpRow, FlagTone, RowFlag, RowReview } from '../../utils/brainDump'

export type BrainDumpRowPatch = Partial<Pick<BrainDumpRow, 'label' | 'nextAction'>>

export interface FounderBrainDumpRowProps {
  position: number
  row: BrainDumpRow
  review: RowReview
  editable: boolean
  onChange: (key: string, patch: BrainDumpRowPatch) => void
  onRemove: (key: string) => void
}

type ThemeColors = ReturnType<typeof useTheme>['colors']
type RowStyles = ReturnType<typeof getStyles>

function toneColors(colors: ThemeColors, tone: FlagTone): { background: string; text: string } {
  if (tone === 'error') return { background: colors.errorLight, text: colors.error }
  if (tone === 'warning') return { background: colors.warningLight, text: colors.warning }
  if (tone === 'info') return { background: colors.infoLight, text: colors.info }
  return { background: colors.surfaceVariant, text: colors.textSecondary }
}

interface FlagPillProps {
  flag: RowFlag
  styles: RowStyles
  colors: ThemeColors
}

function FlagPill({ flag, styles, colors }: FlagPillProps): JSX.Element {
  const tone = toneColors(colors, flag.tone)
  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <Text style={[styles.pillText, { color: tone.text }]}>{flag.text}</Text>
    </View>
  )
}

export function FounderBrainDumpRow({ position, row, review, editable, onChange, onRemove }: FounderBrainDumpRowProps): JSX.Element {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const name = row.label.trim() || `row ${position}`

  return (
    <View style={[styles.card, review.hasError ? styles.cardError : null]}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{position}</Text>
        </View>
        <View style={styles.flags} accessibilityLiveRegion="polite">
          {review.flags.map((flag) => <FlagPill key={flag.text} flag={flag} styles={styles} colors={colors} />)}
        </View>
        <IconButton icon="close" size={20} style={styles.remove} disabled={!editable} onPress={() => onRemove(row.key)}
          accessibilityRole="button" accessibilityLabel={`Remove ${name}`} />
      </View>
      <TextInput mode="outlined" dense label="Label" value={row.label} editable={editable}
        onChangeText={(label) => onChange(row.key, { label })} style={styles.input}
        accessibilityLabel={`Label for row ${position}`} />
      <TextInput mode="outlined" dense multiline label="Next action" placeholder="One physical step" value={row.nextAction}
        editable={editable} onChangeText={(nextAction) => onChange(row.key, { nextAction })} style={styles.input}
        accessibilityLabel={`Next action for ${name}`} />
      {review.detail ? <Text style={styles.detail} numberOfLines={3}>{review.detail}</Text> : null}
    </View>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12,
    padding: materialSpacing.sm + 4, gap: materialSpacing.xs,
  },
  cardError: { borderColor: colors.error, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: materialSpacing.sm },
  badge: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primaryLight, marginTop: 2,
  },
  badgeText: { ...materialTypography.labelMedium, color: colors.primary },
  flags: { flex: 1, minWidth: 0, gap: materialSpacing.xs, alignItems: 'flex-start', paddingTop: 2 },
  pill: { paddingHorizontal: materialSpacing.sm, paddingVertical: 2, borderRadius: 10, maxWidth: '100%' },
  pillText: { ...materialTypography.labelSmall },
  remove: { margin: 0, marginTop: -6, marginRight: -6 },
  input: { backgroundColor: colors.card },
  detail: { ...materialTypography.bodySmall, color: colors.textSecondary, marginTop: materialSpacing.xs },
})
