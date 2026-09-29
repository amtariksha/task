/**
 * Dropping cached settings payloads after a write.
 *
 * Separate from ./cache-keys.ts, which stays import-free so the key rules can be
 * unit tested, and separate from the route files because a Next route module may
 * only export request handlers.
 */

import { cache } from '../cache'
import { getAllCompanies } from '../db/companies'
import { settingsCacheKeysToInvalidate } from './cache-keys'

/**
 * Drop every cached payload a write to `companyId` can change.
 *
 * A change to a PLATFORM row (companyId null) is the fallback for every company
 * without its own override, so those namespaces go too. When the read path started
 * suffixing its cache keys by company, the writers kept deleting the old
 * unsuffixed keys — so an edited department list stayed invisible for the full
 * 24-hour TTL.
 */
export async function invalidateSettingsCaches(companyId: string | null): Promise<void> {
  let others: Array<string | null> = []
  if (companyId === null) {
    try {
      others = (await getAllCompanies(true)).map((company) => company.companyId)
    } catch (error) {
      // Before migration 062 there is no companies table; the platform keys still go.
      console.warn('Could not list companies for settings cache invalidation:', error)
    }
  }
  for (const key of settingsCacheKeysToInvalidate(companyId, others)) {
    await cache.delete(key)
  }
}
