import type { JSX, ReactNode } from 'react'
import { KeyboardAvoidingView, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Modal, Portal } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../contexts/ThemeContext'

export interface FounderSheetFrameProps {
  visible: boolean
  /** false ignores taps above the sheet and the Android back button, e.g. while there is unsaved input. */
  dismissable: boolean
  onDismiss: () => void
  dismissLabel: string
  children: ReactNode
}

const SHEET_HEIGHT_RATIO = 0.85

/**
 * Bottom sheet that stays above the keyboard.
 * KeyboardAvoidingView compares its parent-relative frame with the keyboard's window Y, so it is
 * only right when it spans the whole window from y = 0. Hence the full-window transparent Modal
 * content, with the sheet pinned to its bottom and a tap area above it standing in for the backdrop.
 */
export function FounderSheetFrame({ visible, dismissable, onDismiss, dismissLabel, children }: FounderSheetFrameProps): JSX.Element {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        dismissable={dismissable}
        style={styles.modalWrapper}
        contentContainerStyle={styles.fullWindow}
      >
        <KeyboardAvoidingView behavior="padding" style={[styles.avoider, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.tapArea}
            onPress={onDismiss}
            disabled={!dismissable}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            accessibilityState={{ disabled: !dismissable }}
            importantForAccessibility="no"
          />
          <View style={[styles.sheet, { backgroundColor: colors.card, maxHeight: windowHeight * SHEET_HEIGHT_RATIO }]}>
            {children}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  )
}

const styles = StyleSheet.create({
  // Paper insets its wrapper by the safe area; the frame pads the top itself and the sheet's footer pads the bottom.
  modalWrapper: { marginTop: 0, marginBottom: 0 },
  fullWindow: { height: '100%' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  tapArea: { flex: 1 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, flexShrink: 1 },
})
