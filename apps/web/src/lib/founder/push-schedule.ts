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
// Vercel Hobby fires a daily cron at any point within its scheduled hour, so a
// 03:30 UTC (09:00 IST) job can arrive as early as 08:30 IST. Allow that
// instead of silently skipping the day.
export const EARLY_TOLERANCE_MINUTES = 60

export function istMinutesOfDay(instant: Date): number {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** Why today's push must not be sent, or null when it may go out. */
export function pushSkipReason(settings: PushScheduleSettings, todayIst: string, now: Date): PushSkipReason | null {
  if (!settings.enabled) return 'disabled'
  if (settings.pausedUntil !== null && settings.pausedUntil >= todayIst) return 'paused'
  if (settings.lastSentDate === todayIst) return 'already-sent'
  const target = settings.hour * 60 + settings.minute
  if (istMinutesOfDay(now) < target - EARLY_TOLERANCE_MINUTES) return 'too-early'
  return null
}
