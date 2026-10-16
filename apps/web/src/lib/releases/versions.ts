/**
 * Version ordering for the Releases tab.
 *
 * Store versions are dotted numbers ("2.1.16"), occasionally with a suffix
 * ("1.4.0-beta"). Compared segment by segment as numbers, so 2.1.16 > 2.1.2 —
 * a plain string sort gets that wrong, and it is exactly the PassKard history.
 *
 * Kept free of imports so it runs under `node --test`
 * (see __tests__/releases.test.mjs).
 */

export interface VersionLike {
  version: string
  releasedAt?: string | null
}

/** True for anything that looks like a store version, i.e. starts "<digits>.". */
export function isVersionString(value: string | null | undefined): value is string {
  return !!value && /^\d+(\.\d+)*([-+ ].*)?$/.test(value.trim())
}

function splitVersion(version: string): { numbers: number[]; suffix: string } {
  const match = version.trim().match(/^(\d+(?:\.\d+)*)(.*)$/)
  if (!match) return { numbers: [], suffix: version.trim() }
  return { numbers: match[1].split('.').map(Number), suffix: match[2].trim() }
}

/** Negative when a < b, positive when a > b, 0 when they are the same release. */
export function compareVersions(a: string, b: string): number {
  const left = splitVersion(a)
  const right = splitVersion(b)
  const length = Math.max(left.numbers.length, right.numbers.length)
  for (let i = 0; i < length; i++) {
    const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0)
    if (diff !== 0) return diff
  }
  // 1.4.0 ranks above 1.4.0-beta: a bare version is the final release.
  if (left.suffix === right.suffix) return 0
  if (!left.suffix) return 1
  if (!right.suffix) return -1
  return left.suffix < right.suffix ? -1 : 1
}

/** Newest first. Equal versions fall back to the later release date. */
export function sortVersionsDesc<T extends VersionLike>(versions: T[]): T[] {
  return [...versions].sort((a, b) => {
    const byVersion = compareVersions(b.version, a.version)
    if (byVersion !== 0) return byVersion
    return (Date.parse(b.releasedAt ?? '') || 0) - (Date.parse(a.releasedAt ?? '') || 0)
  })
}

/** The two numbers the Releases card shows: what is live now, and what was before it. */
export function pickCurrentAndPrevious<T extends VersionLike>(
  versions: T[]
): { current: T | null; previous: T | null } {
  const sorted = sortVersionsDesc(versions)
  return { current: sorted[0] ?? null, previous: sorted[1] ?? null }
}
