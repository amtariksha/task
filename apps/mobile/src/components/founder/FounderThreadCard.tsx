import { useCallback, useMemo, useState, type JSX } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import { useTheme } from '../../contexts/ThemeContext'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import type { FounderCheckin, FounderTeamActivity, FounderThread } from '../../types/founder'
import { ageLabel, formatShortDay } from '../../utils/founderFormat'

export interface FounderThreadCardProps {
  thread: FounderThread
  variant: 'card' | 'row'
  position?: number
  activity?: FounderTeamActivity
  onDoneNext: (thread: FounderThread) => void
  onNotToday?: (thread: FounderThread) => void
  /** May return a promise; Park stays disabled until it settles. */
  onPark: (thread: FounderThread) => void | Promise<void>
  onOpenAt?: never
}

type ThemeColors = ReturnType<typeof useTheme>['colors']
type Styles = ReturnType<typeof getStyles>

const NO_NEXT_ACTION = 'no next action'
const MAX_ACTIVITY_TITLES = 3
const MAX_CHECKINS = 3

function checkinLine(checkin: FounderCheckin): string {
  const detail = checkin.note || checkin.nextAction
  return [checkin.kind, formatShortDay(checkin.checkinDate), detail, checkin.source]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

interface AgeChipProps {
  label: string
  isStale: boolean
  styles: Styles
}

function AgeChip({ label, isStale, styles }: AgeChipProps): JSX.Element {
  return (
    <View style={[styles.ageChip, isStale ? styles.ageChipStale : styles.ageChipNeutral]}>
      <Text style={[styles.ageText, isStale ? styles.ageTextStale : styles.ageTextNeutral]}>{label}</Text>
    </View>
  )
}

interface ThreadDetailsProps extends Pick<FounderThreadCardProps, 'thread' | 'activity' | 'onDoneNext'> {
  onNotToday?: () => void
  onPark: () => void
  parking: boolean
  styles: Styles
}

function ThreadDetails({ thread, activity, onDoneNext, onNotToday, onPark, parking, styles }: ThreadDetailsProps): JSX.Element {
  const checkins = thread.recentCheckins.slice(0, MAX_CHECKINS)
  return (
    <View style={styles.details}>
      {activity && activity.count > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {`${activity.count} team ${activity.count === 1 ? 'update' : 'updates'} in 24h`}
          </Text>
          {activity.titles.slice(0, MAX_ACTIVITY_TITLES).map((title, index) => (
            <Text key={`${index}-${title}`} style={styles.detailLine} numberOfLines={1}>
              {`• ${title}`}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        {checkins.length === 0 ? (
          <Text style={styles.emptyLine}>No check-ins yet</Text>
        ) : (
          checkins.map((checkin) => (
            <Text key={checkin.id} style={styles.detailLine} numberOfLines={1}>
              {checkinLine(checkin)}
            </Text>
          ))
        )}
      </View>
      <View style={styles.actions}>
        <Button
          mode="contained"
          compact
          onPress={() => onDoneNext(thread)}
          accessibilityRole="button"
          accessibilityLabel={`Done, set next action for ${thread.label}`}
        >
          Done → next
        </Button>
        {onNotToday ? (
          <Button
            mode="outlined"
            compact
            onPress={onNotToday}
            accessibilityRole="button"
            accessibilityLabel={`Not today: move ${thread.label} to the bottom of Top 3`}
          >
            Not today
          </Button>
        ) : null}
        <Button
          mode="text"
          compact
          onPress={onPark}
          disabled={parking}
          loading={parking}
          accessibilityRole="button"
          accessibilityLabel={`Park ${thread.label}`}
          accessibilityState={{ disabled: parking, busy: parking }}
        >
          Park
        </Button>
      </View>
    </View>
  )
}

export function FounderThreadCard(props: FounderThreadCardProps): JSX.Element {
  const { thread, variant, position, activity, onDoneNext, onNotToday, onPark } = props
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const [expanded, setExpanded] = useState(false)
  const [parking, setParking] = useState(false)

  const toggle = useCallback(() => setExpanded((current) => !current), [])
  // Collapse so the card does not land at the bottom of Top 3 still open.
  const handleNotToday = useMemo(() => {
    if (!onNotToday) return undefined
    return () => {
      setExpanded(false)
      onNotToday(thread)
    }
  }, [onNotToday, thread])
  const handlePark = useCallback(async () => {
    setParking(true)
    try {
      await onPark(thread)
    } finally {
      setParking(false)
    }
  }, [onPark, thread])

  const age = ageLabel(thread.daysSinceTouched, thread.isStale)
  const nextAction = thread.nextAction?.trim() || null
  const waitingOnText = thread.waitingOn ? `waiting on ${thread.waitingOn}` : null
  const toggleLabel = `${thread.label}. Next: ${nextAction ?? NO_NEXT_ACTION}. Last touched ${age}.${
    waitingOnText ? ` ${waitingOnText}.` : ''}`
  const details = expanded ? (
    <ThreadDetails
      thread={thread}
      activity={activity}
      onDoneNext={onDoneNext}
      onNotToday={handleNotToday}
      onPark={() => void handlePark()}
      parking={parking}
      styles={styles}
    />
  ) : null

  if (variant === 'row') {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.rowLine, pressed && styles.pressed]}
        >
          <Text style={styles.caret}>{expanded ? '▾' : '▸'}</Text>
          <Text style={styles.rowText} numberOfLines={1}>
            <Text style={styles.rowLabel}>{thread.label}</Text>
            <Text style={styles.separator}>{' · '}</Text>
            <Text style={nextAction ? styles.rowNext : styles.noNext}>{nextAction ?? NO_NEXT_ACTION}</Text>
          </Text>
          <Text style={styles.separator}>{' · '}</Text>
          <AgeChip label={age} isStale={thread.isStale} styles={styles} />
        </Pressable>
        {/* Expanded = same detail as a card: the full next action the collapsed line truncates. */}
        {expanded && nextAction ? <Text style={styles.rowFullNext}>{nextAction}</Text> : null}
        {waitingOnText ? <Text style={styles.rowWaitingOn} numberOfLines={expanded ? undefined : 1}>{waitingOnText}</Text> : null}
        {details}
      </View>
    )
  }

  return (
    <Card mode="elevated" style={styles.card}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={position ? `Top ${position}: ${toggleLabel}` : toggleLabel}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <View style={styles.cardHeader}>
          {position ? <Text style={styles.position}>{position}</Text> : null}
          <Text style={styles.cardLabel} numberOfLines={2}>{thread.label}</Text>
          <AgeChip label={age} isStale={thread.isStale} styles={styles} />
        </View>
        <Text style={nextAction ? styles.cardNext : [styles.cardNext, styles.noNext]}>
          {nextAction ?? NO_NEXT_ACTION}
        </Text>
        {waitingOnText ? <Text style={styles.waitingOn} numberOfLines={1}>{waitingOnText}</Text> : null}
      </Pressable>
      {details ? <View style={styles.cardDetails}>{details}</View> : null}
    </Card>
  )
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.card, marginBottom: materialSpacing.sm, borderRadius: 12 },
  cardBody: { padding: materialSpacing.md, borderRadius: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: materialSpacing.sm },
  position: { ...materialTypography.labelSmall, color: colors.textTertiary, minWidth: 12 },
  cardLabel: { ...materialTypography.titleSmall, flex: 1, fontWeight: '700', color: colors.text },
  cardNext: { ...materialTypography.titleLarge, color: colors.text, marginTop: materialSpacing.sm },
  cardDetails: { paddingHorizontal: materialSpacing.md, paddingBottom: materialSpacing.md },
  waitingOn: { ...materialTypography.bodySmall, color: colors.textSecondary, marginTop: materialSpacing.xs },
  noNext: { color: colors.textTertiary, fontStyle: 'italic' },
  pressed: { opacity: 0.7 },
  ageChip: { paddingHorizontal: materialSpacing.sm, paddingVertical: 2, borderRadius: 10 },
  ageChipNeutral: { backgroundColor: colors.surfaceVariant },
  ageChipStale: { backgroundColor: colors.warningLight },
  ageText: { ...materialTypography.labelSmall },
  ageTextNeutral: { color: colors.textSecondary },
  ageTextStale: { color: colors.warning, fontWeight: '700' },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: materialSpacing.sm + 2 },
  caret: { ...materialTypography.bodyMedium, color: colors.textSecondary, width: 18 },
  rowText: { ...materialTypography.bodyMedium, flex: 1, color: colors.text },
  rowLabel: { fontWeight: '700', color: colors.text },
  rowNext: { color: colors.text },
  separator: { ...materialTypography.bodyMedium, color: colors.textTertiary },
  rowFullNext: { ...materialTypography.bodyMedium, color: colors.text, paddingLeft: 18 },
  rowWaitingOn: {
    ...materialTypography.bodySmall, color: colors.textSecondary, paddingLeft: 18, paddingBottom: materialSpacing.xs,
  },
  details: { paddingTop: materialSpacing.sm, paddingBottom: materialSpacing.sm, gap: materialSpacing.sm },
  section: { gap: 2 },
  sectionTitle: { ...materialTypography.labelMedium, color: colors.info },
  detailLine: { ...materialTypography.bodySmall, color: colors.textSecondary },
  emptyLine: { ...materialTypography.bodySmall, color: colors.textTertiary, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: materialSpacing.sm },
})
