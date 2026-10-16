/**
 * Store links → store identifiers.
 *
 * Admins paste whatever link they have: the App Store share link, the
 * apps.apple.com page, a Play Store details link with tracking params. Only the
 * identifier is kept. The server then builds its own store URL from that id, so
 * a pasted link can never make it fetch an arbitrary host.
 *
 * Kept free of imports so it runs under `node --test`
 * (see __tests__/releases.test.mjs).
 */

export interface AppStoreRef {
  /** Numeric App Store id, the "6808698579" in ".../id6808698579". */
  appId: string
  /** Two-letter storefront, "in" in "apps.apple.com/in/app/...". Defaults to "us". */
  country: string
}

export interface PlayStoreRef {
  /** Android application id, e.g. "com.ketvi.passkard". */
  packageName: string
}

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
}

const APPLE_HOSTS = new Set(['apps.apple.com', 'itunes.apple.com'])
const PLAY_HOSTS = new Set(['play.google.com'])

export function parseAppStoreUrl(raw: string): AppStoreRef | null {
  const url = parseUrl(raw)
  if (!url || !APPLE_HOSTS.has(url.hostname.toLowerCase())) return null

  const idMatch = url.pathname.match(/\/id(\d{5,})(?:\/|$)/)
  const appId = idMatch?.[1] ?? url.searchParams.get('id')
  if (!appId || !/^\d{5,}$/.test(appId)) return null

  const countryMatch = url.pathname.match(/^\/([a-z]{2})\//i)
  return { appId, country: (countryMatch?.[1] ?? 'us').toLowerCase() }
}

export function parsePlayStoreUrl(raw: string): PlayStoreRef | null {
  const url = parseUrl(raw)
  if (!url || !PLAY_HOSTS.has(url.hostname.toLowerCase())) return null
  if (!url.pathname.startsWith('/store/apps/details')) return null

  const packageName = url.searchParams.get('id')
  // Java package rules: at least two dot-separated segments, each starting with a letter.
  if (!packageName || !/^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/.test(packageName)) return null
  return { packageName }
}

/** Canonical links, built from the ids alone — what the server fetches and the UI links to. */
export function appStorePageUrl(ref: AppStoreRef): string {
  return `https://apps.apple.com/${ref.country}/app/id${ref.appId}`
}

export function appStoreLookupUrl(ref: AppStoreRef): string {
  return `https://itunes.apple.com/lookup?id=${ref.appId}&country=${ref.country}`
}

export function playStorePageUrl(ref: PlayStoreRef): string {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(ref.packageName)}&hl=en&gl=US`
}
