/**
 * The one place that decides whether a refused request means the session is over.
 *
 * The Apollo error link (config/apollo.ts), the fetch GraphQL client
 * (services/graphqlClient.ts) and the REST client (services/apiClient.ts) all
 * report here, so they agree on when to sign out — and a request that merely
 * raced a sign-in, company switch or sign-out cannot end a healthy session.
 * The rules are in utils/authErrors (handleAuthRejectionWith), where they are tested.
 */

import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { deleteSecure, SECURE_KEYS } from './secureStorage'
import { triggerUnauthorized } from './authEvents'
import { handleAuthRejectionWith } from './authErrors'
import { logger } from './debugLogger'

/**
 * @param sentToken the token the refused request carried (null if none)
 * @param source    what was refused, for the log
 *
 * Never rejects, so callers in synchronous handlers can fire and forget it.
 */
export async function handleAuthRejection(sentToken: string | null, source: string): Promise<void> {
  await handleAuthRejectionWith(sentToken, source, {
    // Not getUserToken: it returns null when the read fails, which would pass for "signed out".
    readStoredToken: () => SecureStore.getItemAsync(SECURE_KEYS.USER_TOKEN),
    clearToken: async () => {
      await deleteSecure(SECURE_KEYS.USER_TOKEN)
      await AsyncStorage.removeItem('userToken')
    },
    endSession: triggerUnauthorized,
    log: (level, message, data) => logger[level]('Auth', message, data),
  })
}
