// The daily founder Start push (build spec §8), run by /api/cron/founder-start.
// Sends the Top 3 as an Expo push (awaited), then records a generic feed row and
// the full card as a `start` check-in.
import { createNotification } from '@/lib/notification-helper'
import { getNotificationPriority, sendPushNotification } from '@/lib/push-notification-service'
import { insertCheckin, withTransaction } from '@/lib/db/founder'
import {
  claimSendDate,
  ensureStartSettings,
  listFounderIds,
  releaseSendDate,
} from '@/lib/db/founder-start-data'
import { founderEmployeeIds } from './founder-auth'
import { istDateString } from './compute-start'
import { formatDayLabel, renderPushBody, renderStartCard } from './start-format'
import { pushSkipReason, type PushSkipReason } from './push-schedule'
import { buildFounderStart, type FounderStartResult } from './start-service'

const NO_TOP3_MESSAGE = 'No Top 3 yet — rank your threads and set next actions.'
const NOTIFICATION_TYPE = 'founder_start'
const START_SCREEN = 'FounderStart'
const START_LINK = '/start'

export interface FounderPushOutcome {
  status: 'sent' | 'skipped'
  reason?: PushSkipReason | 'no-founders' | 'nothing-to-send' | 'send-failed'
  date: string
  sent: number
  /** Founders whose push did not go out (no active push token, Expo error). */
  failed: number
}

interface FounderCard {
  employeeId: string
  start: FounderStartResult
}

const hasThreads = (start: FounderStartResult): boolean => start.top3.length > 0 || start.accordion.length > 0

/** Resolves true only once Expo accepted the push. Never throws. */
async function deliverPush({ employeeId, start }: FounderCard, title: string): Promise<boolean> {
  try {
    // Awaited, not fire-and-forget: Vercel may freeze the function once the response is sent.
    return await sendPushNotification(employeeId, {
      title,
      body: start.top3.length > 0 ? renderPushBody(start.top3) : NO_TOP3_MESSAGE,
      data: { type: NOTIFICATION_TYPE, screen: START_SCREEN, linkUrl: START_LINK },
      priority: getNotificationPriority(NOTIFICATION_TYPE),
    })
  } catch (error) {
    console.error(`[founder-start] push failed for ${employeeId}:`, error)
    return false
  }
}

// Runs only after the push went out, so a failure here is logged and never releases the day.
async function recordSentCard({ employeeId, start }: FounderCard, title: string): Promise<void> {
  try {
    // Thread labels and next actions stay out of feed_notifications: that table is
    // readable through resolvers that do not apply the founder gate.
    await createNotification({
      userId: employeeId,
      actorId: 'system',
      notificationType: NOTIFICATION_TYPE,
      title,
      message: `Your Start for ${formatDayLabel(start.date)} is ready.`,
      linkUrl: START_LINK,
      metadata: { screen: START_SCREEN, date: start.date },
      skipEmail: true,
      skipPush: true,
    })
  } catch (error) {
    console.error(`[founder-start] feed row failed for ${employeeId}:`, error)
  }
  try {
    await withTransaction((client) =>
      insertCheckin(client, {
        resumePointId: null,
        kind: 'start',
        note: renderStartCard(start),
        nextAction: null,
        source: 'app',
      })
    )
  } catch (error) {
    console.error(`[founder-start] start check-in failed for ${employeeId}:`, error)
  }
}

async function sendCard(card: FounderCard): Promise<boolean> {
  const title = `Start · ${formatDayLabel(card.start.date)}`
  if (!(await deliverPush(card, title))) {
    console.error(`[founder-start] push not delivered to ${card.employeeId} (no active push token or Expo rejected it)`)
    return false
  }
  await recordSentCard(card, title)
  return true
}

export async function runFounderStartPush(now: Date = new Date()): Promise<FounderPushOutcome> {
  const today = istDateString(now)
  const skipped = (reason: FounderPushOutcome['reason'], failed = 0): FounderPushOutcome =>
    ({ status: 'skipped', reason, date: today, sent: 0, failed })
  const allowList = founderEmployeeIds()
  const founders = await listFounderIds(allowList)
  const settings = await ensureStartSettings(founders[0] ?? allowList[0])

  const skip = pushSkipReason(settings, today, now)
  if (skip) return skipped(skip)
  if (founders.length === 0) return skipped('no-founders')

  const cards: FounderCard[] = []
  for (const employeeId of founders) {
    const start = await buildFounderStart(employeeId, now)
    if (hasThreads(start)) cards.push({ employeeId, start })
  }
  if (cards.length === 0) return skipped('nothing-to-send')

  // Claim before sending: Vercel may retry a cron call, and the claim is atomic.
  if (!(await claimSendDate(today))) return skipped('already-sent')

  let sent = 0
  for (const card of cards) {
    if (await sendCard(card)) sent += 1
  }
  const failed = cards.length - sent

  // Nothing reached anyone (and nothing was recorded), so a later call today may try again.
  if (sent === 0) {
    await releaseSendDate(today, settings.lastSentDate)
    return skipped('send-failed', failed)
  }
  return { status: 'sent', date: today, sent, failed }
}
