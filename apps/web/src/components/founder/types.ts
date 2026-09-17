/**
 * Client-side shapes of the founder GraphQL types (src/graphql/founder-schema.ts)
 * for the web /start page. Mirrors apps/mobile/src/types/founder.ts.
 */

export type FounderCheckinKind = 'closeout' | 'activity' | 'rank' | 'start'
export type FounderCheckinSource = 'claude' | 'hook' | 'app' | 'manual'

export interface FounderCheckin {
  id: string
  checkinDate: string
  resumePointId: string | null
  kind: FounderCheckinKind
  note: string | null
  nextAction: string | null
  source: FounderCheckinSource
  createdAt: string
}

export interface FounderThread {
  id: string
  label: string
  projectId: string | null
  projectName: string | null
  nextAction: string | null
  nextActionSetAt: string | null
  rank: number | null
  waitingOn: string | null
  lastTouchedAt: string | null
  lastTouchedSource: string | null
  /** null = never touched */
  daysSinceTouched: number | null
  isStale: boolean
  isActive: boolean
  recentCheckins: FounderCheckin[]
}

export interface FounderWaitingItem {
  kind: 'task' | 'bug'
  id: string
  title: string
  dueDate: string | null
  projectName: string | null
  status: string | null
}

export interface FounderTeamActivity {
  resumePointId: string
  count: number
  titles: string[]
}

export interface FounderStartSettings {
  enabled: boolean
  hour: number
  minute: number
  tz: string
  pausedUntil: string | null
  lastSentDate: string | null
}

export interface FounderStart {
  /** IST calendar date, YYYY-MM-DD */
  date: string
  top3: FounderThread[]
  accordion: FounderThread[]
  waitingOnMe: FounderWaitingItem[]
  teamActivity: FounderTeamActivity[]
  lastCloseoutDate: string | null
  closeoutOverdue: boolean
  pausedUntil: string | null
  settings: FounderStartSettings
  /** Today's latest Start brief written by Claude, if any */
  claudeNotes: FounderCheckin | null
  generatedAt: string
}

export interface FounderCloseoutEntryInput {
  resumePointId?: string
  label?: string
  note?: string
  nextAction?: string
  waitingOn?: string | null
}

export interface FounderStartQueryData {
  founderStart: FounderStart
}

export interface FounderResumePointsQueryData {
  founderResumePoints: FounderThread[]
}
