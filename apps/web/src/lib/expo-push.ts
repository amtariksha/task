// Expo push API helpers with no app imports, so node:test can load them directly.
// scripts/lib/push-token-mask.js mirrors maskPushToken/redactPushTokens for the
// plain-node scripts; expo-push.test.mjs keeps the two in step.

export const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send'

const VISIBLE_TOKEN_CHARS = 6
const EXPO_TOKEN_PATTERN = /(Expo(?:nent)?PushToken\[)([^\]]*)\]/g

// Never reveals more than half of a short value.
const maskValue = (value: string): string =>
  `${value.slice(0, Math.min(VISIBLE_TOKEN_CHARS, Math.floor(value.length / 2)))}…`

/** Push tokens are device identifiers: logs get `ExponentPushToken[abcdef…]`, never the full value. */
export function maskPushToken(token: string | null | undefined): string {
  if (!token) return '<none>'
  const wrapped = /^(Expo(?:nent)?PushToken\[)([^\]]*)\]$/.exec(token)
  return wrapped ? `${wrapped[1]}${maskValue(wrapped[2])}]` : maskValue(token)
}

/** Masks every Expo push token inside free text, e.g. a DeviceNotRegistered ticket message. */
export function redactPushTokens(text: string): string {
  return text.replace(EXPO_TOKEN_PATTERN, (token) => maskPushToken(token))
}

/**
 * With "enhanced push security" enabled on the Expo project, requests without
 * this bearer token fail with UNAUTHORIZED; without it enabled the header is optional.
 */
export function buildExpoPushHeaders(accessToken = process.env.EXPO_ACCESS_TOKEN): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  const trimmedToken = accessToken?.trim()
  return trimmedToken ? { ...headers, Authorization: `Bearer ${trimmedToken}` } : headers
}

/**
 * Expo documents only DeviceNotRegistered as permanent for a token. Credential
 * errors (InvalidCredentials, MismatchSenderId) and messages such as "Unable to
 * retrieve the FCM server key for the recipient's app" are project configuration
 * problems: the token works again once the FCM V1 key is fixed, so it stays active.
 */
export const isPermanentTokenError = (errorCode: unknown): boolean => errorCode === 'DeviceNotRegistered'
