import React, { useContext, useState, useEffect, useRef } from 'react'
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
import { Alert } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { deleteUserPin, getCurrentUserPin, getUserData } from '../utils/secureStorage'
import { AuthContext } from '../contexts/AuthContext'
import {
  isBiometricSupported,
  isBiometricEnrolled,
  isBiometricEnabled,
  getBiometricTypeName,
  authenticateWithBiometrics,
} from '../utils/biometricAuth'
import { materialTypography, materialSpacing } from '../config/materialTheme'

interface PinLockScreenProps {
  onUnlock: () => void
}

export default function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const { colors } = useTheme()
  const { signOut } = useContext(AuthContext)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricType, setBiometricType] = useState('Biometric')
  
  const inputRef = useRef<TextInput>(null)
  const shakeAnim = useRef(new Animated.Value(0)).current

  // Auto-focus keyboard on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    async function checkAndTriggerBiometrics() {
      const supported = await isBiometricSupported()
      const enrolled = await isBiometricEnrolled()
      const enabled = await isBiometricEnabled()
      const name = await getBiometricTypeName()
      
      const available = supported && enrolled && enabled
      setBiometricAvailable(available)
      setBiometricType(name)

      if (available) {
        // Automatically trigger biometric login
        setTimeout(() => {
          handleBiometricAuth()
        }, 300)
      }
    }
    checkAndTriggerBiometrics()
  }, [])

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

  const handlePinChange = async (text: string) => {
    setError('')
    const cleanText = text.replace(/\D/g, '')
    setPin(cleanText)
    
    if (cleanText.length === 4) {
      const storedPin = await getCurrentUserPin()
      if (storedPin === cleanText) {
        onUnlock()
      } else {
        setTimeout(() => {
          triggerShake()
          setError('Incorrect PIN. Please try again.')
          setPin('')
          inputRef.current?.focus()
        }, 200)
      }
    }
  }

  /**
   * The lock screen had no exit: someone who had forgotten their PIN and had no
   * biometrics enrolled could not reach the app or the sign-in screen at all, and
   * reinstalling was the only way out.
   *
   * The PIN has to be cleared as part of this, not just the session. It is keyed
   * per user and deliberately survives an ordinary sign-out, so signing out alone
   * would drop the caller back onto this same screen behind the same forgotten PIN
   * as soon as they signed in again.
   */
  const handleSignOut = () => {
    Alert.alert(
      'Sign out and clear PIN?',
      'Your security PIN will be removed and you will need to sign in again and set ' +
        'a new one. Use this if you have forgotten your PIN.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const employeeId = (await getUserData<{ employeeId?: string }>())?.employeeId
                if (employeeId) await deleteUserPin(employeeId)
              } catch (err) {
                // Sign out regardless: being stuck behind the lock screen is worse
                // than a PIN that outlives the session.
                console.error('Could not clear the PIN before signing out:', err)
              }
              await signOut()
            })()
          },
        },
      ]
    )
  }

  const handleBiometricAuth = async () => {
    setError('')
    const authResult = await authenticateWithBiometrics(`Unlock Karmayog using ${biometricType}`)
    if (authResult.success) {
      onUnlock()
    } else if (authResult.error && authResult.error !== 'Authentication cancelled') {
      setError(authResult.error)
    }
  }

  const renderDot = (index: number) => {
    const active = pin.length > index
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

  const getBiometricIcon = () => {
    if (biometricType.toLowerCase().includes('face')) {
      return 'face-recognition'
    }
    return 'fingerprint'
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
          value={pin}
          onChangeText={handlePinChange}
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          style={styles.hiddenInput}
          autoComplete="off"
          importantForAutofill="no"
          autoFocus={true}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="shield-lock-outline" size={64} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>App Locked</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Enter your 4-digit security PIN or use biometrics to unlock.
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

          {/* Biometrics Fallback / Option */}
          {biometricAvailable && (
            <Button
              mode="text"
              onPress={handleBiometricAuth}
              textColor={colors.primary}
              icon={getBiometricIcon()}
              style={styles.biometricButton}
            >
              Unlock with {biometricType}
            </Button>
          )}

          <Button
            mode="text"
            onPress={handleSignOut}
            textColor={colors.textSecondary}
            style={styles.signOutButton}
          >
            Forgot PIN? Sign out
          </Button>
        </View>
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
  signOutButton: {
    alignSelf: 'center',
    marginTop: materialSpacing.sm,
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
  title: {
    ...materialTypography.headlineMedium,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: materialSpacing.md,
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
  biometricButton: {
    marginTop: materialSpacing.md,
    alignSelf: 'center',
  },
})
