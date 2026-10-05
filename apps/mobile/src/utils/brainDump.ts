/**
 * Founder Brain dump: turns a typed or dictated list into close-out entries.
 * Pure: no React Native imports, so `node --experimental-strip-types --test` can load it.
 *
 * The rules mirror the server's close-out (apps/web/src/graphql/founder-resolvers.ts and
 * apps/web/src/lib/db/founder-writes.ts): text is trimmed and measured in JS string length,
 * a label resolves to any thread with the same lower-cased label (parked ones included),
 * and the whole close-out is saved together or not at all. A row that matches a thread is
 * sent by that thread's id, so it updates the thread it was shown against.
 */

/** Server limits: founder-resolvers.ts MAX_LABEL, MAX_TEXT and MAX_ENTRIES. */
export const MAX_LABEL_LENGTH = 120
export const MAX_NEXT_ACTION_LENGTH = 2000
export const MAX_ENTRIES = 50

const DRAFT_VERSION = 1
const DRAFT_KEY_PREFIX = 'founder_brain_dump'

const BULLET = /^\s*(?:[-*•]|\d+[.)])(?=\s|$)/
// ' -> ' or ' → ', also at the start or end of the line; \s covers dictation's non-breaking spaces.
const ARROW = /(?:^|\s)(?:->|→)(?=\s|$)/
// Only when the line has no arrow: 'Re: pricing -> call Ravi' keeps 'Re: pricing' as the label.
const COLON = /:(?=\s|$)/
const LINE_BREAK = /\r\n|\r|\n/
const MAX_LISTED_ROWS = 5

export interface ParsedLine { label: string; nextAction: string }
export interface BrainDumpRow { key: string; label: string; nextAction: string }
export interface BrainDumpThread { id: string; label: string; isActive: boolean; nextAction: string | null }
/**
 * A new thread by label, a matched one by id. Never a waitingOn key: even null, it would
 * clear the matched thread's waiting-on.
 */
export type BrainDumpEntry = { label: string; nextAction?: string } | { resumePointId: string; nextAction: string }

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
  /** 1-based positions of the rows that block the save. */
  errorRows: number[]
}

export type ThreadsState = 'loading' | 'failed' | 'ready'

/** The latest fetch of the thread list; `hasData` must come from the network on this visit, never the cache. */
export interface ThreadsFetch { hasData: boolean; hasError: boolean; loading: boolean }

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

/**
 * Dictation and pasting bring in doubled, non-breaking or tab spaces and other Unicode forms
 * of the same letters; the server compares labels exactly, so they would make look-alike threads.
 */
export function normalizeLabel(label: string): string {
  return label.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** null for a line with nothing on it (blank, a bare bullet or a bare separator). */
export function parseLine(line: string): ParsedLine | null {
  const rest = line.replace(BULLET, '')
  const separator = ARROW.exec(rest) ?? COLON.exec(rest)
  const label = normalizeLabel(separator ? rest.slice(0, separator.index) : rest)
  const nextAction = separator ? rest.slice(separator.index + separator[0].length).trim() : ''
  return label || nextAction ? { label, nextAction } : null
}

function lineKey(index: number): string {
  return `line-${index + 1}`
}

/** One row per non-blank line. Keys are line numbers, so they stay stable while the rows are edited. */
export function parseBrainDump(text: string): BrainDumpRow[] {
  return text.split(LINE_BREAK).flatMap((line, index) => {
    const parsed = parseLine(line)
    return parsed ? [{ key: lineKey(index), ...parsed }] : []
  })
}

/** The lines whose rows were removed in Review: they were left out of the save, so they stay in the draft. */
export function leftOutLines(text: string, rows: BrainDumpRow[]): string[] {
  const kept = new Set(rows.map((item) => item.key))
  return text.split(LINE_BREAK).filter((line, index) => parseLine(line) !== null && !kept.has(lineKey(index)))
}

export function thoughtCountText(count: number): string {
  return `${count} ${count === 1 ? 'thought' : 'thoughts'}`
}

function matchKey(label: string): string {
  return normalizeLabel(label).toLowerCase()
}

/** Next actions that differ only in capitals or spacing are the same step. */
function actionKey(nextAction: string): string {
  return normalizeLabel(nextAction).toLowerCase()
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

/** A matched thread with no new next action would only be marked touched, which hides it going stale. */
function savesNothing(status: RowStatus, thread: BrainDumpThread | null, nextAction: string): boolean {
  if (status !== 'active' && status !== 'parked') return false
  return nextAction === '' || actionKey(nextAction) === actionKey(thread?.nextAction ?? '')
}

function statusNotes(status: RowStatus, thread: BrainDumpThread | null, nextAction: string): StatusNotes {
  if (status === 'unknown') return { flags: [], detail: null }
  if (status === 'new') {
    const flags: RowFlag[] = [{ text: 'New thread', tone: 'neutral' }]
    if (!nextAction) {
      flags.push({ text: 'No next action — stays out of the Top 3 until it has one and a rank', tone: 'info' })
    }
    return { flags, detail: null }
  }
  const prefix = status === 'active' ? 'Already on Start' : 'Parked'
  if (savesNothing(status, thread, nextAction)) {
    const reason = nextAction ? 'same next action, nothing to save' : 'nothing to save. Add a next action to update it.'
    return { flags: [{ text: `${prefix} — ${reason}`, tone: 'neutral' }], detail: null }
  }
  if (status === 'active') {
    return {
      flags: [{ text: 'Already on Start — replaces its next action', tone: 'info' }],
      detail: `Now: ${thread?.nextAction ?? 'no next action'}`,
    }
  }
  return {
    flags: [{ text: 'Parked — gets this next action but stays parked and hidden from Start', tone: 'warning' }],
    detail: 'To see it on Start, unpark it from ⋮ → Show parked.',
  }
}

/** `actions` holds one row index per distinct next action, in order. */
interface Group { indexes: number[]; actions: number[] }
interface ReviewedRow { review: RowReview; entry: BrainDumpEntry | null }

/** Rows with the same label, in order. The server would apply each to one thread, so they are merged or blocked. */
function groupByLabel(labels: string[], nextActions: string[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  labels.forEach((label, index) => {
    if (!label || label.length > MAX_LABEL_LENGTH) return
    const key = matchKey(label)
    const group = groups.get(key) ?? { indexes: [], actions: [] }
    const nextAction = nextActions[index]
    const isNewAction = nextAction !== ''
      && !group.actions.some((other) => actionKey(nextActions[other]) === actionKey(nextAction))
    groups.set(key, {
      indexes: [...group.indexes, index],
      actions: isNewAction ? [...group.actions, index] : group.actions,
    })
  })
  return groups
}

/** The row a group is saved as: the one carrying its next action, so the row shows what is sent. */
function representativeOf(group: Group): number {
  return group.actions[0] ?? group.indexes[0]
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

function entryFor(label: string, thread: BrainDumpThread | null, nextAction: string): BrainDumpEntry {
  if (thread) return { resumePointId: thread.id, nextAction }
  return nextAction ? { label, nextAction } : { label }
}

/**
 * Flags every row and builds the close-out entries. `threads` must include parked ones
 * (founderResumePoints with includeParked: true); null while they are still loading.
 */
export function reviewBrainDump(rows: BrainDumpRow[], threads: BrainDumpThread[] | null): BrainDumpReview {
  const labels = rows.map((item) => normalizeLabel(item.label))
  const nextActions = rows.map((item) => item.nextAction.trim())
  const groups = groupByLabel(labels, nextActions)

  const results = rows.map((item, index): ReviewedRow => {
    const problems = lengthProblems(labels[index], nextActions[index])
    const group = groups.get(matchKey(labels[index]))
    const thread = group && threads ? findThread(labels[index], threads) : null
    const status = group ? statusOf(thread, threads !== null) : 'unknown'
    const base = { key: item.key, status, thread }
    if (!group) return { review: { ...base, flags: problems, detail: null, hasError: true }, entry: null }

    const representative = representativeOf(group)
    if (group.actions.length > 1) {
      const other = group.indexes.find((candidate) => candidate !== index) ?? representative
      const conflict: RowFlag = {
        text: `Same label as row ${other + 1} with a different next action — edit a label or remove a row`,
        tone: 'error',
      }
      return { review: { ...base, flags: [...problems, conflict], detail: null, hasError: true }, entry: null }
    }
    if (index !== representative) {
      const merged: RowFlag = { text: `Same label as row ${representative + 1} — merged into it`, tone: 'info' }
      return { review: { ...base, flags: [...problems, merged], detail: null, hasError: problems.length > 0 }, entry: null }
    }

    const nextAction = nextActions[index]
    const notes = statusNotes(status, thread, nextAction)
    const review = { ...base, flags: [...problems, ...notes.flags], detail: notes.detail, hasError: problems.length > 0 }
    const entry = savesNothing(status, thread, nextAction) ? null : entryFor(labels[index], thread, nextAction)
    return { review, entry }
  })

  const reviewed = results.map((result) => result.review)
  return {
    rows: reviewed,
    entries: results.flatMap((result) => (result.entry ? [result.entry] : [])),
    errorRows: reviewed.flatMap((item, index) => (item.hasError ? [index + 1] : [])),
  }
}

/** "row 4", "rows 4 and 9", "rows 1, 2, 3, 4, 5 and 2 more". */
function rowList(positions: number[]): string {
  if (positions.length === 1) return `row ${positions[0]}`
  const more = positions.length - MAX_LISTED_ROWS
  const head = more > 0 ? positions.slice(0, MAX_LISTED_ROWS) : positions.slice(0, -1)
  const tail = more > 0 ? `${more} more` : String(positions[positions.length - 1])
  return `rows ${head.join(', ')} and ${tail}`
}

/**
 * A failed fetch is never 'ready', even with an older list on hand: the flags must say what
 * the server will do with each label, and a stale list says otherwise.
 */
export function threadsStateOf({ hasData, hasError, loading }: ThreadsFetch): ThreadsState {
  if (hasError) return 'failed'
  if (hasData) return 'ready'
  return loading ? 'loading' : 'failed'
}

/** Why Save is disabled, or null when it can save. */
export function saveBlocker({ isOffline, threads, rowCount, review }: SaveBlockerInput): string | null {
  if (rowCount === 0) return 'Nothing to save — tap Edit text to add your thoughts.'
  if (isOffline) return 'Offline — Brain dump needs a connection to save. Your draft is kept.'
  if (threads === 'loading') return 'Checking your threads…'
  if (threads === 'failed') return 'Couldn’t load your threads to check for matches. Tap Retry.'
  if (review.errorRows.length > 0) return `Fix ${rowList(review.errorRows)} to save.`
  const count = review.entries.length
  if (count === 0) return 'Nothing to save — every row is an existing thread with no new next action.'
  if (count > MAX_ENTRIES) {
    return `One save takes up to ${MAX_ENTRIES} threads and this has ${count}. `
      + `Remove ${count - MAX_ENTRIES} to save; removed rows stay in your draft for the next save.`
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

/** The draft is kept after sign-out, so the Debug Menu, open to every account, must not show it. */
export function isDraftStorageKey(key: string): boolean {
  return key.startsWith(`${DRAFT_KEY_PREFIX}:`)
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
export function savedToastText(saved: Array<{ id: string; isActive: boolean }>, keptLineCount = 0): string {
  const ids = new Set(saved.map((thread) => thread.id))
  const parked = new Set(saved.filter((thread) => !thread.isActive).map((thread) => thread.id))
  const parkedText = parked.size > 0 ? `, ${parked.size} still parked` : ''
  const keptText = keptLineCount > 0 ? `. ${plural(keptLineCount, 'removed row')} kept in your draft` : ''
  return `Brain dump saved — ${plural(ids.size, 'thread')}${parkedText}${keptText}`
}
