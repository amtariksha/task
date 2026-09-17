// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  istDateString,
  addDays,
  formatDayLabel,
  formatShortDay,
  startHeader,
  ageLabel,
  closeoutFlagText,
  isPauseActive,
  pausedText,
  dueLabel,
  localDateString,
  applyNotToday,
  orderForChips,
  moveItem,
} from '../founderFormat.ts'

describe('dates', () => {
  test('IST day boundary is 18:30 UTC', () => {
    assert.equal(istDateString(new Date('2026-09-16T18:29:59Z')), '2026-09-16')
    assert.equal(istDateString(new Date('2026-09-16T18:30:00Z')), '2026-09-17')
  })

  test('addDays crosses month and year ends', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-10-01', -1), '2026-09-30')
  })

  test('labels match the web renderer', () => {
    assert.equal(formatDayLabel('2026-09-16'), 'Wed 16 Sep')
    assert.equal(formatShortDay('2026-09-12'), 'Sat 12')
    assert.equal(startHeader('2026-09-15'), 'START · Tue 15 Sep')
  })

  test('localDateString pads month and day', () => {
    assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
    assert.equal(localDateString(new Date(2026, 10, 25)), '2026-11-25')
  })
})

describe('chips and flags', () => {
  test('age chip', () => {
    assert.equal(ageLabel(0, false), 'today')
    assert.equal(ageLabel(1, false), 'yesterday')
    assert.equal(ageLabel(3, false), '3d')
    assert.equal(ageLabel(5, true), '5d ⚠')
    assert.equal(ageLabel(null, true), 'never ⚠')
  })

  test('close-out flag', () => {
    assert.equal(closeoutFlagText('2026-09-11'), 'No close-out since Fri 11 — next actions may be stale.')
    assert.equal(closeoutFlagText(null), 'No close-out yet — next actions may be stale.')
  })

  test('pause is active through the pausedUntil day', () => {
    assert.equal(isPauseActive(null, '2026-09-17'), false)
    assert.equal(isPauseActive('2026-09-16', '2026-09-17'), false)
    assert.equal(isPauseActive('2026-09-17', '2026-09-17'), true)
    assert.equal(isPauseActive('2026-09-20', '2026-09-17'), true)
    assert.equal(pausedText('2026-09-20'), 'Paused until Sun 20 Sep')
  })

  test('due labels', () => {
    const today = '2026-09-17'
    assert.equal(dueLabel(null, today), 'no due date')
    assert.equal(dueLabel('2026-09-10', today), 'overdue · Thu 10 Sep')
    assert.equal(dueLabel(today, today), 'due today')
    assert.equal(dueLabel('2026-09-18', today), 'due tomorrow')
    assert.equal(dueLabel('2026-09-19', today), 'due Sat 19 Sep')
  })
})

describe('list helpers', () => {
  const threads = [
    { id: '1', rank: 2, label: 'b' },
    { id: '2', rank: null, label: 'z' },
    { id: '3', rank: 1, label: 'a' },
    { id: '4', rank: null, label: 'c' },
  ]

  test('not-today moves ids to the end without mutating', () => {
    const top = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    assert.deepEqual(applyNotToday(top, ['a']).map((t) => t.id), ['b', 'c', 'a'])
    assert.deepEqual(applyNotToday(top, []).map((t) => t.id), ['a', 'b', 'c'])
    assert.deepEqual(top.map((t) => t.id), ['a', 'b', 'c'])
  })

  test('chips: ranked by rank, then unranked by label', () => {
    assert.deepEqual(orderForChips(threads).map((t) => t.id), ['3', '1', '4', '2'])
    assert.deepEqual(threads.map((t) => t.id), ['1', '2', '3', '4'])
  })

  test('moveItem swaps neighbours and ignores out-of-range moves', () => {
    const list = ['a', 'b', 'c']
    assert.deepEqual(moveItem(list, 0, 1), ['b', 'a', 'c'])
    assert.deepEqual(moveItem(list, 2, -1), ['a', 'c', 'b'])
    assert.equal(moveItem(list, 0, -1), list)
    assert.equal(moveItem(list, 2, 1), list)
    assert.deepEqual(list, ['a', 'b', 'c'])
  })
})
