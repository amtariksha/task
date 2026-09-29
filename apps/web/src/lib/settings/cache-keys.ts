/**
 * Cache keys for the settings endpoints.
 *
 * Settings became two-tier in migration 062: a company's own row overrides the
 * platform default, so every cached payload is specific to one company. The read
 * path was changed to suffix its keys accordingly, but the write paths kept
 * deleting the old unsuffixed keys — so a company admin could change a department
 * list and not see it for 24 hours. Both sides now build their keys here.
 *
 * No imports, so the keys are covered by __tests__/cache-keys.test.mjs.
 */

/** A company's own cache namespace; platform-level rows use 'platform'. */
export function settingsCacheScope(companyId: string | null | undefined): string {
  return companyId ?? 'platform'
}

export function groupedSettingsKey(companyId: string | null | undefined): string {
  return `settings_grouped_${settingsCacheScope(companyId)}`
}

export function dropdownSettingsKey(companyId: string | null | undefined): string {
  return `settings_dropdowns_${settingsCacheScope(companyId)}`
}

export function allSettingsKey(companyId: string | null | undefined, activeOnly: boolean): string {
  return `settings_all_active_${activeOnly ? '1' : '0'}_${settingsCacheScope(companyId)}`
}

/**
 * Every key a write must drop.
 *
 * A change to a PLATFORM row (company_id IS NULL) is visible to every company
 * that has no override of its own, so its cached payloads have to go too — hence
 * `alsoCompanyIds`. Callers pass the companies that exist; there is no way to
 * invalidate a namespace by prefix through the cache interface.
 */
export function settingsCacheKeysToInvalidate(
  companyId: string | null | undefined,
  alsoCompanyIds: Array<string | null> = []
): string[] {
  const scopes = new Set<string | null>([companyId ?? null, ...alsoCompanyIds])
  // A company row only affects that company; a platform row affects everyone.
  if ((companyId ?? null) === null) scopes.add(null)

  const keys: string[] = []
  for (const scope of Array.from(scopes)) {
    keys.push(groupedSettingsKey(scope), dropdownSettingsKey(scope), allSettingsKey(scope, true), allSettingsKey(scope, false))
  }
  return Array.from(new Set(keys))
}
