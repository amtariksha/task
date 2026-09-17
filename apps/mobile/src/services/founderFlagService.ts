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

const FOUNDER_FLAG_KEY = 'founder_flag'

interface CachedFounderFlag {
  employeeId: string
  isFounder: boolean
}

interface MeIsFounderData {
  me: { employeeId: string; isFounder: boolean } | null
}

async function currentEmployeeId(): Promise<string | null> {
  const user = await getUserData<{ employeeId?: string }>()
  return user?.employeeId ?? null
}

/** Cached flag for the signed-in user; false when unknown. Never throws. */
export async function getCachedFounderFlag(): Promise<boolean> {
  try {
    const [cached, employeeId] = await Promise.all([
      get<CachedFounderFlag>(FOUNDER_FLAG_KEY),
      currentEmployeeId(),
    ])
    return Boolean(cached && employeeId && cached.employeeId === employeeId && cached.isFounder)
  } catch (error) {
    console.warn('[founder] could not read cached founder flag:', error)
    return false
  }
}

/**
 * Ask the server, cache the answer, and return it. On a network/API error the
 * cached value is returned instead, so an offline founder still lands on Start.
 */
export async function refreshFounderFlag(): Promise<boolean> {
  try {
    const result = await apolloClient.query<MeIsFounderData>({
      query: ME_IS_FOUNDER,
      fetchPolicy: 'network-only',
    })
    const me = result.data?.me
    if (!me || result.error) {
      return getCachedFounderFlag()
    }
    await save(FOUNDER_FLAG_KEY, { employeeId: me.employeeId, isFounder: me.isFounder === true })
    return me.isFounder === true
  } catch (error) {
    console.warn('[founder] could not refresh founder flag:', error)
    return getCachedFounderFlag()
  }
}

export async function clearFounderFlag(): Promise<void> {
  try {
    await remove(FOUNDER_FLAG_KEY)
  } catch (error) {
    console.warn('[founder] could not clear founder flag:', error)
  }
}
