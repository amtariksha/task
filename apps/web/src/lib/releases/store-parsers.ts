/**
 * Read version data out of what the two stores publish.
 *
 *   App Store lookup  itunes.apple.com/lookup?id=… — a documented JSON API.
 *                     Current version only, but stable: the fallback.
 *   App Store page    apps.apple.com/<cc>/app/id… — embeds a
 *                     <script id="serialized-server-data"> JSON blob whose
 *                     "versionHistory" page lists every release with its date
 *                     and notes. This is where full iOS history comes from.
 *   Play Store page   play.google.com/store/apps/details?id=… — Google publishes
 *                     no version history at all. The page embeds the CURRENT
 *                     version under key "141", the update date under "146" and
 *                     "What's new" under "145". History builds up from syncing.
 *
 * Neither page is an API; both can change shape without notice. Every parser
 * returns null/[] instead of throwing so a layout change shows up as a sync
 * error on the card, never as a broken tab.
 *
 * Kept free of imports so it runs under `node --test`
 * (see __tests__/releases.test.mjs).
 */

export interface StoreVersion {
  version: string
  /** ISO-8601, UTC. */
  releasedAt: string | null
  notes: string | null
}

export interface StoreListing {
  name: string | null
  iconUrl: string | null
  /** Newest first as the store lists them; may be empty when the store hides the version. */
  versions: StoreVersion[]
}

const VERSION_RE = /^\d+(\.\d+)*([-+ ].*)?$/

function cleanVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.replace(/^version\s+/i, '').trim()
  return VERSION_RE.test(value) ? value : null
}

function toIso(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  // App Store page dates read "Fri Oct 16 2026 14:54:53 GMT+0000 (Coordinated
  // Universal Time)"; the trailing zone name is not parseable everywhere.
  const value = typeof raw === 'string' ? raw.replace(/\s*\([^)]*\)\s*$/, '') : raw
  const time = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function cleanNotes(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function dedupeVersions(versions: StoreVersion[]): StoreVersion[] {
  const seen = new Set<string>()
  return versions.filter((entry) => {
    if (seen.has(entry.version)) return false
    seen.add(entry.version)
    return true
  })
}

// ---------------------------------------------------------------------------
// App Store
// ---------------------------------------------------------------------------

/** itunes.apple.com/lookup response → current listing. */
export function parseAppStoreLookup(body: unknown): StoreListing | null {
  const result = (body as { results?: Record<string, unknown>[] } | null)?.results?.[0]
  if (!result) return null

  const version = cleanVersion(result.version)
  return {
    name: typeof result.trackName === 'string' ? result.trackName : null,
    iconUrl:
      typeof result.artworkUrl512 === 'string'
        ? result.artworkUrl512
        : typeof result.artworkUrl100 === 'string'
          ? result.artworkUrl100
          : null,
    versions: version
      ? [{ version, releasedAt: toIso(result.currentVersionReleaseDate), notes: cleanNotes(result.releaseNotes) }]
      : [],
  }
}

/** apps.apple.com page HTML → every version in its "Version History". */
export function parseAppStoreHistory(html: string): StoreVersion[] {
  const match = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return []

  let data: unknown
  try {
    data = JSON.parse(match[1])
  } catch {
    return []
  }

  const found: StoreVersion[] = []
  const stack: unknown[] = [data]
  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child)
      continue
    }
    if (!node || typeof node !== 'object') continue

    const record = node as Record<string, unknown>
    const pageData = record.pageData as { shelves?: { items?: Record<string, unknown>[] }[] } | undefined
    if (record.page === 'versionHistory' && pageData?.shelves) {
      for (const shelf of pageData.shelves) {
        for (const item of shelf.items ?? []) {
          const version = cleanVersion(item.primarySubtitle)
          if (version) {
            found.push({ version, releasedAt: toIso(item.secondarySubtitle), notes: cleanNotes(item.text) })
          }
        }
      }
    }
    for (const child of Object.values(record)) stack.push(child)
  }

  return dedupeVersions(found)
}

// ---------------------------------------------------------------------------
// Play Store
// ---------------------------------------------------------------------------

function metaContent(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))
  return match ? decodeEntities(match[1]) : null
}

function jsonString(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return null
  }
}

/** play.google.com details page HTML → current listing. */
export function parsePlayStorePage(html: string): StoreListing | null {
  const title = metaContent(html, 'og:title')
  if (!title && !html.includes('AF_initDataCallback')) return null

  // Key "141" is the current version; the second pattern is the same array
  // without its key, in case Google renumbers.
  const versionMatch =
    html.match(/"141":\[\[\["([^"]+)"\]\]/) ?? html.match(/\[\[\["(\d+(?:\.\d+)+[^"]*)"\]\],\[\[\[\d+\]\]/)
  const version = cleanVersion(versionMatch?.[1])

  const dateMatch = html.match(/"146":\[\["[^"]*",\[(\d{9,11})/)
  const notesMatch = html.match(/"145":\[null,\[null,"((?:[^"\\]|\\.)*)"/)

  return {
    name: title ? title.replace(/\s+-\s+Apps on Google Play$/i, '').trim() || null : null,
    iconUrl: metaContent(html, 'og:image'),
    versions: version
      ? [
          {
            version,
            releasedAt: dateMatch ? toIso(Number(dateMatch[1]) * 1000) : null,
            notes: notesMatch ? cleanNotes(jsonString(notesMatch[1])) : null,
          },
        ]
      : [],
  }
}
