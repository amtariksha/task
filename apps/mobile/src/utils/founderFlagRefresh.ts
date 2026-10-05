/**
 * The logic of refreshFounderFlag (services/founderFlagService), with its I/O
 * passed in so the node tests can drive it without React Native.
 */

export interface FounderFlagAnswer {
  employeeId: string
  isFounder: boolean
}

export interface MeIsFounderResult {
  data?: { me: FounderFlagAnswer | null } | null
  error?: { message: string } | null
}

export interface FounderFlagRefreshDeps {
  query: () => Promise<MeIsFounderResult>
  saveAnswer: (answer: FounderFlagAnswer) => Promise<void>
  cachedFlag: () => Promise<boolean>
  log: (level: 'warn' | 'error', message: string, data?: Record<string, unknown>) => void
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Ask the server, cache the answer, and return it. When the server gives no
 * usable answer the cached flag is returned instead, so an offline founder
 * still lands on Start — and the reason is logged, because a silent fallback
 * to an empty cache is indistinguishable from "not a founder".
 */
export async function refreshFounderFlagWith(deps: FounderFlagRefreshDeps): Promise<boolean> {
  let result: MeIsFounderResult
  try {
    result = await deps.query()
  } catch (error) {
    deps.log('error', 'ME_IS_FOUNDER request failed; using the cached founder flag', { error: messageOf(error) })
    return deps.cachedFlag()
  }

  if (result.error) {
    deps.log('error', 'ME_IS_FOUNDER returned an error; using the cached founder flag', {
      error: result.error.message,
    })
    return deps.cachedFlag()
  }

  const me = result.data?.me
  if (!me) {
    // The server resolves `me` to null, rather than erroring, for a request with no valid token.
    deps.log('warn', 'ME_IS_FOUNDER returned me = null; using the cached founder flag')
    return deps.cachedFlag()
  }

  const answer: FounderFlagAnswer = { employeeId: me.employeeId, isFounder: me.isFounder === true }
  try {
    await deps.saveAnswer(answer)
  } catch (error) {
    // A lost cache write costs the next cold start its root route; dropping the answer would cost this one.
    deps.log('warn', 'Could not cache the founder flag; using the server answer anyway', { error: messageOf(error) })
  }
  return answer.isFounder
}
