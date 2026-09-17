// Founder Start rules (build spec §4) — the single source of truth used by the
// founderStart query and the 09:00 push job. Claude's daily brief implements the
// same rules independently, so change them in both places or not at all.
//
// Pure and import-free on purpose: `node --experimental-strip-types --test`
// loads this file directly, so keep to erasable TypeScript (no enums,
// namespaces or parameter properties).

export interface StartThread {
  id: number
  label: string
  projectId: string | null
  projectName: string | null
  nextAction: string | null
  nextActionSetAt: Date | null
  rank: number | null
  waitingOn: string | null
  lastTouchedAt: Date | null
  lastTouchedSource: string | null
  isActive: boolean
}

export interface StartTeamActivity {
  resumePointId: number
  count: number
  titles: string[]
  latestAt: Date | null
}

export interface ScoredThread extends StartThread {
  daysSinceTouched: number | null
  isStale: boolean
}

export interface DerivedTouch {
  id: number
  touchedAt: Date
}

export interface StartComputation {
  date: string
  top3: ScoredThread[]
  accordion: ScoredThread[]
  derivedTouches: DerivedTouch[]
}

export const STALE_AFTER_DAYS = 4
export const TOP_COUNT = 3
export const IST_TIME_ZONE = 'Asia/Kolkata'

const MS_PER_DAY = 86400000

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Kolkata. */
export function istDateString(instant: Date): string {
  // en-CA renders as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`)
  const to = Date.parse(`${toIsoDate}T00:00:00Z`)
  return Math.round((to - from) / MS_PER_DAY)
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** A thread enters Top 3 only with both a next action and a weekly rank. */
export function qualifiesForTop(thread: StartThread): boolean {
  return hasText(thread.nextAction) && thread.rank !== null
}

export function scoreThread(thread: StartThread, todayIst: string): ScoredThread {
  if (!thread.lastTouchedAt) {
    return { ...thread, daysSinceTouched: null, isStale: true }
  }
  // A hook may report a slightly future occurredAt; never show negative ages.
  const daysSinceTouched = Math.max(0, daysBetween(istDateString(thread.lastTouchedAt), todayIst))
  return { ...thread, daysSinceTouched, isStale: daysSinceTouched >= STALE_AFTER_DAYS }
}

/** Team activity newer than the thread's last touch counts as a touch. */
export function applyDerivedTouch(thread: StartThread, activity: StartTeamActivity | undefined): StartThread {
  const latest = activity?.latestAt
  if (!latest) return thread
  if (thread.lastTouchedAt && thread.lastTouchedAt.getTime() >= latest.getTime()) return thread
  return { ...thread, lastTouchedAt: latest, lastTouchedSource: 'karmayog' }
}

const touchTime = (thread: StartThread): number | null =>
  thread.lastTouchedAt ? thread.lastTouchedAt.getTime() : null

function byRank(a: StartThread, b: StartThread): number {
  return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.id - b.id
}

// Never touched sorts as the oldest possible touch.
function byOldestTouchThenRank(a: StartThread, b: StartThread): number {
  const aTime = touchTime(a) ?? Number.NEGATIVE_INFINITY
  const bTime = touchTime(b) ?? Number.NEGATIVE_INFINITY
  if (aTime !== bTime) return aTime < bTime ? -1 : 1
  return byRank(a, b)
}

// Most recent first; never touched last.
function byRecentTouch(a: StartThread, b: StartThread): number {
  const aTime = touchTime(a) ?? Number.NEGATIVE_INFINITY
  const bTime = touchTime(b) ?? Number.NEGATIVE_INFINITY
  if (aTime !== bTime) return aTime > bTime ? -1 : 1
  return a.label.localeCompare(b.label)
}

export function pickTop(threads: ScoredThread[]): ScoredThread[] {
  const qualifying = threads.filter(qualifiesForTop)
  const rankOne = qualifying.filter((thread) => thread.rank === 1).sort(byRank)[0]
  const rest = qualifying.filter((thread) => thread !== rankOne)
  const stale = rest.filter((thread) => thread.isStale).sort(byOldestTouchThenRank)
  const fresh = rest.filter((thread) => !thread.isStale).sort(byRank)
  const ordered = rankOne ? [rankOne, ...stale, ...fresh] : [...stale, ...fresh]
  return ordered.slice(0, TOP_COUNT)
}

export function orderAccordion(threads: ScoredThread[]): ScoredThread[] {
  const ranked = threads.filter((thread) => thread.rank !== null).sort(byRank)
  const unranked = threads.filter((thread) => thread.rank === null).sort(byRecentTouch)
  return [...ranked, ...unranked]
}

/** Start flags the close-out when the last one is older than yesterday (or never happened). */
export function isCloseoutOverdue(lastCloseoutDate: string | null, todayIst: string): boolean {
  return lastCloseoutDate === null || lastCloseoutDate < addDays(todayIst, -1)
}

export function computeStart(
  threads: StartThread[],
  activity: StartTeamActivity[],
  now: Date
): StartComputation {
  const today = istDateString(now)
  const active = threads.filter((thread) => thread.isActive)
  const touched = active.map((thread) =>
    applyDerivedTouch(thread, activity.find((entry) => entry.resumePointId === thread.id))
  )
  const derivedTouches = touched
    .filter((thread, index) => thread !== active[index] && thread.lastTouchedAt !== null)
    .map((thread) => ({ id: thread.id, touchedAt: thread.lastTouchedAt as Date }))

  const scored = touched.map((thread) => scoreThread(thread, today))
  const top3 = pickTop(scored)
  const topIds = top3.map((thread) => thread.id)
  const accordion = orderAccordion(scored.filter((thread) => topIds.indexOf(thread.id) === -1))

  return { date: today, top3, accordion, derivedTouches }
}
