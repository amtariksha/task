/**
 * Recognising "your session is no longer valid" and deciding what to do about it.
 *
 * Pure (no React Native imports) so the node tests can load it. The side effects
 * live in utils/sessionExpiry.ts, which the Apollo error link, the fetch GraphQL
 * client and the REST client all report to.
 */

/**
 * GraphQL reports authorization failures in the body with HTTP 200, so status
 * codes alone never see them. The API throws plain Errors, so `extensions.code`
 * is never set: most resolvers say 'UNAUTHENTICATED: You must be signed in.',
 * the older ones just 'Unauthorized' — both only when there is no user in context.
 */
export const isUnauthenticatedError = (message: string): boolean =>
  /UNAUTHENTICATED|must be signed in|Unauthorized/i.test(message)

export const isForbiddenError = (message: string): boolean =>
  /FORBIDDEN|do not have permission|not authorized/i.test(message)

export interface GraphQLErrorLike {
  message?: string
  extensions?: Readonly<Record<string, unknown>> | null
}

export function isUnauthenticatedGraphQLError(error: GraphQLErrorLike): boolean {
  const code = error.extensions?.code
  if (code === 'UNAUTHENTICATED') return true
  // Authenticated but not allowed — must never sign anyone out.
  if (code === 'FORBIDDEN') return false
  return typeof error.message === 'string' && isUnauthenticatedError(error.message)
}

/**
 * Why a request was refused, judged by the token it carried against the one in
 * storage now. The server only checks the JWT, so a refusal means the request
 * had no token or a dead one.
 *
 * - expired: the stored token itself was refused.
 * - stale:   the request carried a token that has since been replaced or removed
 *            (sign-in, company switch, sign-out). Whatever replaced it decides.
 * - unsent:  the request went out without a token while one is stored — it read
 *            storage before the token was written, or the read failed.
 * - missing: no token was sent and none is stored; nothing is left to retry with.
 */
export type AuthRejection = 'expired' | 'stale' | 'unsent' | 'missing'

export function classifyAuthRejection(sentToken: string | null, storedToken: string | null): AuthRejection {
  if (sentToken) return sentToken === storedToken ? 'expired' : 'stale'
  return storedToken ? 'unsent' : 'missing'
}

export const shouldEndSession = (rejection: AuthRejection): boolean =>
  rejection === 'expired' || rejection === 'missing'

export interface SessionExpiryDeps {
  /** Must throw when storage cannot be read, rather than report "no token". */
  readStoredToken: () => Promise<string | null>
  clearToken: () => Promise<void>
  endSession: () => void
  log: (level: 'warn' | 'error', message: string, data?: unknown) => void
}

/**
 * Act on a refused request: keep the session, or clear the token and end it.
 * Logs `source` and the verdict, never a token. Never rejects.
 */
export async function handleAuthRejectionWith(
  sentToken: string | null,
  source: string,
  deps: SessionExpiryDeps
): Promise<AuthRejection | 'unreadable'> {
  let storedToken: string | null
  try {
    storedToken = await deps.readStoredToken()
  } catch (error) {
    // An unreadable keystore looks like "no token"; signing out on it would end a valid session.
    deps.log('warn', `${source} was refused, but the stored token could not be read; keeping the session`, error)
    return 'unreadable'
  }

  const rejection = classifyAuthRejection(sentToken, storedToken)
  if (!shouldEndSession(rejection)) {
    deps.log('warn', `${source} was refused, but its token was ${rejection}; keeping the session`)
    return rejection
  }

  deps.log('warn', `${source} was refused (${rejection} token); signing out`)
  try {
    // Cleared first so later refusals of the same token classify as stale.
    await deps.clearToken()
  } catch (error) {
    // signOut clears secure storage again, so the session still ends.
    deps.log('error', `Could not clear the token ${source} was refused with`, error)
  }
  deps.endSession()
  return rejection
}
