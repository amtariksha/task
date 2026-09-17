// When the daily founder push may go out. Pure and import-free so
// `node --experimental-strip-types --test` can load it.

export interface PushScheduleSettings {
  enabled: boolean
  hour: number
  minute: number
  pausedUntil: string | null
  lastSentDate: string | null
}

export type PushSkipReason = 'disabled' | 'paused' | 'too-early' | 'already-sent'

const IST_OFFSET_MINUTES = 330
// The push time is fixed by the single daily cron in vercel.json (`30 3 * * *`
// = 09:00 IST); settings.founder_start.hour/minute cannot move it.
export const CRON_PUSH_HOUR_IST = 9
export const CRON_PUSH_MINUTE_IST = 0
const CRON_PUSH_MINUTES = CRON_PUSH_HOUR_IST * 60 + CRON_PUSH_MINUTE_IST
// Vercel Hobby fires a daily cron at any point within its scheduled hour, so a
// 03:30 UTC (09:00 IST) job can arrive as early as 08:30 IST. Allow that
// instead of silently skipping the day.
export const EARLY_TOLERANCE_MINUTES = 60

export function istMinutesOfDay(instant: Date): number {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** The only hour/minute the settings may hold: the cron slot. */
export function isCronPushTime(hour: number, minute: number): boolean {
  return hour === CRON_PUSH_HOUR_IST && minute === CRON_PUSH_MINUTE_IST
}

/** Why today's push must not be sent, or null when it may go out. */
export function pushSkipReason(settings: PushScheduleSettings, todayIst: string, now: Date): PushSkipReason | null {
  if (!settings.enabled) return 'disabled'
  if (settings.pausedUntil !== null && settings.pausedUntil >= todayIst) return 'paused'
  if (settings.lastSentDate === todayIst) return 'already-sent'
  // Capped at the cron slot: a later stored time (e.g. a hand-edited row) must not
  // turn the only daily call into a skip every day.
  const target = Math.min(settings.hour * 60 + settings.minute, CRON_PUSH_MINUTES)
  if (istMinutesOfDay(now) < target - EARLY_TOLERANCE_MINUTES) return 'too-early'
  return null
}
