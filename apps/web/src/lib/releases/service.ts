// Rules shared by the /api/releases/* routes: who may see and change what,
// how pasted links become store ids, and how rows become the card summary.

import 'server-only'
import { NextResponse } from 'next/server'
import type { TokenPayload } from '@/lib/auth-server'
import { canAdminCompany } from '@/lib/authz'
import {
  type ReleaseApp,
  type ReleaseAppInput,
  type ReleaseAppVersion,
  getReleaseApp,
  listReleaseAppVersions,
} from '@/lib/db/releaseApps'
import { appStorePageUrl, parseAppStoreUrl, parsePlayStoreUrl, playStorePageUrl } from './store-urls'
import type { FetchedListings } from './sync'
import { isVersionString, pickCurrentAndPrevious, sortVersionsDesc } from './versions'
import type {
  ReleaseAppSummary,
  ReleaseErrorResponse,
  ReleasePlatform,
  ReleasePlatformSummary,
  ReleaseVersionEntry,
} from './types'

export function errorResponse(error: string, status: number): NextResponse<ReleaseErrorResponse> {
  return NextResponse.json({ success: false, error }, { status })
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export const NO_COMPANY_ERROR = 'No active company for this session. Sign in again or pick a company.'

/**
 * Every signed-in member sees their company's apps. A session with no company
 * (a token issued before migration 062) is refused rather than shown every
 * company's apps — these tables are new, so there are no legacy rows to keep
 * reachable the way the older routes do.
 */
export function sessionCompanyId(user: TokenPayload): string | null {
  return user.companyId ?? null
}

/** Adding, editing and removing apps is a company-admin action, like projects and feed topics. */
export async function canManageReleases(user: TokenPayload, companyId: string): Promise<boolean> {
  return canAdminCompany(user, companyId)
}

/**
 * Load an app the session may act on. Another company's app answers 404, not
 * 403, so ids cannot be probed across tenants.
 */
export async function loadAppForSession(
  user: TokenPayload,
  rawAppId: string
): Promise<{ ok: true; app: ReleaseApp; companyId: string } | { ok: false; response: NextResponse }> {
  const companyId = sessionCompanyId(user)
  if (!companyId) return { ok: false, response: errorResponse(NO_COMPANY_ERROR, 400) }

  const appId = Number(rawAppId)
  if (!Number.isInteger(appId) || appId <= 0) return { ok: false, response: errorResponse('App not found', 404) }

  const app = await getReleaseApp(appId)
  if (!app || app.companyId !== companyId) return { ok: false, response: errorResponse('App not found', 404) }

  return { ok: true, app, companyId }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 120
const MAX_URL_LENGTH = 2048
const MAX_NOTES_LENGTH = 4000

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validate an add/edit body. `name` may be blank: the caller fills it from the
 * store listing, so it is returned as given.
 */
export function parseReleaseAppBody(
  body: unknown
): { ok: true; input: ReleaseAppInput } | { ok: false; error: string } {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = trimmed(record.name)
  const iosUrl = trimmed(record.iosUrl)
  const androidUrl = trimmed(record.androidUrl)

  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `App name must be ${MAX_NAME_LENGTH} characters or fewer.` }
  if (iosUrl.length > MAX_URL_LENGTH || androidUrl.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'Store links must be 2048 characters or fewer.' }
  }
  if (!iosUrl && !androidUrl) return { ok: false, error: 'Add an App Store link, a Play Store link, or both.' }

  const ios = iosUrl ? parseAppStoreUrl(iosUrl) : null
  if (iosUrl && !ios) {
    return {
      ok: false,
      error: 'That App Store link was not recognised. Use the apps.apple.com link, e.g. https://apps.apple.com/in/app/your-app/id1234567890',
    }
  }

  const android = androidUrl ? parsePlayStoreUrl(androidUrl) : null
  if (androidUrl && !android) {
    return {
      ok: false,
      error: 'That Play Store link was not recognised. Use the details link, e.g. https://play.google.com/store/apps/details?id=com.example.app',
    }
  }

  return {
    ok: true,
    input: {
      name,
      iosUrl: ios ? iosUrl : null,
      iosAppId: ios?.appId ?? null,
      iosCountry: ios?.country ?? null,
      androidUrl: android ? androidUrl : null,
      androidPackage: android?.packageName ?? null,
    },
  }
}

export interface ManualVersionInput {
  platform: ReleasePlatform
  version: string
  releasedAt: string | null
  notes: string | null
}

export function parseManualVersionBody(
  body: unknown
): { ok: true; input: ManualVersionInput } | { ok: false; error: string } {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const platform = record.platform
  if (platform !== 'ios' && platform !== 'android') return { ok: false, error: 'Platform must be iOS or Android.' }

  const version = trimmed(record.version)
  if (!isVersionString(version) || version.length > 64) return { ok: false, error: 'Enter a version like 1.4.0.' }

  const rawDate = trimmed(record.releasedAt)
  let releasedAt: string | null = null
  if (rawDate) {
    const time = Date.parse(rawDate)
    if (!Number.isFinite(time)) return { ok: false, error: 'Release date is not a valid date.' }
    if (time > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, error: 'Release date cannot be in the future.' }
    releasedAt = new Date(time).toISOString()
  }

  const notes = trimmed(record.notes)
  if (notes.length > MAX_NOTES_LENGTH) return { ok: false, error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` }

  return { ok: true, input: { platform, version, releasedAt, notes: notes || null } }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function toEntry(row: ReleaseAppVersion): ReleaseVersionEntry {
  return {
    id: row.id,
    version: row.version,
    releasedAt: row.releasedAt,
    firstSeenAt: row.firstSeenAt,
    notes: row.releaseNotes,
    source: row.source,
  }
}

function platformSummary(storeUrl: string, rows: ReleaseAppVersion[], syncError: string | null): ReleasePlatformSummary {
  const history = sortVersionsDesc(rows.map(toEntry))
  const { current, previous } = pickCurrentAndPrevious(history)
  return { storeUrl, current, previous, history, syncError }
}

export function summarizeApp(app: ReleaseApp, versions: ReleaseAppVersion[]): ReleaseAppSummary {
  const forApp = versions.filter((row) => row.appId === app.appId)
  return {
    appId: app.appId,
    name: app.name,
    iconUrl: app.iconUrl,
    iosUrl: app.iosUrl,
    androidUrl: app.androidUrl,
    lastSyncedAt: app.lastSyncedAt,
    ios: app.iosAppId
      ? platformSummary(
          appStorePageUrl({ appId: app.iosAppId, country: app.iosCountry || 'us' }),
          forApp.filter((row) => row.platform === 'ios'),
          app.iosSyncError
        )
      : null,
    android: app.androidPackage
      ? platformSummary(
          playStorePageUrl({ packageName: app.androidPackage }),
          forApp.filter((row) => row.platform === 'android'),
          app.androidSyncError
        )
      : null,
  }
}

/** Re-read one app after a write, so the response shows exactly what is stored. */
export async function loadAppSummary(appId: number): Promise<ReleaseAppSummary | null> {
  const app = await getReleaseApp(appId)
  if (!app) return null
  return summarizeApp(app, await listReleaseAppVersions([appId]))
}

/**
 * A store link that resolves to nothing is a typo, so add/edit refuses it. A
 * listing that was read but shows no version ("Varies with device") is accepted:
 * the card explains it, and the next sync may find one.
 */
export function listingProblem(fetched: FetchedListings): string | null {
  if (fetched.ios && !fetched.ios.listing) return fetched.ios.error
  if (fetched.android && !fetched.android.listing) return fetched.android.error
  return null
}

export function nameFromListings(fetched: FetchedListings): string | null {
  return fetched.ios?.listing?.name || fetched.android?.listing?.name || null
}

/** node-postgres reports a unique-index violation as SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === '23505'
}
