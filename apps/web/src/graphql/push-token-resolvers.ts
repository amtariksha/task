/**
 * Push Token Resolvers
 * 
 * GraphQL resolvers for managing push notification tokens
 */

import { getPool } from '@/lib/db'
import { maskPushToken, redactPushTokens } from '@/lib/expo-push'

const getPoolInstance = () => getPool()

// pg errors can echo column values (constraint DETAIL), so tokens are masked before logging.
const describeError = (error: any): string =>
  redactPushTokens([error?.stack ?? String(error), error?.detail].filter(Boolean).join(' | '))

export const pushTokenMutations = {
  /**
   * Register a push notification token for a user's device
   */
  registerPushToken: async (
    _: any,
    {
      userId,
      pushToken,
      deviceType,
      deviceId
    }: {
      userId: string
      pushToken: string
      deviceType: string
      deviceId?: string
    },
    context: any
  ): Promise<boolean> => {
    try {
      // Auth: token must belong to the signed-in user (or an admin acting for them)
      const authUserId = context?.user?.employeeId
      if (!authUserId) throw new Error('UNAUTHENTICATED: You must be signed in.')
      if (userId !== authUserId && context.user.role !== 'admin') {
        throw new Error('FORBIDDEN: cannot register a token for another user')
      }

      // Validate inputs
      if (!userId || !pushToken || !deviceType) {
        throw new Error('Missing required fields: userId, pushToken, deviceType')
      }

      if (!['android', 'ios'].includes(deviceType.toLowerCase())) {
        throw new Error('Invalid deviceType. Must be "android" or "ios"')
      }

      // Upsert push token (insert or update if exists)
      await getPoolInstance().query(
        `INSERT INTO push_tokens (user_id, push_token, device_type, device_id, created_at, updated_at, last_used_at, is_active)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)
         ON CONFLICT (user_id, push_token)
         DO UPDATE SET
           device_type = EXCLUDED.device_type,
           device_id = EXCLUDED.device_id,
           updated_at = CURRENT_TIMESTAMP,
           last_used_at = CURRENT_TIMESTAMP,
           is_active = true`,
        [userId, pushToken, deviceType.toLowerCase(), deviceId || null]
      )

      console.log(`[registerPushToken] Registered push token for user ${userId}, device: ${deviceType}`)
      return true
    } catch (error: any) {
      console.error('[registerPushToken] Error:', describeError(error))
      throw new Error(`Failed to register push token: ${redactPushTokens(String(error?.message))}`)
    }
  },

  /**
   * Unregister a push notification token (mark as inactive)
   */
  unregisterPushToken: async (
    _: any,
    { userId, pushToken }: { userId: string; pushToken: string },
    context: any
  ): Promise<boolean> => {
    try {
      const authUserId = context?.user?.employeeId
      if (!authUserId) throw new Error('UNAUTHENTICATED: You must be signed in.')
      if (userId !== authUserId && context.user.role !== 'admin') {
        throw new Error('FORBIDDEN: cannot unregister a token for another user')
      }

      // Validate inputs
      if (!userId || !pushToken) {
        throw new Error('Missing required fields: userId, pushToken')
      }

      // Mark token as inactive instead of deleting
      const result = await getPoolInstance().query(
        `UPDATE push_tokens
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND push_token = $2`,
        [userId, pushToken]
      )

      if (result.rowCount === 0) {
        console.warn(`[unregisterPushToken] No token found for user ${userId}`)
        return false
      }

      console.log(`[unregisterPushToken] Unregistered push token for user ${userId}`)
      return true
    } catch (error: any) {
      console.error('[unregisterPushToken] Error:', describeError(error))
      throw new Error(`Failed to unregister push token: ${redactPushTokens(String(error?.message))}`)
    }
  }
}

/**
 * Helper function to get active push tokens for a user
 * Used by push notification service
 */
export async function getActivePushTokens(userId: string): Promise<string[]> {
  try {
    const result = await getPoolInstance().query(
      `SELECT push_token FROM push_tokens
       WHERE user_id = $1 AND is_active = true
       ORDER BY last_used_at DESC`,
      [userId]
    )

    return result.rows.map((row: any) => row.push_token)
  } catch (error: any) {
    console.error('[getActivePushTokens] Error:', describeError(error))
    return []
  }
}

/**
 * Helper function to mark a push token as invalid
 * Called when Expo returns an error for a token
 */
export async function markPushTokenInvalid(pushToken: string): Promise<void> {
  try {
    await getPoolInstance().query(
      `UPDATE push_tokens
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE push_token = $1`,
      [pushToken]
    )

    console.log(`[markPushTokenInvalid] Marked token as invalid: ${maskPushToken(pushToken)}`)
  } catch (error: any) {
    console.error('[markPushTokenInvalid] Error:', describeError(error))
  }
}

