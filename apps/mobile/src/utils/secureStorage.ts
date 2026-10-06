/**
 * Secure Storage Utility
 * 
 * Provides secure storage for sensitive data using Expo SecureStore.
 * SecureStore uses:
 * - iOS: Keychain Services
 * - Android: EncryptedSharedPreferences (API 23+) or Keystore (API 18-22)
 * 
 * For non-sensitive data, use AsyncStorage instead.
 */

import * as SecureStore from 'expo-secure-store'
import { pinStorageKey } from './pinStorageKey'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Keys for secure storage
export const SECURE_KEYS = {
  USER_TOKEN: 'userToken',
  USER_DATA: 'userData',
  BIOMETRIC_ENABLED: 'biometricEnabled',
} as const

/**
 * The app-lock PIN is stored PER USER — `userPin.<employeeId>` (see pinStorageKey for why not a colon).
 *
 * It used to live under one device-wide `userPin` key, so on a shared device the
 * second person to sign in was locked behind the first person's PIN, and clearing
 * it on logout was the only thing standing between them and each other's session.
 * The web app was changed the same way (jsr_user_pin:<employeeId>).
 */

/** The pre-per-user key, in both stores. Read once to migrate, then discarded. */
const LEGACY_DEVICE_PIN_KEY = 'userPin'

const pinKeyFor = (employeeId: string) => pinStorageKey(employeeId)

// Keys for regular storage (non-sensitive)
export const STORAGE_KEYS = {
  TASK_FILTERS: 'taskFilters',
  BUG_FILTERS: 'bugFilters',
  THEME_MODE: 'themeMode',
  LAST_SYNC: 'lastSync',
} as const

/**
 * Save data to secure storage (for sensitive data like tokens)
 */
export async function saveSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value)
  } catch (error) {
    console.error(`Failed to save secure data for key ${key}:`, error)
    throw error
  }
}

/**
 * Get data from secure storage
 */
export async function getSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch (error) {
    console.error(`Failed to get secure data for key ${key}:`, error)
    return null
  }
}

/**
 * Delete data from secure storage
 */
export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch (error) {
    console.error(`Failed to delete secure data for key ${key}:`, error)
    throw error
  }
}

/**
 * Save data to regular storage (for non-sensitive data)
 */
export async function save(key: string, value: any): Promise<void> {
  try {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (error) {
    console.error(`Failed to save data for key ${key}:`, error)
    throw error
  }
}

/**
 * Get data from regular storage
 */
export async function get<T = any>(key: string): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(key)
    if (value === null) return null
    
    try {
      return JSON.parse(value) as T
    } catch {
      return value as T
    }
  } catch (error) {
    console.error(`Failed to get data for key ${key}:`, error)
    return null
  }
}

/**
 * Delete data from regular storage
 */
export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key)
  } catch (error) {
    console.error(`Failed to remove data for key ${key}:`, error)
    throw error
  }
}

/**
 * Clear all data from regular storage
 */
export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.clear()
  } catch (error) {
    console.error('Failed to clear storage:', error)
    throw error
  }
}

/**
 * Clear all secure data (call on logout)
 */
export async function clearSecureData(): Promise<void> {
  try {
    // The PIN is keyed per user and deliberately survives sign-out, so the same
    // person is not asked to set it up again on their next sign-in. A different
    // user on the same device gets their own key, so nobody inherits a lock.
    await Promise.all([
      deleteSecure(SECURE_KEYS.USER_TOKEN),
      deleteSecure(SECURE_KEYS.USER_DATA),
    ])
  } catch (error) {
    console.error('Failed to clear secure data:', error)
    throw error
  }
}

/** The app-lock PIN for one user, or null when they have not set one. */
export async function getUserPin(employeeId: string): Promise<string | null> {
  if (!employeeId) return null
  return getSecure(pinKeyFor(employeeId))
}

/** Set (or replace) one user's app-lock PIN. */
export async function saveUserPin(employeeId: string, pin: string): Promise<void> {
  if (!employeeId) throw new Error('Cannot store a PIN without an employee ID')
  return saveSecure(pinKeyFor(employeeId), pin)
}

/** Remove one user's app-lock PIN. */
export async function deleteUserPin(employeeId: string): Promise<void> {
  if (!employeeId) return
  return deleteSecure(pinKeyFor(employeeId))
}

/**
 * The PIN belonging to the signed-in user, resolved from the stored session so
 * callers do not all have to thread an employee ID through.
 */
export async function getCurrentUserPin(): Promise<string | null> {
  const user = await getUserData<{ employeeId?: string }>()
  if (!user?.employeeId) return null
  return getUserPin(user.employeeId)
}

/**
 * Throw away any PIN left under the old device-wide key, including the plaintext
 * AsyncStorage copy that used to be kept "so it survives APK updates". It is not
 * migrated to a per-user key: there is no way to tell whose PIN it was, and the
 * owner is asked to set one up again rather than a stranger inheriting their lock.
 */
export async function discardLegacyDevicePin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_DEVICE_PIN_KEY)
  } catch (error) {
    console.warn('Could not clear the legacy device PIN from secure storage:', error)
  }
  try {
    await AsyncStorage.removeItem(LEGACY_DEVICE_PIN_KEY)
  } catch (error) {
    console.warn('Could not clear the legacy device PIN from local storage:', error)
  }
}

/**
 * Save user token securely
 */
export async function saveUserToken(token: string): Promise<void> {
  return saveSecure(SECURE_KEYS.USER_TOKEN, token)
}

/**
 * Get user token
 */
export async function getUserToken(): Promise<string | null> {
  return getSecure(SECURE_KEYS.USER_TOKEN)
}

/**
 * Save user data securely
 */
export async function saveUserData(user: any): Promise<void> {
  return saveSecure(SECURE_KEYS.USER_DATA, JSON.stringify(user))
}

/**
 * Get user data
 */
export async function getUserData<T = any>(): Promise<T | null> {
  const data = await getSecure(SECURE_KEYS.USER_DATA)
  if (!data) return null
  
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

