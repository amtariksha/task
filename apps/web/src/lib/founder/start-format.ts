// Plain-text rendering for the founder Start card and its push body.
// Type-only imports keep this loadable by `node --experimental-strip-types`.
import type { ScoredThread } from './compute-start'

export const PUSH_BODY_MAX = 180

const SEPARATOR = ' · '
const ELLIPSIS = '…'

export interface StartWaitingItem {
  kind: 'task' | 'bug'
  id: string
  title: string
  dueDate: string | null
  projectName: string | null
  status: string | null
}

export interface StartCardInput {
  date: string
  top3: ScoredThread[]
  accordion: ScoredThread[]
  waitingOnMe: StartWaitingItem[]
  closeoutOverdue: boolean
  lastCloseoutDate: string | null
}

// Fixed names rather than Intl: ICU versions disagree ('Sep' vs 'Sept') and the
// push text must read the same on Vercel, locally and in Claude's brief.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Tue 16 Sep' for an IST calendar date (YYYY-MM-DD). */
export function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** 'Fri 12' for an IST calendar date. */
export function formatShortDay(isoDate: string): string {
  return formatDayLabel(isoDate).split(' ').slice(0, 2).join(' ')
}

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

const squash = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim()

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  if (maxLength <= 1) return ''
  return `${text.slice(0, maxLength - 1).trimEnd()}${ELLIPSIS}`
}

// Water-filling: short actions keep their full length, the rest share what's left.
function fairShare(lengths: number[], budget: number): number[] {
  const order = lengths.map((length, index) => ({ length, index })).sort((a, b) => a.length - b.length)
  const allowed = lengths.map(() => 0)
  let remaining = Math.max(0, budget)
  order.forEach((entry, position) => {
    const share = Math.floor(remaining / (order.length - position))
    const granted = Math.min(entry.length, share)
    allowed[entry.index] = granted
    remaining -= granted
  })
  return allowed
}

/** `1. <label> · <next action>` per Top 3 thread, at most `maxLength` chars in total. */
export function renderPushBody(
  top: Array<Pick<ScoredThread, 'label' | 'nextAction'>>,
  maxLength: number = PUSH_BODY_MAX
): string {
  if (top.length === 0) return ''
  const prefixes = top.map((thread, index) => `${index + 1}. ${squash(thread.label)}`)
  const actions = top.map((thread) => squash(thread.nextAction))
  const withAction = actions.filter((action) => action.length > 0).length
  const fixed =
    prefixes.reduce((sum, prefix) => sum + prefix.length, 0) + (top.length - 1) + SEPARATOR.length * withAction
  const allowed = fairShare(actions.map((action) => action.length), maxLength - fixed)

  const lines = prefixes.map((prefix, index) => {
    const action = truncate(actions[index], allowed[index])
    return action ? `${prefix}${SEPARATOR}${action}` : prefix
  })
  return truncate(lines.join('\n'), maxLength)
}

function threadLine(thread: ScoredThread): string {
  const action = hasAction(thread) ? squash(thread.nextAction) : 'no next action'
  const waiting = squash(thread.waitingOn)
  const waitingPart = waiting ? ` · waiting on ${waiting}` : ''
  return `${thread.label} · ${action} · ${ageLabel(thread.daysSinceTouched, thread.isStale)}${waitingPart}`
}

const hasAction = (thread: ScoredThread): boolean => squash(thread.nextAction).length > 0

/** The full Start card as plain text — stored as the `start` check-in note. */
export function renderStartCard(card: StartCardInput): string {
  const lines = [`START · ${formatDayLabel(card.date)}`]
  if (card.closeoutOverdue) lines.push(closeoutFlagText(card.lastCloseoutDate))

  lines.push('', 'Top 3')
  if (card.top3.length === 0) lines.push('(nothing ranked with a next action)')
  card.top3.forEach((thread, index) => lines.push(`${index + 1}. ${threadLine(thread)}`))

  if (card.accordion.length > 0) {
    lines.push('', 'Other threads')
    card.accordion.forEach((thread) => lines.push(`- ${threadLine(thread)}`))
  }

  if (card.waitingOnMe.length > 0) {
    lines.push('', 'Waiting on you')
    card.waitingOnMe.forEach((item) => {
      const due = item.dueDate ? ` (due ${formatDayLabel(item.dueDate)})` : ''
      const project = item.projectName ? ` · ${item.projectName}` : ''
      lines.push(`- ${item.id} ${item.title}${project}${due}`)
    })
  }
  return lines.join('\n')
}
