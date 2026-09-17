// GraphQL resolvers for the founder Start layer. Merged into resolvers.ts like
// requirement-resolvers. Every resolver is founder-only except
// ingestFounderActivity, which authenticates with FOUNDER_INGEST_TOKEN.
import { requireFounder, verifyIngestToken, UNAUTHENTICATED_MESSAGE } from '@/lib/founder/founder-auth'
import {
  attachCheckins,
  buildFounderStart,
  RECENT_CHECKINS_LIMIT,
  type FounderStartResult,
} from '@/lib/founder/start-service'
import { istDateString, scoreThread, type ScoredThread, type StartThread } from '@/lib/founder/compute-start'
import {
  FounderInputError,
  listCheckins,
  listResumePoints,
  recentCheckinsFor,
  type FounderCheckin,
} from '@/lib/db/founder'
import {
  applyCloseout,
  createResumePoint,
  ingestActivity,
  setRanks,
  updateResumePoint,
  type ActivityEntry,
  type CloseoutEntry,
} from '@/lib/db/founder-writes'
import { getStartSettings, upsertStartSettings, type StartSettings } from '@/lib/db/founder-start-data'
import { CRON_PUSH_HOUR_IST, CRON_PUSH_MINUTE_IST, isCronPushTime } from '@/lib/founder/push-schedule'

const MAX_LABEL = 120
const MAX_TEXT = 2000
const MAX_SUMMARY = 500
const MAX_PROJECT_ID = 64
const MAX_ENTRIES = 50
const MAX_CHECKINS = 100
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type Args = Record<string, unknown>
type ThreadParent = StartThread & Partial<Pick<ScoredThread, 'daysSinceTouched' | 'isStale'>> & {
  recentCheckins?: FounderCheckin[]
}

// ── Input validation ─────────────────────────────────────────────────────────

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new FounderInputError(`${field} must be a string.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new FounderInputError(`${field} must be at most ${max} characters.`)
  return trimmed.length > 0 ? trimmed : null
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = optionalText(value, field, max)
  if (!text) throw new FounderInputError(`${field} is required.`)
  return text
}

function toId(value: unknown, field: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new FounderInputError(`${field} must be a valid id.`)
  return id
}

function toLimit(value: unknown, fallback: number): number {
  const limit = Number(value ?? fallback)
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_CHECKINS) : fallback
}

function assertEntryCount(entries: unknown): asserts entries is Args[] {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) {
    throw new FounderInputError(`Provide between 1 and ${MAX_ENTRIES} entries.`)
  }
}

function toIntInRange(value: unknown, field: string, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new FounderInputError(`${field} must be between ${min} and ${max}.`)
  }
  return number
}

function toOccurredAt(value: unknown, now: Date): Date {
  const parsed = typeof value === 'string' ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed > now) return now
  return parsed
}

const has = (args: Args, key: string): boolean => Object.prototype.hasOwnProperty.call(args, key)
const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null)

function toCloseoutEntry(entry: Args): CloseoutEntry {
  const resumePointId = entry.resumePointId ? toId(entry.resumePointId, 'resumePointId') : null
  const label = optionalText(entry.label, 'label', MAX_LABEL)
  if (!resumePointId && !label) throw new FounderInputError('Each close-out entry needs a thread id or a label.')
  return {
    resumePointId,
    label,
    note: optionalText(entry.note, 'note', MAX_TEXT),
    nextAction: optionalText(entry.nextAction, 'nextAction', MAX_TEXT),
    waitingOn: optionalText(entry.waitingOn, 'waitingOn', MAX_TEXT),
    hasWaitingOn: has(entry, 'waitingOn'),
  }
}

function toActivityEntry(entry: Args, now: Date): ActivityEntry {
  return {
    label: optionalText(entry.label, 'label', MAX_LABEL),
    projectId: optionalText(entry.projectId, 'projectId', MAX_PROJECT_ID),
    summary: requiredText(entry.summary, 'summary', MAX_SUMMARY),
    occurredAt: toOccurredAt(entry.occurredAt, now),
  }
}

function toSettingsPatch(args: Args): Partial<StartSettings> {
  const pausedUntil = has(args, 'pausedUntil') ? optionalText(args.pausedUntil, 'pausedUntil', 10) : undefined
  if (pausedUntil && !ISO_DATE.test(pausedUntil)) {
    throw new FounderInputError('pausedUntil must be a YYYY-MM-DD date.')
  }
  const hour = args.hour !== undefined && args.hour !== null ? toIntInRange(args.hour, 'hour', 0, 23) : undefined
  const minute = args.minute !== undefined && args.minute !== null ? toIntInRange(args.minute, 'minute', 0, 59) : undefined
  // One daily cron (vercel.json) sends the push; any other stored time would only mislead or skip it.
  if ((hour !== undefined || minute !== undefined)
    && !isCronPushTime(hour ?? CRON_PUSH_HOUR_IST, minute ?? CRON_PUSH_MINUTE_IST)) {
    throw new FounderInputError(`The Start push time is fixed at ${String(CRON_PUSH_HOUR_IST).padStart(2, '0')}:${String(CRON_PUSH_MINUTE_IST).padStart(2, '0')} IST by the daily cron; change vercel.json to move it.`)
  }
  return {
    ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
    ...(hour !== undefined ? { hour } : {}),
    ...(minute !== undefined ? { minute } : {}),
    ...(pausedUntil !== undefined ? { pausedUntil } : {}),
  }
}

function scored(thread: ThreadParent): Pick<ScoredThread, 'daysSinceTouched' | 'isStale'> {
  if (thread.isStale !== undefined && thread.daysSinceTouched !== undefined) {
    return { daysSinceTouched: thread.daysSinceTouched, isStale: thread.isStale }
  }
  return scoreThread(thread, istDateString(new Date()))
}

// ── Resolvers ────────────────────────────────────────────────────────────────

export const founderQueries = {
  founderStart: async (_: unknown, __: Args, context: any): Promise<FounderStartResult> => {
    const founder = await requireFounder(context)
    return buildFounderStart(founder.employeeId)
  },

  founderResumePoints: async (_: unknown, { includeParked }: Args, context: any) => {
    await requireFounder(context)
    const threads = await listResumePoints(includeParked === true)
    const checkins = await recentCheckinsFor(threads.map((thread) => thread.id), RECENT_CHECKINS_LIMIT)
    return attachCheckins(threads, checkins)
  },

  founderCheckins: async (_: unknown, { resumePointId, limit }: Args, context: any) => {
    await requireFounder(context)
    const id = resumePointId ? toId(resumePointId, 'resumePointId') : null
    return listCheckins(id, toLimit(limit, 20))
  },

  founderStartSettings: async (_: unknown, __: Args, context: any) => {
    await requireFounder(context)
    return getStartSettings()
  },
}

export const founderMutations = {
  createFounderResumePoint: async (_: unknown, { label, projectId }: Args, context: any) => {
    await requireFounder(context)
    return createResumePoint(
      requiredText(label, 'label', MAX_LABEL),
      optionalText(projectId, 'projectId', MAX_PROJECT_ID)
    )
  },

  updateFounderResumePoint: async (_: unknown, args: Args, context: any) => {
    await requireFounder(context)
    const id = toId(args.id, 'id')
    if (has(args, 'label') && args.label === null) throw new FounderInputError('label cannot be null.')
    const patch = {
      ...(args.label !== undefined && args.label !== null ? { label: requiredText(args.label, 'label', MAX_LABEL) } : {}),
      ...(has(args, 'projectId') ? { projectId: optionalText(args.projectId, 'projectId', MAX_PROJECT_ID) } : {}),
      ...(has(args, 'nextAction') ? { nextAction: optionalText(args.nextAction, 'nextAction', MAX_TEXT) } : {}),
      ...(has(args, 'waitingOn') ? { waitingOn: optionalText(args.waitingOn, 'waitingOn', MAX_TEXT) } : {}),
      ...(typeof args.isActive === 'boolean' ? { isActive: args.isActive } : {}),
    }
    const updated = await updateResumePoint(id, patch)
    if (!updated) throw new FounderInputError('Thread not found.')
    return updated
  },

  createFounderCloseout: async (_: unknown, { entries }: Args, context: any) => {
    await requireFounder(context)
    assertEntryCount(entries)
    return applyCloseout(entries.map(toCloseoutEntry))
  },

  updateFounderRanks: async (_: unknown, { orderedIds }: Args, context: any) => {
    await requireFounder(context)
    if (!Array.isArray(orderedIds)) throw new FounderInputError('orderedIds must be a list.')
    const ids = orderedIds.map((value) => toId(value, 'orderedIds'))
    if (new Set(ids).size !== ids.length) throw new FounderInputError('orderedIds contains duplicates.')
    return setRanks(ids)
  },

  updateFounderStartSettings: async (_: unknown, args: Args, context: any) => {
    const founder = await requireFounder(context)
    return upsertStartSettings(toSettingsPatch(args), founder.employeeId)
  },

  // Called by the founder's Claude Code Stop hook and nightly git scan.
  ingestFounderActivity: async (_: unknown, { token, entries }: Args) => {
    if (!verifyIngestToken(typeof token === 'string' ? token : null)) {
      throw new Error(UNAUTHENTICATED_MESSAGE)
    }
    assertEntryCount(entries)
    const now = new Date()
    return ingestActivity(entries.map((entry) => toActivityEntry(entry, now)))
  },
}

export const founderFieldResolvers = {
  FounderResumePoint: {
    nextActionSetAt: (thread: ThreadParent) => iso(thread.nextActionSetAt),
    lastTouchedAt: (thread: ThreadParent) => iso(thread.lastTouchedAt),
    daysSinceTouched: (thread: ThreadParent) => scored(thread).daysSinceTouched,
    isStale: (thread: ThreadParent) => scored(thread).isStale,
    recentCheckins: async (thread: ThreadParent, { limit }: Args) => {
      const capped = toLimit(limit, 3)
      // Lists preload RECENT_CHECKINS_LIMIT per thread; anything beyond that is fetched.
      if (thread.recentCheckins && capped <= RECENT_CHECKINS_LIMIT) return thread.recentCheckins.slice(0, capped)
      return listCheckins(thread.id, capped)
    },
  },
  FounderCheckin: {
    createdAt: (checkin: FounderCheckin) => iso(checkin.createdAt),
  },
  FounderStart: {
    pausedUntil: (start: FounderStartResult) => start.settings.pausedUntil,
    generatedAt: (start: FounderStartResult) => start.generatedAt.toISOString(),
  },
}
