/**
 * Founder Start display helpers. Mirrors apps/web/src/lib/founder/start-format.ts
 * so the app, the 09:00 push and Claude's brief read the same way. Pure: no
 * React Native imports, so `node --experimental-strip-types --test` can load it.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_OFFSET_MS = 330 * 60 * 1000

/** IST calendar date (YYYY-MM-DD) of an instant. IST has no DST, so a fixed offset is exact. */
export function istDateString(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 'Tue 16 Sep' */
export function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** 'Fri 12' */
export function formatShortDay(isoDate: string): string {
  return formatDayLabel(isoDate).split(' ').slice(0, 2).join(' ')
}

/** 'START · Tue 16 Sep' */
export function startHeader(isoDate: string): string {
  return `START · ${formatDayLabel(isoDate)}`
}

/** 'today' | 'yesterday' | '3d' | '4d ⚠' | 'never ⚠' */
export function ageLabel(daysSinceTouched: number | null, isStale: boolean): string {
  if (daysSinceTouched === null) return 'never ⚠'
  if (daysSinceTouched === 0) return 'today'
  if (daysSinceTouched === 1) return 'yesterday'
  return isStale ? `${daysSinceTouched}d ⚠` : `${daysSinceTouched}d`
}

export function closeoutFlagText(lastCloseoutDate: string | null): string {
  return lastCloseoutDate
    ? `No close-out since ${formatShortDay(lastCloseoutDate)} — next actions may be stale.`
    : 'No close-out yet — next actions may be stale.'
}

/** Push is paused while pausedUntil is today or later (IST). */
export function isPauseActive(pausedUntil: string | null, todayIst: string): boolean {
  return pausedUntil !== null && pausedUntil >= todayIst
}

export function pausedText(pausedUntil: string): string {
  return `Paused until ${formatDayLabel(pausedUntil)}`
}

export function dueLabel(dueDate: string | null, todayIst: string): string {
  if (!dueDate) return 'no due date'
  if (dueDate < todayIst) return `overdue · ${formatDayLabel(dueDate)}`
  if (dueDate === todayIst) return 'due today'
  if (dueDate === addDays(todayIst, 1)) return 'due tomorrow'
  return `due ${formatDayLabel(dueDate)}`
}

/** Local calendar date of a picker value → YYYY-MM-DD (the picker works in device-local time). */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1)
  const day = String(date.getDate())
  return `${date.getFullYear()}-${month.length === 1 ? `0${month}` : month}-${day.length === 1 ? `0${day}` : day}`
}

/**
 * "Not today" is client-only: push the given ids to the end of Top 3,
 * keeping everything else in server order. Returns a new array.
 */
export function applyNotToday<T extends { id: string }>(top3: T[], notTodayIds: string[]): T[] {
  const kept = top3.filter((thread) => notTodayIds.indexOf(thread.id) === -1)
  const moved = top3.filter((thread) => notTodayIds.indexOf(thread.id) !== -1)
  return [...kept, ...moved]
}

/** Threads ordered for the close-out chips: ranked first (by rank), then unranked by label. */
export function orderForChips<T extends { rank: number | null; label: string }>(threads: T[]): T[] {
  const ranked = threads.filter((thread) => thread.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
  const unranked = threads.filter((thread) => thread.rank === null)
    .sort((a, b) => a.label.localeCompare(b.label))
  return [...ranked, ...unranked]
}

/** Move an item one slot up (-1) or down (+1). Returns a new array; out-of-range moves are no-ops. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}
