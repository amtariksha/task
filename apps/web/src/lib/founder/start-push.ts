// The daily founder Start push (build spec §8), run by /api/cron/founder-start.
// Sends the Top 3 via createNotification (feed row + Expo push) and records the
// full card as a `start` check-in.
import { createNotification } from '@/lib/notification-helper'
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

export interface FounderPushOutcome {
  status: 'sent' | 'skipped'
  reason?: PushSkipReason | 'no-founders' | 'nothing-to-send' | 'send-failed'
  date: string
  sent: number
}

interface FounderCard {
  employeeId: string
  start: FounderStartResult
}

const hasThreads = (start: FounderStartResult): boolean => start.top3.length > 0 || start.accordion.length > 0

async function sendCard({ employeeId, start }: FounderCard): Promise<void> {
  const message = start.top3.length > 0 ? renderPushBody(start.top3) : NO_TOP3_MESSAGE
  await createNotification({
    userId: employeeId,
    actorId: 'system',
    notificationType: 'founder_start',
    title: `Start · ${formatDayLabel(start.date)}`,
    message,
    linkUrl: '/start',
    metadata: { screen: 'FounderStart', date: start.date },
    skipEmail: true,
  })
  await withTransaction((client) =>
    insertCheckin(client, {
      resumePointId: null,
      kind: 'start',
      note: renderStartCard(start),
      nextAction: null,
      source: 'app',
    })
  )
}

export async function runFounderStartPush(now: Date = new Date()): Promise<FounderPushOutcome> {
  const today = istDateString(now)
  const allowList = founderEmployeeIds()
  const founders = await listFounderIds(allowList)
  const settings = await ensureStartSettings(founders[0] ?? allowList[0])

  const skip = pushSkipReason(settings, today, now)
  if (skip) return { status: 'skipped', reason: skip, date: today, sent: 0 }
  if (founders.length === 0) return { status: 'skipped', reason: 'no-founders', date: today, sent: 0 }

  const cards: FounderCard[] = []
  for (const employeeId of founders) {
    const start = await buildFounderStart(employeeId, now)
    if (hasThreads(start)) cards.push({ employeeId, start })
  }
  if (cards.length === 0) return { status: 'skipped', reason: 'nothing-to-send', date: today, sent: 0 }

  // Claim before sending: Vercel may retry a cron call, and the claim is atomic.
  if (!(await claimSendDate(today))) {
    return { status: 'skipped', reason: 'already-sent', date: today, sent: 0 }
  }

  let sent = 0
  for (const card of cards) {
    try {
      await sendCard(card)
      sent += 1
    } catch (error) {
      console.error(`[founder-start] push failed for ${card.employeeId}:`, error)
    }
  }

  if (sent === 0) {
    await releaseSendDate(today, settings.lastSentDate)
    return { status: 'skipped', reason: 'send-failed', date: today, sent: 0 }
  }
  return { status: 'sent', date: today, sent }
}
