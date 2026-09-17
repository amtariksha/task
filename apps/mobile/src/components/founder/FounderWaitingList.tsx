import { useMemo, type JSX } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemeContextType } from '../../contexts/Providers'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { dueLabel } from '../../utils/founderFormat'
import type { FounderWaitingItem } from '../../types/founder'

type ThemeColors = ThemeContextType['colors']

const KIND_ICON: Readonly<Record<FounderWaitingItem['kind'], 'checkbox-marked-circle-outline' | 'bug-outline'>> =
  Object.freeze({
    task: 'checkbox-marked-circle-outline',
    bug: 'bug-outline',
  })

export interface FounderWaitingListProps {
  items: FounderWaitingItem[]
  todayIst: string
  onOpen: (item: FounderWaitingItem) => void
}

interface WaitingRowProps {
  item: FounderWaitingItem
  todayIst: string
  isLast: boolean
  colors: ThemeColors
  styles: ReturnType<typeof getStyles>
  onOpen: (item: FounderWaitingItem) => void
}

function WaitingRow({ item, todayIst, isLast, colors, styles, onOpen }: WaitingRowProps): JSX.Element {
  const title = item.title.trim()
  const due = dueLabel(item.dueDate, todayIst)
  const isOverdue = item.dueDate !== null && item.dueDate < todayIst
  const kindWord = item.kind === 'bug' ? 'bug' : 'task'

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${kindWord} ${item.id}: ${title}, ${due}`}
      style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <MaterialCommunityIcons
        name={KIND_ICON[item.kind]}
        size={20}
        color={item.kind === 'bug' ? colors.error : colors.primary}
        style={styles.icon}
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {`${item.id} · ${title}`}
        </Text>
        <View style={styles.metaLine}>
          {item.projectName ? (
            <Text style={styles.projectName} numberOfLines={1}>
              {item.projectName}
            </Text>
          ) : null}
          <Text style={[styles.due, isOverdue && styles.dueOverdue]} numberOfLines={1}>
            {due}
          </Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  )
}

export function FounderWaitingList({ items, todayIst, onOpen }: FounderWaitingListProps): JSX.Element | null {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])

  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Waiting on you
      </Text>
      <View style={styles.card}>
        {items.map((item, index) => (
          <WaitingRow
            key={`${item.kind}-${item.id}`}
            item={item}
            todayIst={todayIst}
            isLast={index === items.length - 1}
            colors={colors}
            styles={styles}
            onOpen={onOpen}
          />
        ))}
      </View>
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
    rowPressed: {
      backgroundColor: colors.surfaceVariant,
    },
    icon: {
      marginRight: 12,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      ...materialTypography.bodyMedium,
      color: colors.text,
      fontWeight: '500',
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: materialSpacing.sm,
    },
    projectName: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    due: {
      ...materialTypography.bodySmall,
      color: colors.textTertiary,
      flexShrink: 0,
    },
    dueOverdue: {
      color: colors.error,
      fontWeight: '600',
    },
  })
