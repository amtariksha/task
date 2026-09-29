import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native'
import { Text, Button, Portal, Dialog } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { saveSecure, SECURE_KEYS, saveUserPin, getUserData } from '../utils/secureStorage'
import {
  isBiometricSupported,
  isBiometricEnrolled,
  enableBiometric,
  getBiometricTypeName,
  authenticateWithBiometrics,
} from '../utils/biometricAuth'
import { materialTypography, materialSpacing } from '../config/materialTheme'

interface PinSetupScreenProps {
  onComplete: () => void
}

export default function PinSetupScreen({ onComplete }: PinSetupScreenProps) {
  const { colors } = useTheme()
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [error, setError] = useState('')
  const [showBiometricDialog, setShowBiometricDialog] = useState(false)
  const [biometricType, setBiometricType] = useState('Biometric')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  
  const inputRef = useRef<TextInput>(null)
  const shakeAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    async function checkBiometrics() {
      const supported = await isBiometricSupported()
      const enrolled = await isBiometricEnrolled()
      const name = await getBiometricTypeName()
      setBiometricAvailable(supported && enrolled)
      setBiometricType(name)
    }
    checkBiometrics()
  }, [])

  // Auto-focus keyboard on mount and step transitions
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [step])

  const triggerShake = () => {
    Vibration.vibrate(100)
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start()
  }

  const handlePinChange = (text: string) => {
    setError('')
    const cleanText = text.replace(/\D/g, '')
    
    if (step === 'create') {
      setPin(cleanText)
      if (cleanText.length === 4) {
        setTimeout(() => {
          Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
            setStep('confirm')
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
          })
        }, 200)
      }
    } else {
      setConfirmPin(cleanText)
      if (cleanText.length === 4) {
        if (pin === cleanText) {
          handleSuccess(pin)
        } else {
          setTimeout(() => {
            triggerShake()
            setError('PINs do not match. Try again.')
            setConfirmPin('')
            inputRef.current?.focus()
          }, 200)
        }
      }
    }
  }

  const handleReset = () => {
    setPin('')
    setConfirmPin('')
    setStep('create')
    setError('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleSuccess = async (finalPin: string) => {
    try {
      Keyboard.dismiss()
      const employeeId = (await getUserData<{ employeeId?: string }>())?.employeeId
      if (!employeeId) {
        setError('Could not identify the signed-in user. Please sign in again.')
        return
      }
      // Per-user key: a device-wide PIN locked the next person to sign in.
      await saveUserPin(employeeId, finalPin)
      if (biometricAvailable) {
        setShowBiometricDialog(true)
      } else {
        onComplete()
      }
    } catch (err) {
      console.error('Failed to save PIN:', err)
      setError('Could not set PIN. Please try again.')
    }
  }

  const handleBiometricResponse = async (enable: boolean) => {
    setShowBiometricDialog(false)
    if (enable) {
      const authResult = await authenticateWithBiometrics(`Enable ${biometricType} access`)
      if (authResult.success) {
        await enableBiometric()
      }
    }
    onComplete()
  }

  const renderDot = (index: number) => {
    const currentVal = step === 'create' ? pin : confirmPin
    const active = currentVal.length > index
    return (
      <View
        key={index}
        style={[
          styles.dot,
          {
            borderColor: error ? colors.error : colors.primary,
            backgroundColor: active ? (error ? colors.error : colors.primary) : 'transparent',
          },
        ]}
      />
    )
  }

  const handleFocus = () => {
    if (inputRef.current?.isFocused()) {
      inputRef.current.blur()
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      inputRef.current?.focus()
    }
  }

  return (
    <TouchableWithoutFeedback onPress={handleFocus}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Brand Accent */}
        <View style={[styles.gradientBar, { backgroundColor: colors.primary }]} />

        {/* Hidden Input field focused by ref */}
        <TextInput
          ref={inputRef}
          value={step === 'create' ? pin : confirmPin}
          onChangeText={handlePinChange}
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          style={styles.hiddenInput}
          autoComplete="off"
          importantForAutofill="no"
          autoFocus={true}
        />

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.header}>
            <MaterialCommunityIcons
              name={step === 'create' ? 'lock-plus-outline' : 'lock-check-outline'}
              size={64}
              color={colors.primary}
              style={styles.logo}
            />
            <Text style={[styles.title, { color: colors.text }]}>
              {step === 'create' ? 'Create Security PIN' : 'Confirm Security PIN'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {step === 'create'
                ? 'Choose a 4-digit PIN to secure your account access.'
                : 'Please type the 4-digit PIN again to confirm.'}
            </Text>
          </View>

          {/* PIN Indicators */}
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={handleFocus}
            style={styles.interactiveArea}
          >
            <Animated.View
              style={[
                styles.dotContainer,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              {[0, 1, 2, 3].map(renderDot)}
            </Animated.View>
          </TouchableOpacity>

          {/* Error Display */}
          {error ? (
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          ) : (
            <View style={styles.errorPlaceholder} />
          )}

          {step === 'confirm' && (
            <Button
              mode="text"
              onPress={handleReset}
              textColor={colors.primary}
              style={styles.resetButton}
            >
              Start Over
            </Button>
          )}
        </Animated.View>

        {/* Biometrics Opt-in Dialog */}
        <Portal>
          <Dialog visible={showBiometricDialog} onDismiss={() => handleBiometricResponse(false)}>
            <Dialog.Title>Enable {biometricType}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                Would you like to enable {biometricType} authentication for quick access next time you open the app?
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => handleBiometricResponse(false)}>No, thanks</Button>
              <Button onPress={() => handleBiometricResponse(true)}>Enable</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </TouchableWithoutFeedback>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBar: {
    height: 4,
    width: '100%',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: materialSpacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: materialSpacing.xl,
  },
  logo: {
    marginBottom: materialSpacing.md,
  },
  title: {
    ...materialTypography.headlineMedium,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: materialSpacing.xs,
  },
  subtitle: {
    ...materialTypography.bodyMedium,
    textAlign: 'center',
    paddingHorizontal: materialSpacing.lg,
  },
  interactiveArea: {
    paddingVertical: materialSpacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    gap: materialSpacing.lg,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  errorText: {
    ...materialTypography.bodyMedium,
    textAlign: 'center',
    height: 20,
    marginBottom: materialSpacing.md,
  },
  errorPlaceholder: {
    height: 20,
    marginBottom: materialSpacing.md,
  },
  resetButton: {
    marginTop: materialSpacing.md,
    alignSelf: 'center',
  },
})
