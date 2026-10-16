// Shapes returned by /api/releases/* — shared by the route handlers and the
// Releases page. Type-only, so the page can import it without pulling server code.

export type ReleasePlatform = 'ios' | 'android'
export type ReleaseVersionSource = 'app_store' | 'play_store' | 'manual'

export interface ReleaseVersionEntry {
  id: number
  version: string
  /** The store's date for this version (ISO-8601), when it gives one. */
  releasedAt: string | null
  /** When the dashboard first saw this version (ISO-8601). */
  firstSeenAt: string
  notes: string | null
  source: ReleaseVersionSource
}

export interface ReleasePlatformSummary {
  /** Canonical store link built from the stored id. */
  storeUrl: string
  current: ReleaseVersionEntry | null
  previous: ReleaseVersionEntry | null
  /** Newest first. */
  history: ReleaseVersionEntry[]
  syncError: string | null
}

export interface ReleaseAppSummary {
  appId: number
  name: string
  iconUrl: string | null
  /** The links as the admin pasted them — what the edit form shows. */
  iosUrl: string | null
  androidUrl: string | null
  lastSyncedAt: string | null
  ios: ReleasePlatformSummary | null
  android: ReleasePlatformSummary | null
}

export interface ReleasesListResponse {
  success: true
  apps: ReleaseAppSummary[]
  /** Whether this viewer may add, edit and remove apps and versions. */
  canManage: boolean
}

export interface ReleaseAppResponse {
  success: true
  app: ReleaseAppSummary
}

export interface ReleaseErrorResponse {
  success: false
  error: string
}
