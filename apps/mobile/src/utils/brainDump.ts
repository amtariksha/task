/**
 * Founder Brain dump: turns a typed or dictated list into close-out entries.
 * Pure: no React Native imports, so `node --experimental-strip-types --test` can load it.
 *
 * The rules mirror the server's close-out (apps/web/src/graphql/founder-resolvers.ts and
 * apps/web/src/lib/db/founder-writes.ts): text is trimmed and measured in JS string length,
 * a label resolves to any thread with the same lower-cased label (parked ones included),
 * and the whole close-out is saved together or not at all.
 */

/** Server limits: founder-resolvers.ts MAX_LABEL, MAX_TEXT and MAX_ENTRIES. */
export const MAX_LABEL_LENGTH = 120
export const MAX_NEXT_ACTION_LENGTH = 2000
export const MAX_ENTRIES = 50

const DRAFT_VERSION = 1
const DRAFT_KEY_PREFIX = 'founder_brain_dump'

const BULLET = /^\s*(?:[-*•]|\d+[.)])(?=\s|$)/
// ' -> ', ' → ' or ': ', also at the start or end of the line; \s covers dictation's non-breaking spaces.
const SEPARATOR = /(?:^|\s)(?:->|→)(?=\s|$)|:(?=\s|$)/

export interface ParsedLine { label: string; nextAction: string }
export interface BrainDumpRow { key: string; label: string; nextAction: string }
export interface BrainDumpThread { id: string; label: string; isActive: boolean; nextAction: string | null }
/** Only label and nextAction: a waitingOn key, even null, would clear the matched thread's waiting-on. */
export interface BrainDumpEntry { label: string; nextAction?: string }

export type RowStatus = 'new' | 'active' | 'parked' | 'unknown'
export type FlagTone = 'neutral' | 'info' | 'warning' | 'error'
export interface RowFlag { text: string; tone: FlagTone }

export interface RowReview {
  key: string
  status: RowStatus
  thread: BrainDumpThread | null
  flags: RowFlag[]
  /** A line under the flags, e.g. the next action an active thread has now. */
  detail: string | null
  hasError: boolean
}

export interface BrainDumpReview {
  rows: RowReview[]
  entries: BrainDumpEntry[]
  errorRowCount: number
}

export type ThreadsState = 'loading' | 'failed' | 'ready'

export interface SaveBlockerInput {
  isOffline: boolean
  threads: ThreadsState
  rowCount: number
  review: BrainDumpReview
}

export interface BrainDumpDraft { text: string; review: BrainDumpRow[] | null }
/** loading: reading the stored draft; unavailable: there is nowhere to keep it (no employee id, or the read failed). */
export type DraftStatus = 'loading' | 'idle' | 'pending' | 'saved' | 'failed' | 'unavailable'
export interface StoredBrainDumpDraft extends BrainDumpDraft { version: number; updatedAt: string }

/** null for a line with nothing on it (blank, a bare bullet or a bare separator). */
export function parseLine(line: string): ParsedLine | null {
  const rest = line.replace(BULLET, '')
  const separator = SEPARATOR.exec(rest)
  const label = (separator ? rest.slice(0, separator.index) : rest).trim()
  const nextAction = separator ? rest.slice(separator.index + separator[0].length).trim() : ''
  return label || nextAction ? { label, nextAction } : null
}

/** One row per non-blank line. Keys are line numbers, so they stay stable while the rows are edited. */
export function parseBrainDump(text: string): BrainDumpRow[] {
  return text.split(/\r\n|\r|\n/).flatMap((line, index) => {
    const parsed = parseLine(line)
    return parsed ? [{ key: `line-${index + 1}`, ...parsed }] : []
  })
}

export function thoughtCountText(count: number): string {
  return `${count} ${count === 1 ? 'thought' : 'thoughts'}`
}

/** What the server compares: lower(label) on the trimmed label. Inner whitespace is not collapsed. */
function matchKey(label: string): string {
  return label.trim().toLowerCase()
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function lengthProblems(label: string, nextAction: string): RowFlag[] {
  const problems: RowFlag[] = []
  if (!label) problems.push({ text: 'Needs a label', tone: 'error' })
  if (label.length > MAX_LABEL_LENGTH) {
    problems.push({ text: `Label is ${label.length} characters — limit ${MAX_LABEL_LENGTH}`, tone: 'error' })
  }
  if (nextAction.length > MAX_NEXT_ACTION_LENGTH) {
    problems.push({ text: `Next action is ${nextAction.length} characters — limit ${MAX_NEXT_ACTION_LENGTH}`, tone: 'error' })
  }
  return problems
}

interface StatusNotes { flags: RowFlag[]; detail: string | null }

function statusNotes(status: RowStatus, thread: BrainDumpThread | null, nextAction: string): StatusNotes {
  if (status === 'unknown') return { flags: [], detail: null }
  if (status === 'new') {
    const flags: RowFlag[] = [{ text: 'New thread', tone: 'neutral' }]
    if (!nextAction) {
      flags.push({ text: 'No next action — stays out of the Top 3 until it has one and a rank', tone: 'info' })
    }
    return { flags, detail: null }
  }
  const nothingToSave = 'nothing to save. Add a next action to update it.'
  if (status === 'active') {
    return nextAction
      ? {
        flags: [{ text: 'Already on Start — replaces its next action', tone: 'info' }],
        detail: `Now: ${thread?.nextAction ?? 'no next action'}`,
      }
      : { flags: [{ text: `Already on Start — ${nothingToSave}`, tone: 'neutral' }], detail: null }
  }
  return nextAction
    ? {
      flags: [{ text: 'Parked — gets this next action but stays parked and hidden from Start', tone: 'warning' }],
      detail: 'To see it on Start, unpark it from ⋮ → Show parked.',
    }
    : { flags: [{ text: `Parked — ${nothingToSave}`, tone: 'neutral' }], detail: null }
}

interface Group { indexes: number[]; nextActions: string[] }
interface ReviewedRow { review: RowReview; entry: BrainDumpEntry | null }

/** Rows with the same label, in order. The server would apply each to one thread, so they are merged or blocked. */
function groupByLabel(labels: string[], nextActions: string[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  labels.forEach((label, index) => {
    if (!label || label.length > MAX_LABEL_LENGTH) return
    const key = matchKey(label)
    const group = groups.get(key) ?? { indexes: [], nextActions: [] }
    const nextAction = nextActions[index]
    groups.set(key, {
      indexes: [...group.indexes, index],
      nextActions: nextAction && !group.nextActions.includes(nextAction) ? [...group.nextActions, nextAction] : group.nextActions,
    })
  })
  return groups
}

function findThread(label: string, threads: BrainDumpThread[]): BrainDumpThread | null {
  const key = matchKey(label)
  return threads.find((thread) => matchKey(thread.label) === key) ?? null
}

function statusOf(thread: BrainDumpThread | null, threadsLoaded: boolean): RowStatus {
  if (!threadsLoaded) return 'unknown'
  if (!thread) return 'new'
  return thread.isActive ? 'active' : 'parked'
}

/**
 * Flags every row and builds the close-out entries. `threads` must include parked ones
 * (founderResumePoints with includeParked: true); null while they are still loading.
 */
export function reviewBrainDump(rows: BrainDumpRow[], threads: BrainDumpThread[] | null): BrainDumpReview {
  const labels = rows.map((item) => item.label.trim())
  const nextActions = rows.map((item) => item.nextAction.trim())
  const groups = groupByLabel(labels, nextActions)

  const results = rows.map((item, index): ReviewedRow => {
    const problems = lengthProblems(labels[index], nextActions[index])
    const group = groups.get(matchKey(labels[index]))
    const thread = group && threads ? findThread(labels[index], threads) : null
    const status = group ? statusOf(thread, threads !== null) : 'unknown'
    const base = { key: item.key, status, thread }
    if (!group) return { review: { ...base, flags: problems, detail: null, hasError: true }, entry: null }

    const [first] = group.indexes
    if (group.nextActions.length > 1) {
      const other = group.indexes.find((candidate) => candidate !== index) ?? first
      const conflict: RowFlag = { text: `Same label as row ${other + 1} with a different next action — keep one`, tone: 'error' }
      return { review: { ...base, flags: [...problems, conflict], detail: null, hasError: true }, entry: null }
    }
    if (index !== first) {
      const merged: RowFlag = { text: `Same label as row ${first + 1} — merged into it`, tone: 'info' }
      return { review: { ...base, flags: [...problems, merged], detail: null, hasError: problems.length > 0 }, entry: null }
    }

    const nextAction = group.nextActions[0] ?? ''
    const notes = statusNotes(status, thread, nextAction)
    const review = { ...base, flags: [...problems, ...notes.flags], detail: notes.detail, hasError: problems.length > 0 }
    // A matched thread with nothing new would only be marked touched, which hides it going stale.
    const savesSomething = status === 'new' || status === 'unknown' || nextAction !== ''
    const entry = savesSomething ? { label: thread ? thread.label : labels[index], ...(nextAction ? { nextAction } : {}) } : null
    return { review, entry }
  })

  const reviewed = results.map((result) => result.review)
  return {
    rows: reviewed,
    entries: results.flatMap((result) => (result.entry ? [result.entry] : [])),
    errorRowCount: reviewed.filter((item) => item.hasError).length,
  }
}

/** Why Save is disabled, or null when it can save. */
export function saveBlocker({ isOffline, threads, rowCount, review }: SaveBlockerInput): string | null {
  if (rowCount === 0) return 'Nothing to save — tap Edit text to add your thoughts.'
  if (isOffline) return 'Offline — Brain dump needs a connection to save. Your draft is kept.'
  if (threads === 'loading') return 'Checking your threads…'
  if (threads === 'failed') return 'Couldn’t load your threads to check for matches. Tap Retry.'
  if (review.errorRowCount > 0) {
    return `Fix the ${review.errorRowCount === 1 ? 'row' : `${review.errorRowCount} rows`} marked in red to save.`
  }
  const count = review.entries.length
  if (count === 0) return 'Nothing to save — every row is an existing thread with no new next action.'
  if (count > MAX_ENTRIES) {
    return `One save takes up to ${MAX_ENTRIES} threads and this has ${count}. Remove ${count - MAX_ENTRIES} to save.`
  }
  return null
}

/** True when the rows are exactly what the text parses to, i.e. nothing was edited or removed in Review. */
export function rowsMatchText(rows: BrainDumpRow[], text: string): boolean {
  const parsed = parseBrainDump(text)
  return parsed.length === rows.length && parsed.every((item, index) => {
    const other = rows[index]
    return other.key === item.key && other.label === item.label && other.nextAction === item.nextAction
  })
}

export function draftStorageKey(employeeId: string): string {
  return `${DRAFT_KEY_PREFIX}:${employeeId}`
}

/**
 * Stored as an object: the storage helper JSON-parses what it reads, so a bare string
 * such as 'null' or '123' would come back as something else.
 */
export function toStoredDraft(draft: BrainDumpDraft, now: Date): StoredBrainDumpDraft {
  return { version: DRAFT_VERSION, text: draft.text, review: draft.review, updatedAt: now.toISOString() }
}

function isRow(value: unknown): value is BrainDumpRow {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.key === 'string' && typeof candidate.label === 'string' && typeof candidate.nextAction === 'string'
}

export function parseStoredDraft(value: unknown): BrainDumpDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.version !== DRAFT_VERSION || typeof candidate.text !== 'string') return null
  const review = Array.isArray(candidate.review) && candidate.review.every(isRow)
    ? candidate.review.map((item: BrainDumpRow) => ({ key: item.key, label: item.label, nextAction: item.nextAction }))
    : null
  return { text: candidate.text, review }
}

/** The quiet line beside the text; never a toast, which would replace an error toast. */
export function draftStatusText(status: DraftStatus, hasText: boolean): string | null {
  if (!hasText) return null
  if (status === 'pending') return 'Saving draft…'
  if (status === 'saved') return 'Draft saved'
  if (status === 'failed') return 'Draft not saved on this phone — save before you leave'
  if (status === 'unavailable') return 'Drafts can’t be kept on this phone — save before you leave'
  return null
}

export function isEmptyDraft(draft: BrainDumpDraft): boolean {
  return draft.text.trim() === ''
}

/** From the server's answer: a repeated label comes back as the same thread more than once. */
export function savedToastText(saved: Array<{ id: string; isActive: boolean }>): string {
  const ids = new Set(saved.map((thread) => thread.id))
  const parked = new Set(saved.filter((thread) => !thread.isActive).map((thread) => thread.id))
  const parkedText = parked.size > 0 ? `, ${parked.size} still parked` : ''
  return `Brain dump saved — ${plural(ids.size, 'thread')}${parkedText}`
}
