// Assembles the founder Start card. Shared by the founderStart query and the
// 09:00 push job so both apply exactly the same rules.
import {
  addDays,
  computeStart,
  isCloseoutOverdue,
  type DerivedTouch,
  type ScoredThread,
  type StartTeamActivity,
} from './compute-start'
import type { StartWaitingItem } from './start-format'
import {
  lastCloseoutDate,
  latestClaudeStart,
  listResumePoints,
  recentCheckinsFor,
  type FounderCheckin,
} from '@/lib/db/founder'
import { touchFromKarmayog } from '@/lib/db/founder-writes'
import { getStartSettings, loadTeamActivity, loadWaitingOnMe, type StartSettings } from '@/lib/db/founder-start-data'

export const RECENT_CHECKINS_LIMIT = 3
const WAITING_WINDOW_DAYS = 2

export interface StartThreadView extends ScoredThread {
  recentCheckins: FounderCheckin[]
}

export interface FounderStartResult {
  date: string
  top3: StartThreadView[]
  accordion: StartThreadView[]
  waitingOnMe: StartWaitingItem[]
  teamActivity: StartTeamActivity[]
  lastCloseoutDate: string | null
  closeoutOverdue: boolean
  settings: StartSettings
  claudeNotes: FounderCheckin | null
  generatedAt: Date
}

export function attachCheckins<T extends { id: number }>(
  threads: T[],
  checkins: FounderCheckin[]
): Array<T & { recentCheckins: FounderCheckin[] }> {
  return threads.map((thread) => ({
    ...thread,
    recentCheckins: checkins.filter((checkin) => checkin.resumePointId === thread.id),
  }))
}

// The computed card already reflects these touches; a failed write only
// means the next read derives them again, so log instead of failing.
async function persistDerivedTouches(touches: DerivedTouch[]): Promise<void> {
  const results = await Promise.allSettled(
    touches.map((touch) => touchFromKarmayog(touch.id, touch.touchedAt))
  )
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[founder] derived touch failed for thread ${touches[index].id}:`, result.reason)
    }
  })
}

export async function buildFounderStart(employeeId: string, now: Date = new Date()): Promise<FounderStartResult> {
  const [threads, teamActivity] = await Promise.all([listResumePoints(false), loadTeamActivity()])
  const computed = computeStart(threads, teamActivity, now)
  const today = computed.date

  const [waitingOnMe, lastCloseout, settings, claudeNotes, checkins] = await Promise.all([
    loadWaitingOnMe(employeeId, addDays(today, WAITING_WINDOW_DAYS)),
    lastCloseoutDate(),
    getStartSettings(),
    latestClaudeStart(today),
    recentCheckinsFor(
      [...computed.top3, ...computed.accordion].map((thread) => thread.id),
      RECENT_CHECKINS_LIMIT
    ),
  ])
  await persistDerivedTouches(computed.derivedTouches)

  return {
    date: today,
    top3: attachCheckins(computed.top3, checkins),
    accordion: attachCheckins(computed.accordion, checkins),
    waitingOnMe,
    teamActivity,
    lastCloseoutDate: lastCloseout,
    closeoutOverdue: isCloseoutOverdue(lastCloseout, today),
    settings,
    claudeNotes,
    generatedAt: now,
  }
}
