// Display helpers for the web /start page. Re-exports the shared pure rules so
// the page reads exactly like the push and the mobile app
// (apps/mobile/src/utils/founderFormat.ts), plus a few list helpers.
import { addDays, istDateString } from './compute-start'
import { formatDayLabel } from './start-format'

export { addDays, istDateString } from './compute-start'
export { ageLabel, closeoutFlagText, formatDayLabel, formatShortDay } from './start-format'

export function startHeader(isoDate: string): string {
  return `START · ${formatDayLabel(isoDate)}`
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

export function todayIst(): string {
  return istDateString(new Date())
}

/** "Not today" is client-only: move the given ids to the end of Top 3. Returns a new array. */
export function applyNotToday<T extends { id: string }>(top3: T[], notTodayIds: string[]): T[] {
  const kept = top3.filter((thread) => notTodayIds.indexOf(thread.id) === -1)
  const moved = top3.filter((thread) => notTodayIds.indexOf(thread.id) !== -1)
  return [...kept, ...moved]
}

/** Ranked first (by rank), then unranked by label. Returns a new array. */
export function orderForChips<T extends { rank: number | null; label: string }>(threads: T[]): T[] {
  const ranked = threads
    .filter((thread) => thread.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
  const unranked = threads.filter((thread) => thread.rank === null).sort((a, b) => a.label.localeCompare(b.label))
  return [...ranked, ...unranked]
}

/** Move an item one slot up (-1) or down (+1). Out-of-range moves return the same array. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}
