/**
 * Company service (mobile).
 *
 * Mirrors the web app's company layer added in migration 062. Most people
 * belong to exactly one company and never interact with this; it exists for
 * consultants and platform staff who span several.
 *
 * Switching re-issues the auth token server-side — membership is verified
 * there, so the companyId sent from the device is a request, not an assertion.
 */

import { get, post } from './apiClient'
import { saveUserToken, saveUserData, getUserData } from '../utils/secureStorage'
import type { CompanyMembership, User } from '../types'

/** Companies the signed-in user belongs to. */
export async function getMyCompanies(): Promise<CompanyMembership[]> {
  try {
    const result = await get('/api/companies')
    return result?.success ? (result.data as CompanyMembership[]) : []
  } catch (error) {
    // Non-essential: a device on an older build, or a server that has not run
    // migration 062, simply has no companies to offer.
    console.warn('Failed to load companies:', error)
    return []
  }
}

export interface SwitchCompanyResult {
  success: boolean
  user?: User
  error?: string
}

/**
 * Re-scope the session to another company. On success the new token and user
 * are persisted, so subsequent requests are scoped to the chosen tenant.
 * Callers should refresh any loaded lists afterwards — data from the previous
 * company must not stay on screen.
 */
export async function switchCompany(companyId: string): Promise<SwitchCompanyResult> {
  try {
    // issueAuthToken returns the re-scoped JWT alongside the user; ApiResponse
    // does not model that extra field, so widen it here.
    const result = (await post('/api/companies/switch', { companyId })) as {
      success: boolean
      data?: User
      token?: string
      error?: string
    }

    if (!result?.success) {
      return { success: false, error: result?.error || 'Could not switch company' }
    }

    if (result.token) {
      await saveUserToken(result.token)
    }
    if (result.data) {
      await saveUserData(result.data)
    }

    return { success: true, user: result.data as User }
  } catch (error) {
    console.error('Failed to switch company:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not switch company',
    }
  }
}

/** The company the current session is scoped to, if any. */
export async function getActiveCompanyId(): Promise<string | null> {
  const user = await getUserData<User>()
  return user?.companyId ?? null
}

/**
 * Is the signed-in user an admin of the company this session is acting in?
 *
 * This is the company tier of the server's three-tier model (platform → company →
 * project). Screens need it to decide what to draw; the server decides for real
 * (lib/authz.canAdminCompany), so a stale answer here costs a 403, not access.
 */
export async function isActiveCompanyAdmin(): Promise<boolean> {
  const user = await getUserData<User>()
  if (!user) return false
  if (user.isPlatformAdmin) return true
  if (!user.companyId) return false

  const companies = await getMyCompanies()
  const active = companies.find((c) => c.companyId === user.companyId)
  return active?.companyRole === 'company_admin'
}
