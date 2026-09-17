// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pushSkipReason, istMinutesOfDay, EARLY_TOLERANCE_MINUTES } from '../push-schedule.ts'

const base = { enabled: true, hour: 9, minute: 0, pausedUntil: null, lastSentDate: null }
const TODAY = '2026-09-17'
// 03:30 UTC = 09:00 IST
const atIst = (hh, mm) => new Date(Date.UTC(2026, 8, 16, 18, 30) + (hh * 60 + mm) * 60000)

describe('push schedule', () => {
  test('IST minutes of day', () => {
    assert.equal(istMinutesOfDay(new Date('2026-09-17T03:30:00Z')), 9 * 60)
    assert.equal(istMinutesOfDay(new Date('2026-09-16T18:30:00Z')), 0)
  })

  test('sends at the scheduled time and later', () => {
    assert.equal(pushSkipReason(base, TODAY, atIst(9, 0)), null)
    assert.equal(pushSkipReason(base, TODAY, atIst(15, 45)), null)
  })

  test('tolerates a cron that fires within the hour before the target', () => {
    assert.equal(EARLY_TOLERANCE_MINUTES, 60)
    assert.equal(pushSkipReason(base, TODAY, atIst(8, 30)), null)
    assert.equal(pushSkipReason(base, TODAY, atIst(7, 59)), 'too-early')
  })

  test('disabled, paused and already-sent', () => {
    assert.equal(pushSkipReason({ ...base, enabled: false }, TODAY, atIst(9, 0)), 'disabled')
    assert.equal(pushSkipReason({ ...base, pausedUntil: TODAY }, TODAY, atIst(9, 0)), 'paused')
    assert.equal(pushSkipReason({ ...base, pausedUntil: '2026-09-30' }, TODAY, atIst(9, 0)), 'paused')
    assert.equal(pushSkipReason({ ...base, pausedUntil: '2026-09-16' }, TODAY, atIst(9, 0)), null)
    assert.equal(pushSkipReason({ ...base, lastSentDate: TODAY }, TODAY, atIst(9, 0)), 'already-sent')
    assert.equal(pushSkipReason({ ...base, lastSentDate: '2026-09-16' }, TODAY, atIst(9, 0)), null)
  })

  test('a later configured time is honoured', () => {
    const late = { ...base, hour: 18, minute: 30 }
    assert.equal(pushSkipReason(late, TODAY, atIst(9, 0)), 'too-early')
    assert.equal(pushSkipReason(late, TODAY, atIst(17, 30)), null)
  })
})
