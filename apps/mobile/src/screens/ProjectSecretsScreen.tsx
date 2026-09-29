/**
 * Project secrets — read-only vault.
 *
 * Lists credential names and environment keys, and reveals ONE value at a time
 * behind a fresh biometric (or PIN) prompt. Creating, editing and bulk-exporting
 * stay on the web; the server enforces that separately.
 *
 * The protections here are the point, not decoration:
 *   - a fresh authentication per reveal, never a session-long unlock
 *   - screenshots and screen recording blocked while this screen is focused
 *   - a revealed value hides itself after 30 seconds, and immediately when the app
 *     goes to the background
 *   - copying clears the clipboard after 45 seconds
 *   - no decrypted value is ever cached or written to storage
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, StyleSheet, AppState, RefreshControl, Alert } from 'react-native'
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  SegmentedButtons,
  Text,
} from 'react-native-paper'
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native'
import * as ScreenCapture from 'expo-screen-capture'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '../contexts/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'
import { materialSpacing, materialTypography } from '../config/materialTheme'
import { authenticateWithBiometrics } from '../utils/biometricAuth'
import { formatDateTimeIST } from '../utils/datetime'
import {
  SECRET_ENVIRONMENTS,
  getEnvKeys,
  getProjectSecrets,
  revealCredential,
  revealEnvValue,
  type CredentialSummary,
  type EnvSecretName,
  type SecretEnvironment,
} from '../services/projectSecretsService'

/** How long a revealed value stays on screen. Short enough to read, not to forget. */
const AUTO_HIDE_MS = 30_000
/** How long a copied value stays on the clipboard. */
const CLIPBOARD_CLEAR_MS = 45_000

type RouteParams = { projectId: string; projectName?: string }

/** Which single item is currently revealed. Only ever one at a time. */
type Revealed = { kind: 'credential'; id: number; label: string; value: string }
  | { kind: 'env'; key: string; label: string; value: string }

export default function ProjectSecretsScreen() {
  const { colors } = useTheme()
  const responsive = useResponsive()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const isFocused = useIsFocused()
  const { projectId, projectName } = (route.params || {}) as RouteParams

  const styles = useMemo(() => getStyles(colors, responsive), [colors, responsive])

  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [envSecrets, setEnvSecrets] = useState<EnvSecretName[]>([])
  const [environment, setEnvironment] = useState<SecretEnvironment>('production')
  const [canWrite, setCanWrite] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [revealing, setRevealing] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Revealed | null>(null)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clipboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRevealed = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setRevealed(null)
  }, [])

  // Screenshots and screen recording are blocked only while this screen is
  // focused, so the rest of the app is unaffected.
  useEffect(() => {
    if (!isFocused) return
    ScreenCapture.preventScreenCaptureAsync().catch((err) =>
      console.warn('Could not block screen capture:', err)
    )
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {})
    }
  }, [isFocused])

  // A secret on screen must not survive the app going to the background, where it
  // would otherwise appear in the OS task switcher.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clearRevealed()
    })
    return () => sub.remove()
  }, [clearRevealed])

  // Leaving the screen hides whatever is showing, and any pending timers go.
  useEffect(() => {
    if (!isFocused) clearRevealed()
  }, [isFocused, clearRevealed])

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (clipboardTimer.current) clearTimeout(clipboardTimer.current)
    },
    []
  )

  const load = useCallback(async () => {
    setError('')
    const res = await getProjectSecrets(projectId)
    if (res.success && res.data) {
      setCredentials(res.data.credentials)
      setEnvSecrets(res.data.envSecrets)
      setCanWrite(res.data.canWrite)
    } else {
      setError(res.error || 'Could not load this project’s secrets.')
      setCredentials([])
      setEnvSecrets([])
    }
    setLoading(false)
    setRefreshing(false)
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  // Switching environment reloads only the env keys.
  const changeEnvironment = useCallback(
    async (next: string) => {
      const env = next as SecretEnvironment
      setEnvironment(env)
      clearRevealed()
      const res = await getEnvKeys(projectId, env)
      if (res.success && Array.isArray(res.data)) setEnvSecrets(res.data)
      else setEnvSecrets([])
    },
    [projectId, clearRevealed]
  )

  /**
   * Authenticate, then fetch. A fresh prompt every time: an unlock that lasted the
   * session would make the whole vault readable from an unattended phone.
   */
  const withFreshAuth = useCallback(
    async (label: string, fetchValue: () => Promise<{ ok: boolean; value?: string; error?: string }>) => {
      const auth = await authenticateWithBiometrics(`Reveal ${label}`)
      if (!auth.success) {
        if (auth.error && auth.error !== 'Authentication cancelled') {
          Alert.alert('Not revealed', auth.error)
        }
        return null
      }
      const result = await fetchValue()
      if (!result.ok || result.value === undefined) {
        Alert.alert('Not revealed', result.error || 'Could not reveal this value.')
        return null
      }
      return result.value
    },
    []
  )

  const showFor30Seconds = useCallback((next: Revealed) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setRevealed(next)
    hideTimer.current = setTimeout(() => setRevealed(null), AUTO_HIDE_MS)
  }, [])

  const handleRevealCredential = useCallback(
    async (credential: CredentialSummary) => {
      const tag = `credential:${credential.id}`
      if (revealed?.kind === 'credential' && revealed.id === credential.id) {
        clearRevealed()
        return
      }
      setRevealing(tag)
      const value = await withFreshAuth(credential.name, async () => {
        const res = await revealCredential(projectId, credential.id)
        return { ok: Boolean(res.success && res.data), value: res.data?.value, error: res.error }
      })
      setRevealing(null)
      if (value !== null) {
        showFor30Seconds({ kind: 'credential', id: credential.id, label: credential.name, value })
      }
    },
    [projectId, revealed, clearRevealed, withFreshAuth, showFor30Seconds]
  )

  const handleRevealEnv = useCallback(
    async (secret: EnvSecretName) => {
      const tag = `env:${secret.key}`
      if (revealed?.kind === 'env' && revealed.key === secret.key) {
        clearRevealed()
        return
      }
      setRevealing(tag)
      const value = await withFreshAuth(secret.key, async () => {
        const res = await revealEnvValue(projectId, environment, secret.key)
        return { ok: Boolean(res.success && res.data), value: res.data?.value, error: res.error }
      })
      setRevealing(null)
      if (value !== null) {
        showFor30Seconds({ kind: 'env', key: secret.key, label: secret.key, value })
      }
    },
    [projectId, environment, revealed, clearRevealed, withFreshAuth, showFor30Seconds]
  )

  /** Copy, then clear the clipboard: a secret must not sit there indefinitely. */
  const handleCopy = useCallback(async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value)
      if (clipboardTimer.current) clearTimeout(clipboardTimer.current)
      clipboardTimer.current = setTimeout(() => {
        Clipboard.setStringAsync('').catch(() => {})
      }, CLIPBOARD_CLEAR_MS)
      Alert.alert('Copied', `${label} copied. The clipboard clears in 45 seconds.`)
    } catch (err) {
      console.error('Could not copy to the clipboard:', err)
      Alert.alert('Error', 'Could not copy that value.')
    }
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    clearRevealed()
    load()
  }, [load, clearRevealed])

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <IconButton icon="lock-outline" size={44} iconColor={colors.textSecondary} />
        <Text style={styles.emptyText}>{error}</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          Go Back
        </Button>
      </View>
    )
  }

  const revealedValueFor = (kind: 'credential' | 'env', id: number | string): string | null => {
    if (!revealed) return null
    if (revealed.kind === 'credential' && kind === 'credential' && revealed.id === id) return revealed.value
    if (revealed.kind === 'env' && kind === 'env' && revealed.key === id) return revealed.value
    return null
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>{projectName || projectId}</Text>
          <Text style={styles.subtitle}>
            Read-only. Revealing a value asks for your fingerprint or face, is recorded in the
            project's access log, and hides itself after 30 seconds.
          </Text>
          {!canWrite && (
            <Text style={styles.hint}>
              Add, edit and export are on the web, and need project manager, team leader or company
              admin access.
            </Text>
          )}
        </Card.Content>
      </Card>

      {/* Credentials */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Credentials ({credentials.length})</Text>
          <Divider style={styles.divider} />
          {credentials.length === 0 ? (
            <Text style={styles.emptyText}>No credentials stored for this project.</Text>
          ) : (
            credentials.map((c) => {
              const value = revealedValueFor('credential', c.id)
              return (
                <View key={c.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Chip compact style={styles.typeChip} textStyle={styles.typeChipText}>
                      {c.type}
                    </Chip>
                  </View>
                  {value !== null ? (
                    <View style={styles.valueBox}>
                      <Text selectable style={styles.valueText}>
                        {value}
                      </Text>
                      <View style={styles.valueActions}>
                        <Button compact mode="text" onPress={() => handleCopy(value, c.name)}>
                          Copy
                        </Button>
                        <Button compact mode="text" onPress={clearRevealed}>
                          Hide
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <Button
                      compact
                      mode="outlined"
                      icon="eye-outline"
                      loading={revealing === `credential:${c.id}`}
                      disabled={revealing !== null}
                      onPress={() => handleRevealCredential(c)}
                      style={styles.revealBtn}
                    >
                      Reveal
                    </Button>
                  )}
                </View>
              )
            })
          )}
        </Card.Content>
      </Card>

      {/* Environment variables */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Environment variables</Text>
          <SegmentedButtons
            value={environment}
            onValueChange={changeEnvironment}
            buttons={SECRET_ENVIRONMENTS.map((env) => ({
              value: env,
              label: env === 'development' ? 'Dev' : env === 'staging' ? 'Staging' : 'Prod',
            }))}
            style={styles.envPicker}
          />
          <Divider style={styles.divider} />
          {envSecrets.length === 0 ? (
            <Text style={styles.emptyText}>No variables for {environment}.</Text>
          ) : (
            envSecrets.map((s) => {
              const value = revealedValueFor('env', s.key)
              return (
                <View key={s.id ?? s.key} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.keyName}>{s.key}</Text>
                    {s.updatedAt ? (
                      <Text style={styles.rowMeta}>updated {formatDateTimeIST(s.updatedAt)}</Text>
                    ) : null}
                  </View>
                  {value !== null ? (
                    <View style={styles.valueBox}>
                      <Text selectable style={styles.valueText}>
                        {value}
                      </Text>
                      <View style={styles.valueActions}>
                        <Button compact mode="text" onPress={() => handleCopy(value, s.key)}>
                          Copy
                        </Button>
                        <Button compact mode="text" onPress={clearRevealed}>
                          Hide
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <Button
                      compact
                      mode="outlined"
                      icon="eye-outline"
                      loading={revealing === `env:${s.key}`}
                      disabled={revealing !== null}
                      onPress={() => handleRevealEnv(s)}
                      style={styles.revealBtn}
                    >
                      Reveal
                    </Button>
                  )}
                </View>
              )
            })
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

const getStyles = (colors: any, responsive: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: materialSpacing.lg,
      backgroundColor: colors.background,
    },
    card: {
      margin: materialSpacing.md,
      marginBottom: 0,
      backgroundColor: colors.surface,
    },
    title: { ...materialTypography.titleMedium, color: colors.text },
    subtitle: {
      ...materialTypography.bodySmall,
      color: colors.textSecondary,
      marginTop: materialSpacing.xs,
    },
    hint: {
      ...materialTypography.bodySmall,
      color: colors.textTertiary,
      marginTop: materialSpacing.sm,
      fontStyle: 'italic',
    },
    cardTitle: { ...materialTypography.titleSmall, color: colors.text },
    divider: { marginVertical: materialSpacing.sm, backgroundColor: colors.border },
    envPicker: { marginTop: materialSpacing.sm },
    row: { paddingVertical: materialSpacing.sm },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: materialSpacing.sm },
    rowName: { ...materialTypography.bodyMedium, color: colors.text, flex: 1 },
    keyName: {
      ...materialTypography.bodyMedium,
      color: colors.text,
      flex: 1,
      fontFamily: 'monospace',
    },
    rowMeta: { ...materialTypography.bodySmall, color: colors.textTertiary },
    typeChip: { backgroundColor: colors.surfaceVariant },
    typeChipText: { fontSize: 10, color: colors.textSecondary },
    revealBtn: { alignSelf: 'flex-start', marginTop: materialSpacing.xs },
    valueBox: {
      marginTop: materialSpacing.xs,
      padding: materialSpacing.sm,
      borderRadius: 8,
      backgroundColor: colors.surfaceVariant,
    },
    valueText: {
      fontFamily: 'monospace',
      fontSize: 12,
      color: colors.text,
    },
    valueActions: { flexDirection: 'row', justifyContent: 'flex-end' },
    emptyText: {
      ...materialTypography.bodyMedium,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: materialSpacing.md,
    },
  })
