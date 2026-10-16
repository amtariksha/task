// Fetch store listings and record their versions.
// `server-only`: these requests must come from the server — the stores do not
// allow cross-origin reads, and the parsed ids are the only input they take.

import 'server-only'
import {
  type AppStoreRef,
  type PlayStoreRef,
  appStoreLookupUrl,
  appStorePageUrl,
  playStorePageUrl,
} from './store-urls'
import {
  type StoreListing,
  type StoreVersion,
  parseAppStoreHistory,
  parseAppStoreLookup,
  parsePlayStorePage,
} from './store-parsers'
import {
  type ReleaseApp,
  recordReleaseAppSync,
  upsertStoreVersions,
} from '@/lib/db/releaseApps'

const FETCH_TIMEOUT_MS = 15_000

// A desktop browser identity: both stores serve a stripped page, or a consent
// interstitial, to clients they do not recognise.
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

function describeFetchError(store: string, error: unknown): string {
  const reason =
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      ? 'timed out'
      : error instanceof Error
        ? error.message
        : 'failed'
  return `Couldn't reach the ${store} (${reason}). It will be retried on the next sync.`
}

export interface PlatformResult {
  listing: StoreListing | null
  error: string | null
}

export interface FetchedListings {
  ios: PlatformResult | null
  android: PlatformResult | null
}

/**
 * Current version from the lookup API, full history from the store page. The
 * page is the richer source but not an API, so the lookup alone still keeps the
 * card current if Apple changes the page.
 */
export async function fetchAppStoreListing(ref: AppStoreRef): Promise<PlatformResult> {
  const [lookupResult, pageResult] = await Promise.allSettled([
    fetchText(appStoreLookupUrl(ref)).then((body) => parseAppStoreLookup(JSON.parse(body))),
    fetchText(appStorePageUrl(ref)).then(parseAppStoreHistory),
  ])

  if (lookupResult.status === 'rejected' && pageResult.status === 'rejected') {
    return { listing: null, error: describeFetchError('App Store', lookupResult.reason) }
  }

  const lookup = lookupResult.status === 'fulfilled' ? lookupResult.value : null
  const history = pageResult.status === 'fulfilled' ? pageResult.value : []

  if (!lookup && history.length === 0) {
    return {
      listing: null,
      error: `The App Store has no app with id ${ref.appId} in the "${ref.country.toUpperCase()}" storefront. Check the link.`,
    }
  }

  const versions: StoreVersion[] = [...history]
  for (const current of lookup?.versions ?? []) {
    if (!versions.some((entry) => entry.version === current.version)) versions.unshift(current)
  }

  return {
    listing: { name: lookup?.name ?? null, iconUrl: lookup?.iconUrl ?? null, versions },
    error: null,
  }
}

export async function fetchPlayStoreListing(ref: PlayStoreRef): Promise<PlatformResult> {
  let html: string
  try {
    html = await fetchText(playStorePageUrl(ref))
  } catch (error) {
    if (error instanceof Error && error.message === 'HTTP 404') {
      return { listing: null, error: `Google Play has no public app "${ref.packageName}". Check the link.` }
    }
    return { listing: null, error: describeFetchError('Play Store', error) }
  }

  const listing = parsePlayStorePage(html)
  if (!listing) {
    return { listing: null, error: 'The Play Store page could not be read. It will be retried on the next sync.' }
  }
  if (listing.versions.length === 0) {
    return {
      listing,
      error: 'The Play Store page shows no version for this app (it may say "Varies with device").',
    }
  }
  return { listing, error: null }
}

export async function fetchListings(app: {
  iosAppId: string | null
  iosCountry: string | null
  androidPackage: string | null
}): Promise<FetchedListings> {
  const [ios, android] = await Promise.all([
    app.iosAppId
      ? fetchAppStoreListing({ appId: app.iosAppId, country: app.iosCountry || 'us' })
      : Promise.resolve(null),
    app.androidPackage ? fetchPlayStoreListing({ packageName: app.androidPackage }) : Promise.resolve(null),
  ])
  return { ios, android }
}

/** Save what was fetched: new versions, per-platform errors, and an icon if the app has none. */
export async function applyListings(appId: number, fetched: FetchedListings): Promise<void> {
  if (fetched.ios?.listing) {
    await upsertStoreVersions(appId, 'ios', 'app_store', fetched.ios.listing.versions)
  }
  if (fetched.android?.listing) {
    await upsertStoreVersions(appId, 'android', 'play_store', fetched.android.listing.versions)
  }
  await recordReleaseAppSync(appId, {
    iosError: fetched.ios?.error ?? null,
    androidError: fetched.android?.error ?? null,
    iconUrl: fetched.ios?.listing?.iconUrl ?? fetched.android?.listing?.iconUrl ?? null,
  })
}

export async function syncReleaseApp(app: ReleaseApp): Promise<FetchedListings> {
  const fetched = await fetchListings(app)
  await applyListings(app.appId, fetched)
  return fetched
}
