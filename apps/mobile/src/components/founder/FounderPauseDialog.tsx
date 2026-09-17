import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Button, Dialog, HelperText, Portal, Text } from 'react-native-paper'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useMutation } from '@apollo/client/react'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemeContextType } from '../../contexts/Providers'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { materialSpacing, materialTypography } from '../../config/materialTheme'
import { UPDATE_FOUNDER_START_SETTINGS } from '../../config/founder-queries'
import { isPauseActive, localDateString, pausedText } from '../../utils/founderFormat'
import type { FounderStartSettings } from '../../types/founder'

type ThemeColors = ThemeContextType['colors']

const FALLBACK_ERROR = 'Could not update the Start pause.'
const IS_IOS = Platform.OS === 'ios'

interface UpdateSettingsData {
  updateFounderStartSettings: FounderStartSettings
}

interface UpdateSettingsVariables {
  enabled?: boolean
  hour?: number
  minute?: number
  pausedUntil?: string | null
}

export interface FounderPauseDialogProps {
  visible: boolean
  pausedUntil: string | null
  todayIst: string
  onDismiss: () => void
  onChanged: () => void
}

/** Local-midnight Date for a YYYY-MM-DD string — the picker works in device-local time. */
function toPickerDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function FounderPauseDialog({
  visible,
  pausedUntil,
  todayIst,
  onDismiss,
  onChanged,
}: FounderPauseDialogProps): JSX.Element {
  const { colors } = useTheme()
  const styles = useMemo(() => getStyles(colors), [colors])
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only treat an explicit false as offline.
  const isOffline = isConnected === false || isInternetReachable === false

  const [showPicker, setShowPicker] = useState(false)
  // The saved value, shown until the parent's refetch delivers it through props.
  const [savedPausedUntil, setSavedPausedUntil] = useState<string | null | undefined>(undefined)
  const [updateSettings, { loading: saving }] = useMutation<UpdateSettingsData, UpdateSettingsVariables>(
    UPDATE_FOUNDER_START_SETTINGS,
  )

  useEffect(() => {
    setSavedPausedUntil(undefined)
  }, [pausedUntil])

  useEffect(() => {
    if (!visible) setShowPicker(false)
  }, [visible])

  const currentPausedUntil = savedPausedUntil === undefined ? pausedUntil : savedPausedUntil
  const pauseActive = isPauseActive(currentPausedUntil, todayIst)
  const minimumDate = useMemo(() => toPickerDate(todayIst), [todayIst])
  const pickerValue = currentPausedUntil && pauseActive ? toPickerDate(currentPausedUntil) : minimumDate
  const writesDisabled = saving || isOffline

  const savePausedUntil = async (nextPausedUntil: string | null): Promise<void> => {
    try {
      const result = await updateSettings({ variables: { pausedUntil: nextPausedUntil } })
      const settings = result.data?.updateFounderStartSettings
      if (result.error || !settings) {
        showToast(result.error?.message ?? FALLBACK_ERROR, 'error')
        return
      }
      setSavedPausedUntil(settings.pausedUntil)
      showToast(nextPausedUntil ? pausedText(nextPausedUntil) : 'Start push resumed', 'success')
      onChanged()
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : FALLBACK_ERROR, 'error')
    }
  }

  // The Android picker reopens (and resets its calendar) whenever onChange changes identity,
  // so the handler stays stable and reaches the latest save function through a ref.
  const savePausedUntilRef = useRef(savePausedUntil)
  useEffect(() => {
    savePausedUntilRef.current = savePausedUntil
  })

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date): void => {
    // Android's picker is a one-shot native dialog: it must be unmounted after every event.
    setShowPicker(false)
    if (event.type !== 'set' || !selectedDate) return
    void savePausedUntilRef.current(localDateString(selectedDate))
  }, [])

  const bodyText = currentPausedUntil && pauseActive ? pausedText(currentPausedUntil) : 'The 09:00 Start push is on.'

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Pause Start</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {bodyText}
          </Text>
          {isOffline ? (
            <HelperText type="error" visible>
              You are offline — connect to change the pause.
            </HelperText>
          ) : null}
          {IS_IOS && showPicker ? (
            <View style={styles.inlinePicker}>
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="inline"
                minimumDate={minimumDate}
                onChange={handleDateChange}
                accessibilityLabel="Pause the Start push until"
              />
            </View>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          {pauseActive ? (
            <Button
              onPress={() => void savePausedUntil(null)}
              disabled={writesDisabled}
              textColor={colors.error}
              accessibilityRole="button"
              accessibilityLabel="Clear pause"
            >
              Clear pause
            </Button>
          ) : null}
          <Button
            onPress={() => setShowPicker((current) => (IS_IOS ? !current : true))}
            disabled={writesDisabled}
            loading={saving}
            accessibilityRole="button"
            accessibilityLabel={pauseActive ? 'Pick a new pause end date' : 'Pick a date to pause until'}
          >
            Pick date
          </Button>
          <Button onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close pause dialog">
            Close
          </Button>
        </Dialog.Actions>
      </Dialog>

      {!IS_IOS && showPicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleDateChange}
        />
      ) : null}
    </Portal>
  )
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    dialog: {
      borderRadius: 16,
    },
    body: {
      ...materialTypography.bodyLarge,
      color: colors.text,
    },
    inlinePicker: {
      marginTop: materialSpacing.sm,
      alignItems: 'center',
    },
    actions: {
      flexWrap: 'wrap',
    },
  })
