/**
 * Founder flag — decides whether the Start screen is the root route.
 *
 * The flag comes from `me { isFounder }` (server checks is_platform_admin and
 * FOUNDER_EMPLOYEE_IDS). It is cached per employee in AsyncStorage so a cold
 * start can pick the root route before the network answers, and so a
 * different user on the same device never inherits it.
 */

import { apolloClient } from '../config/apollo'
import { ME_IS_FOUNDER } from '../config/founder-queries'
import { get, save, remove, getUserData } from '../utils/secureStorage'
import { refreshFounderFlagWith, type FounderFlagAnswer } from '../utils/founderFlagRefresh'
import { logger } from '../utils/debugLogger'

const FOUNDER_FLAG_KEY = 'founder_flag'

interface MeIsFounderData {
  me: FounderFlagAnswer | null
}

async function currentEmployeeId(): Promise<string | null> {
  const user = await getUserData<{ employeeId?: string }>()
  return user?.employeeId ?? null
}

/** Cached flag for the signed-in user; false when unknown. Never throws. */
export async function getCachedFounderFlag(): Promise<boolean> {
  try {
    const [cached, employeeId] = await Promise.all([
      get<FounderFlagAnswer>(FOUNDER_FLAG_KEY),
      currentEmployeeId(),
    ])
    return Boolean(cached && employeeId && cached.employeeId === employeeId && cached.isFounder)
  } catch (error) {
    logger.warn('Founder', 'Could not read the cached founder flag', error)
    return false
  }
}

/**
 * Ask the server, cache the answer, and return it; on failure, the cached flag.
 * See refreshFounderFlagWith for the rules.
 */
export function refreshFounderFlag(): Promise<boolean> {
  return refreshFounderFlagWith({
    query: () => apolloClient.query<MeIsFounderData>({ query: ME_IS_FOUNDER, fetchPolicy: 'network-only' }),
    saveAnswer: (answer) => save(FOUNDER_FLAG_KEY, answer),
    cachedFlag: getCachedFounderFlag,
    log: (level, message, data) => logger[level]('Founder', message, data),
  })
}

export async function clearFounderFlag(): Promise<void> {
  try {
    await remove(FOUNDER_FLAG_KEY)
  } catch (error) {
    logger.warn('Founder', 'Could not clear the founder flag', error)
  }
}
