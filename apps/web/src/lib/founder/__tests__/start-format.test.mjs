// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderPushBody,
  renderStartCard,
  formatDayLabel,
  formatShortDay,
  ageLabel,
  closeoutFlagText,
  truncate,
  PUSH_BODY_MAX,
} from '../start-format.ts'

const scored = (overrides) => ({
  id: 1,
  label: 'Karmayog',
  projectId: null,
  projectName: null,
  nextAction: 'Ship Start screen',
  nextActionSetAt: null,
  rank: 1,
  waitingOn: null,
  lastTouchedAt: null,
  lastTouchedSource: null,
  isActive: true,
  daysSinceTouched: 0,
  isStale: false,
  ...overrides,
})

describe('labels', () => {
  test('day labels', () => {
    assert.equal(formatDayLabel('2026-09-16'), 'Wed 16 Sep')
    assert.equal(formatShortDay('2026-09-12'), 'Sat 12')
  })

  test('age chip', () => {
    assert.equal(ageLabel(0, false), 'today')
    assert.equal(ageLabel(1, false), 'yesterday')
    assert.equal(ageLabel(3, false), '3d')
    assert.equal(ageLabel(4, true), '4d ⚠')
    assert.equal(ageLabel(null, true), 'never ⚠')
  })

  test('close-out flag', () => {
    assert.equal(closeoutFlagText('2026-09-12'), 'No close-out since Sat 12 — next actions may be stale.')
    assert.match(closeoutFlagText(null), /No close-out yet/)
  })

  test('truncate adds an ellipsis only when needed', () => {
    assert.equal(truncate('abc', 3), 'abc')
    assert.equal(truncate('abcdef', 4), 'abc…')
    assert.equal(truncate('abcdef', 1), '')
  })
})

describe('push body', () => {
  test('one line per thread in the spec format', () => {
    const body = renderPushBody([
      scored({ label: 'Karmayog', nextAction: 'Ship Start' }),
      scored({ label: 'Swarg', nextAction: 'Call vendor' }),
    ])
    assert.equal(body, '1. Karmayog · Ship Start\n2. Swarg · Call vendor')
  })

  test('never exceeds 180 chars and truncates the long action, not the short one', () => {
    const body = renderPushBody([
      scored({ label: 'Karmayog', nextAction: 'x'.repeat(300) }),
      scored({ label: 'Swarg', nextAction: 'Call vendor' }),
      scored({ label: 'Nisarg', nextAction: 'y'.repeat(120) }),
    ])
    assert.ok(body.length <= PUSH_BODY_MAX, `length ${body.length}`)
    const lines = body.split('\n')
    assert.equal(lines.length, 3)
    assert.equal(lines[1], '2. Swarg · Call vendor')
    assert.ok(lines[0].endsWith('…'))
    assert.ok(lines[2].endsWith('…'))
  })

  test('collapses whitespace and handles an empty list', () => {
    assert.equal(renderPushBody([scored({ nextAction: 'a\n  b' })]), '1. Karmayog · a b')
    assert.equal(renderPushBody([]), '')
  })

  test('absurdly long labels still respect the cap', () => {
    const body = renderPushBody([scored({ label: 'L'.repeat(400) })])
    assert.equal(body.length, PUSH_BODY_MAX)
  })
})

describe('start card', () => {
  test('renders sections and the close-out flag', () => {
    const text = renderStartCard({
      date: '2026-09-17',
      top3: [scored({ waitingOn: 'Ravi', daysSinceTouched: 5, isStale: true })],
      accordion: [scored({ id: 2, label: 'Swarg', nextAction: null, rank: null, daysSinceTouched: null, isStale: true })],
      waitingOnMe: [{ kind: 'task', id: 'TASK-1', title: 'Sign PO', dueDate: '2026-09-18', projectName: 'Ops', status: 'Open' }],
      closeoutOverdue: true,
      lastCloseoutDate: '2026-09-12',
    })
    assert.equal(
      text,
      [
        'START · Thu 17 Sep',
        'No close-out since Sat 12 — next actions may be stale.',
        '',
        'Top 3',
        '1. Karmayog · Ship Start screen · 5d ⚠ · waiting on Ravi',
        '',
        'Other threads',
        '- Swarg · no next action · never ⚠',
        '',
        'Waiting on you',
        '- TASK-1 Sign PO · Ops (due Fri 18 Sep)',
      ].join('\n')
    )
  })
})
