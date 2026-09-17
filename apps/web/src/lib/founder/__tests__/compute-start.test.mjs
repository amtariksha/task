// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStart,
  istDateString,
  addDays,
  daysBetween,
  isCloseoutOverdue,
  qualifiesForTop,
} from '../compute-start.ts'

// 2026-09-17 10:00 IST
const NOW = new Date('2026-09-17T04:30:00Z')
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000)

let nextId = 1
function thread(overrides = {}) {
  const id = overrides.id ?? nextId++
  return {
    id,
    label: `T${id}`,
    projectId: null,
    projectName: null,
    nextAction: 'do the thing',
    nextActionSetAt: null,
    rank: null,
    waitingOn: null,
    lastTouchedAt: daysAgo(0),
    lastTouchedSource: 'closeout',
    isActive: true,
    ...overrides,
  }
}

const ids = (list) => list.map((entry) => entry.id)

describe('IST date helpers', () => {
  test('18:31 UTC is already the next IST day', () => {
    assert.equal(istDateString(new Date('2026-09-16T18:31:00Z')), '2026-09-17')
    assert.equal(istDateString(new Date('2026-09-16T18:29:00Z')), '2026-09-16')
  })

  test('addDays and daysBetween cross month ends', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
    assert.equal(daysBetween('2026-09-28', '2026-10-02'), 4)
  })

  test('close-out is overdue only when older than yesterday', () => {
    assert.equal(isCloseoutOverdue(null, '2026-09-17'), true)
    assert.equal(isCloseoutOverdue('2026-09-16', '2026-09-17'), false)
    assert.equal(isCloseoutOverdue('2026-09-17', '2026-09-17'), false)
    assert.equal(isCloseoutOverdue('2026-09-15', '2026-09-17'), true)
  })
})

describe('qualification', () => {
  test('needs a non-empty next action and a rank', () => {
    assert.equal(qualifiesForTop(thread({ rank: 1 })), true)
    assert.equal(qualifiesForTop(thread({ rank: null })), false)
    assert.equal(qualifiesForTop(thread({ rank: 2, nextAction: '   ' })), false)
    assert.equal(qualifiesForTop(thread({ rank: 2, nextAction: null })), false)
  })

  test('unranked or action-less threads never enter Top 3, even when stale', () => {
    const noAction = thread({ rank: 1, nextAction: null, lastTouchedAt: null })
    const unranked = thread({ rank: null, lastTouchedAt: daysAgo(30) })
    const ranked = thread({ rank: 2 })
    const result = computeStart([noAction, unranked, ranked], [], NOW)
    assert.deepEqual(ids(result.top3), [ranked.id])
    assert.deepEqual(ids(result.accordion), [noAction.id, unranked.id])
  })
})

describe('Top 3 ordering', () => {
  test('fresh ranked threads follow rank order and cap at three', () => {
    const threads = [4, 2, 1, 3].map((rank) => thread({ rank }))
    const result = computeStart(threads, [], NOW)
    assert.deepEqual(result.top3.map((entry) => entry.rank), [1, 2, 3])
    assert.deepEqual(result.accordion.map((entry) => entry.rank), [4])
  })

  test('a stale ranked thread jumps ahead of fresher, better-ranked ones (after rank 1)', () => {
    const first = thread({ rank: 1 })
    const second = thread({ rank: 2 })
    const staleFifth = thread({ rank: 5, lastTouchedAt: daysAgo(5) })
    const result = computeStart([first, second, staleFifth], [], NOW)
    assert.deepEqual(ids(result.top3), [first.id, staleFifth.id, second.id])
    assert.equal(result.top3[1].isStale, true)
    assert.equal(result.top3[1].daysSinceTouched, 5)
  })

  test('rank 1 keeps slot 1 even when others are stale', () => {
    const first = thread({ rank: 1 })
    const stale = thread({ rank: 2, lastTouchedAt: daysAgo(10) })
    const result = computeStart([stale, first], [], NOW)
    assert.equal(result.top3[0].id, first.id)
  })

  test('stale threads order by oldest touch (never first), then rank', () => {
    const never = thread({ rank: 6, lastTouchedAt: null })
    const old = thread({ rank: 5, lastTouchedAt: daysAgo(9) })
    const lessOld = thread({ rank: 2, lastTouchedAt: daysAgo(4) })
    const result = computeStart([lessOld, old, never], [], NOW)
    assert.deepEqual(ids(result.top3), [never.id, old.id, lessOld.id])
    assert.equal(result.top3[0].daysSinceTouched, null)
    assert.equal(result.top3[0].isStale, true)
  })

  test('without a qualifying rank 1, slot 1 goes to the next in order', () => {
    const rankOneNoAction = thread({ rank: 1, nextAction: '' })
    const third = thread({ rank: 3 })
    const second = thread({ rank: 2 })
    const result = computeStart([rankOneNoAction, third, second], [], NOW)
    assert.deepEqual(ids(result.top3), [second.id, third.id])
  })

  test('3 days is fresh, 4 days is stale (IST calendar days)', () => {
    const three = scoreOf(thread({ rank: 1, lastTouchedAt: new Date('2026-09-13T20:00:00Z') })) // 14 Sep IST
    const four = scoreOf(thread({ rank: 1, lastTouchedAt: new Date('2026-09-13T18:00:00Z') })) // 13 Sep IST
    assert.equal(three.daysSinceTouched, 3)
    assert.equal(three.isStale, false)
    assert.equal(four.daysSinceTouched, 4)
    assert.equal(four.isStale, true)
  })
})

function scoreOf(single) {
  return computeStart([single], [], NOW).top3[0]
}

describe('accordion', () => {
  test('ranked by rank first, then unranked by most recent touch, never-touched last', () => {
    const top = [1, 2, 3].map((rank) => thread({ rank }))
    const rankedFive = thread({ rank: 5 })
    const rankedFour = thread({ rank: 4 })
    const recent = thread({ lastTouchedAt: daysAgo(1) })
    const older = thread({ lastTouchedAt: daysAgo(2) })
    const never = thread({ lastTouchedAt: null })
    const result = computeStart([never, older, rankedFive, recent, rankedFour, ...top], [], NOW)
    assert.deepEqual(ids(result.accordion), [rankedFour.id, rankedFive.id, recent.id, older.id, never.id])
  })

  test('parked threads never appear', () => {
    const parked = thread({ rank: 1, isActive: false })
    const result = computeStart([parked], [], NOW)
    assert.equal(result.top3.length, 0)
    assert.equal(result.accordion.length, 0)
  })
})

describe('Karmayog-derived touch', () => {
  test('newer team activity touches the thread and is reported for persistence', () => {
    const stale = thread({ rank: 1, lastTouchedAt: daysAgo(6) })
    const latestAt = daysAgo(0.1)
    const result = computeStart([stale], [{ resumePointId: stale.id, count: 2, titles: [], latestAt }], NOW)
    assert.deepEqual(result.derivedTouches, [{ id: stale.id, touchedAt: latestAt }])
    assert.equal(result.top3[0].lastTouchedSource, 'karmayog')
    assert.equal(result.top3[0].isStale, false)
  })

  test('older activity changes nothing', () => {
    const fresh = thread({ rank: 1, lastTouchedAt: daysAgo(0) })
    const result = computeStart(
      [fresh],
      [{ resumePointId: fresh.id, count: 1, titles: [], latestAt: daysAgo(2) }],
      NOW
    )
    assert.deepEqual(result.derivedTouches, [])
    assert.equal(result.top3[0].lastTouchedSource, 'closeout')
  })

  test('a never-touched thread picks up activity', () => {
    const never = thread({ lastTouchedAt: null })
    const latestAt = daysAgo(1)
    const result = computeStart([never], [{ resumePointId: never.id, count: 1, titles: [], latestAt }], NOW)
    assert.deepEqual(result.derivedTouches, [{ id: never.id, touchedAt: latestAt }])
  })

  test('input threads are not mutated', () => {
    const original = thread({ lastTouchedAt: null })
    computeStart([original], [{ resumePointId: original.id, count: 1, titles: [], latestAt: NOW }], NOW)
    assert.equal(original.lastTouchedAt, null)
  })
})
