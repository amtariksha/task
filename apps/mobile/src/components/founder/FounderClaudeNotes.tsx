import { useCallback, useMemo, useState, type JSX } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemeContextType } from '../../contexts/Providers'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import type { FounderCheckin } from '../../types/founder'

type ThemeColors = ThemeContextType['colors']

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })

export interface FounderClaudeNotesProps {
  note: FounderCheckin | null
}

function formatCheckinTime(createdAt: string): string | null {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function FounderClaudeNotes({ note }: FounderClaudeNotesProps): JSX.Element | null {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const [expanded, setExpanded] = useState(false)
  const toggle = useCallback(() => setExpanded((previous) => !previous), [])

  if (note === null) return null

  const checkinTime = formatCheckinTime(note.createdAt)
  const body = note.note?.trim() ?? ''

  return (
    <View style={styles.section}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Hide Claude's notes" : "Show Claude's notes"}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <MaterialCommunityIcons name="robot-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.title}>Claude's notes</Text>
        {checkinTime ? <Text style={styles.headerTime}>{checkinTime}</Text> : null}
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textTertiary}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          <Text selectable style={styles.noteText}>
            {body.length > 0 ? body : 'No note text.'}
          </Text>
          {checkinTime ? <Text style={styles.caption}>{`Check-in at ${checkinTime}`}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      marginHorizontal: materialSpacing.md,
      marginTop: materialSpacing.md,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: materialSpacing.sm,
      paddingHorizontal: materialSpacing.md,
      minHeight: 48,
    },
    headerPressed: {
      backgroundColor: colors.surfaceVariant,
    },
    title: {
      ...materialTypography.titleSmall,
      color: colors.textSecondary,
      flex: 1,
    },
    headerTime: {
      ...materialTypography.labelSmall,
      color: colors.textTertiary,
    },
    body: {
      paddingHorizontal: materialSpacing.md,
      paddingBottom: materialSpacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    noteText: {
      fontFamily: MONO_FONT,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
      marginTop: materialSpacing.sm,
    },
    caption: {
      ...materialTypography.labelSmall,
      color: colors.textTertiary,
      marginTop: materialSpacing.sm,
    },
  })
