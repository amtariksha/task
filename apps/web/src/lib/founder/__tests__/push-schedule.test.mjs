// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pushSkipReason, istMinutesOfDay, isCronPushTime, EARLY_TOLERANCE_MINUTES } from '../push-schedule.ts'

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

  test('a stored time later than the cron slot cannot switch the push off', () => {
    // Vercel Hobby fires the 03:30 UTC job anywhere in 03:00-03:59 UTC = 08:30-09:29 IST.
    for (const hour of [10, 11, 18, 23]) {
      const late = { ...base, hour, minute: 30 }
      assert.equal(pushSkipReason(late, TODAY, atIst(8, 30)), null, `hour ${hour} at 08:30`)
      assert.equal(pushSkipReason(late, TODAY, atIst(9, 0)), null, `hour ${hour} at 09:00`)
      assert.equal(pushSkipReason(late, TODAY, atIst(9, 29)), null, `hour ${hour} at 09:29`)
    }
  })

  test('an earlier stored time is still a lower bound', () => {
    const early = { ...base, hour: 7, minute: 0 }
    assert.equal(pushSkipReason(early, TODAY, atIst(5, 59)), 'too-early')
    assert.equal(pushSkipReason(early, TODAY, atIst(8, 30)), null)
  })

  test('only the cron slot is an accepted push time', () => {
    assert.equal(isCronPushTime(9, 0), true)
    assert.equal(isCronPushTime(9, 1), false)
    assert.equal(isCronPushTime(11, 0), false)
    assert.equal(isCronPushTime(7, 0), false)
  })
})
