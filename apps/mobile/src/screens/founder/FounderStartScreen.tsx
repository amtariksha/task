import { useCallback, useMemo, useState, type JSX } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, FAB, IconButton, Menu, Text } from 'react-native-paper'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import AppHeader from '../../components/AppHeader'
import { FounderAddThreadDialog } from '../../components/founder/FounderAddThreadDialog'
import { FounderClaudeNotes } from '../../components/founder/FounderClaudeNotes'
import { FounderCloseoutSheet } from '../../components/founder/FounderCloseoutSheet'
import { FounderParkedList } from '../../components/founder/FounderParkedList'
import { FounderPauseDialog } from '../../components/founder/FounderPauseDialog'
import { FounderThreadCard } from '../../components/founder/FounderThreadCard'
import { FounderWaitingList } from '../../components/founder/FounderWaitingList'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { useTheme } from '../../contexts/ThemeContext'
import { useFounderStart } from '../../hooks/useFounderStart'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { FounderTeamActivity, FounderThread, FounderWaitingItem } from '../../types/founder'
import {
  closeoutFlagText, formatDayLabel, isPauseActive, istDateString, pausedText, startHeader,
} from '../../utils/founderFormat'

type ThemeColors = ReturnType<typeof useTheme>['colors']
type Styles = ReturnType<typeof getStyles>
type OpenDialog = 'pause' | 'add' | null

interface CloseoutState { visible: boolean; preselectedId: string | null }

const FAB_CLEARANCE = 96

/** oldDate is set when the Start on screen is from an earlier IST day than today. */
function staleBannerText(isOffline: boolean, oldDate: string | null): string {
  const shown = oldDate ? `the Start for ${formatDayLabel(oldDate)}` : 'the last loaded Start'
  if (isOffline) return `Offline — showing ${shown}.`
  return oldDate ? `Showing ${shown} — today’s hasn’t loaded yet.` : `Couldn’t refresh — showing ${shown}.`
}

interface StartHeaderActionsProps {
  showParked: boolean
  onHome: () => void
  onRank: () => void
  onToggleParked: () => void
  onPause: () => void
  onAddThread: () => void
}

function StartHeaderActions(props: StartHeaderActionsProps): JSX.Element {
  const { showParked, onHome, onRank, onToggleParked, onPause, onAddThread } = props
  const { colors } = useTheme()
  const [menuVisible, setMenuVisible] = useState(false)
  const choose = (action: () => void) => () => {
    setMenuVisible(false)
    action()
  }
  const parkedTitle = showParked ? 'Hide parked' : 'Show parked'

  // One zero-margin button: AppHeader's sections don't shrink, so extra width pushes it off a 360dp screen.
  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <IconButton icon="dots-vertical" size={22} iconColor={colors.text} style={headerStyles.menuButton}
          onPress={() => setMenuVisible(true)} accessibilityRole="button" accessibilityLabel="More Start options" />
      }
    >
      <Menu.Item title="Rank threads" onPress={choose(onRank)} accessibilityLabel="Rank threads" />
      <Menu.Item title={parkedTitle} onPress={choose(onToggleParked)} accessibilityLabel={parkedTitle}
        accessibilityState={{ checked: showParked }} />
      <Menu.Item title="Pause Start until…" onPress={choose(onPause)} accessibilityLabel="Pause Start until a date" />
      <Menu.Item title="Add thread" onPress={choose(onAddThread)} accessibilityLabel="Add thread" />
      <Menu.Item title="Home" onPress={choose(onHome)} accessibilityLabel="Open Home" />
    </Menu>
  )
}

interface StartThreadSectionsProps {
  top3: FounderThread[]
  accordion: FounderThread[]
  styles: Styles
  activityFor: (threadId: string) => FounderTeamActivity | undefined
  onCloseout: (preselectedId: string | null) => void
  onNotToday: (thread: FounderThread) => void
  onPark: (thread: FounderThread) => Promise<void>
}

function StartThreadSections(props: StartThreadSectionsProps): JSX.Element {
  const { top3, accordion, styles, activityFor, onCloseout, onNotToday, onPark } = props
  const onDoneNext = (thread: FounderThread) => onCloseout(thread.id)

  if (top3.length === 0 && accordion.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.muted}>No threads yet — close out what you worked on to start.</Text>
        <Button mode="contained" icon="check-all" onPress={() => onCloseout(null)}
          accessibilityRole="button" accessibilityLabel="Open close-out">
          Close-out
        </Button>
      </View>
    )
  }

  return (
    <>
      <Text style={styles.sectionTitle} accessibilityRole="header">Top 3</Text>
      {top3.length === 0 ? (
        <Text style={styles.muted}>Rank threads and set next actions to fill your Top 3.</Text>
      ) : (
        top3.map((thread, index) => (
          <FounderThreadCard key={thread.id} thread={thread} variant="card" position={index + 1}
            activity={activityFor(thread.id)} onDoneNext={onDoneNext} onNotToday={onNotToday} onPark={onPark} />
        ))
      )}
      {accordion.length > 0 ? (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">Other threads</Text>
          <View style={styles.rows}>
            {accordion.map((thread) => (
              <FounderThreadCard key={thread.id} thread={thread} variant="row"
                activity={activityFor(thread.id)} onDoneNext={onDoneNext} onPark={onPark} />
            ))}
          </View>
        </>
      ) : null}
    </>
  )
}

export function FounderStartScreen(): JSX.Element {
  const navigation = useNavigation<any>()
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { isConnected, isInternetReachable } = useNetworkStatus()
  const isOffline = isConnected === false || isInternetReachable === false
  const {
    start, top3, accordion, todayIst, loading, refreshing, isStale, errorMessage,
    refresh, markNotToday, activityFor, parkThread,
  } = useFounderStart()

  const [closeout, setCloseout] = useState<CloseoutState>({ visible: false, preselectedId: null })
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)
  const [showParked, setShowParked] = useState(false)
  // Remounting the parked list makes its cache-and-network query pick up a thread parked from a card.
  const [parkedListKey, setParkedListKey] = useState(0)

  const oldDate = start && start.date < istDateString(new Date()) ? start.date : null
  // Server order, not the "Not today" order: the sheet orders its chips by rank itself.
  const sheetThreads = useMemo<FounderThread[]>(() => (start ? [...start.top3, ...start.accordion] : []), [start])

  const openCloseout = useCallback((preselectedId: string | null) => setCloseout({ visible: true, preselectedId }), [])
  const closeCloseout = useCallback(() => setCloseout((current) => ({ ...current, visible: false })), [])
  const closeDialog = useCallback(() => setOpenDialog(null), [])
  const handleNotToday = useCallback((thread: FounderThread) => markNotToday(thread.id), [markNotToday])
  const handlePark = useCallback(async (thread: FounderThread) => {
    await parkThread(thread)
    setParkedListKey((key) => key + 1)
  }, [parkThread])
  const handleOpenWaiting = useCallback((item: FounderWaitingItem) => {
    if (item.kind === 'task') navigation.navigate('TaskDetails', { taskId: item.id })
    else navigation.navigate('BugDetails', { bugId: item.id })
  }, [navigation])

  const headerActions = (
    <StartHeaderActions
      showParked={showParked}
      onHome={() => navigation.navigate('Main')}
      onRank={() => navigation.navigate('FounderRank')}
      onToggleParked={() => setShowParked((current) => !current)}
      onPause={() => setOpenDialog('pause')}
      onAddThread={() => setOpenDialog('add')}
    />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader title="Start" rightAction={headerActions} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: FAB_CLEARANCE + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <View style={styles.inset}>
          <Text style={styles.dateHeading} accessibilityRole="header">{startHeader(todayIst)}</Text>
          {isStale ? (
            <View style={styles.staleBanner} accessibilityLiveRegion="polite">
              <Text style={styles.staleText}>{staleBannerText(isOffline, oldDate)}</Text>
            </View>
          ) : null}
          {start?.closeoutOverdue ? <Text style={styles.flagLine}>{closeoutFlagText(start.lastCloseoutDate)}</Text> : null}
          {start?.pausedUntil && isPauseActive(start.pausedUntil, todayIst) ? (
            <Text style={styles.infoLine}>{pausedText(start.pausedUntil)}</Text>
          ) : null}
          {loading ? <ActivityIndicator style={styles.loader} accessibilityLabel="Loading Start" /> : null}
          {!start && !loading && errorMessage ? (
            <View style={styles.empty}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Button mode="outlined" onPress={refresh} accessibilityRole="button" accessibilityLabel="Retry loading Start">
                Retry
              </Button>
            </View>
          ) : null}
          {start ? (
            <StartThreadSections top3={top3} accordion={accordion} styles={styles} activityFor={activityFor}
              onCloseout={openCloseout} onNotToday={handleNotToday} onPark={handlePark} />
          ) : null}
        </View>
        {/* The sibling sections below pad themselves horizontally. */}
        {start ? <FounderWaitingList items={start.waitingOnMe} todayIst={todayIst} onOpen={handleOpenWaiting} /> : null}
        {start ? <FounderClaudeNotes note={start.claudeNotes} /> : null}
        {showParked ? <FounderParkedList key={parkedListKey} onChanged={refresh} /> : null}
      </ScrollView>
      {/* Dark text on the light dark-mode primary, white on the darker light-mode shade: both clear WCAG AA. */}
      <FAB icon="check-all" label="Close-out" color={isDark ? colors.background : colors.card} onPress={() => openCloseout(null)}
        style={[styles.fab, { backgroundColor: isDark ? colors.primary : colors.primaryDark,
          bottom: materialSpacing.md + insets.bottom, right: materialSpacing.md + insets.right }]}
        accessibilityRole="button" accessibilityLabel="Open close-out" />
      <FounderCloseoutSheet visible={closeout.visible} threads={sheetThreads} preselectedId={closeout.preselectedId}
        onDismiss={closeCloseout} onSaved={refresh} />
      <FounderPauseDialog visible={openDialog === 'pause'} pausedUntil={start?.pausedUntil ?? null} todayIst={todayIst}
        onDismiss={closeDialog} onChanged={refresh} />
      <FounderAddThreadDialog visible={openDialog === 'add'} onDismiss={closeDialog} onCreated={refresh} />
    </SafeAreaView>
  )
}

const headerStyles = StyleSheet.create({ menuButton: { margin: 0 } })

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: materialSpacing.sm },
  dateHeading: { ...materialTypography.titleLarge, fontWeight: 'bold', color: colors.text },
  inset: { paddingHorizontal: materialSpacing.md, gap: materialSpacing.sm },
  staleBanner: { backgroundColor: colors.warningLight, borderRadius: 8, padding: materialSpacing.sm },
  staleText: { ...materialTypography.bodySmall, color: colors.warning, fontWeight: '600' },
  flagLine: { ...materialTypography.bodySmall, color: colors.warning },
  infoLine: { ...materialTypography.bodySmall, color: colors.textSecondary },
  loader: { marginVertical: materialSpacing.xl },
  empty: { alignItems: 'center', gap: materialSpacing.md, paddingVertical: materialSpacing.xl },
  muted: { ...materialTypography.bodyMedium, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...materialTypography.bodyMedium, color: colors.error, textAlign: 'center' },
  sectionTitle: {
    ...materialTypography.titleSmall, color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: materialSpacing.sm,
  },
  rows: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: materialSpacing.md },
  fab: { position: 'absolute' },
})
