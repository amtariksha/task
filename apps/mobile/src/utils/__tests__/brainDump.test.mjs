// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ENTRIES,
  MAX_LABEL_LENGTH,
  MAX_NEXT_ACTION_LENGTH,
  normalizeLabel,
  parseLine,
  parseBrainDump,
  leftOutLines,
  thoughtCountText,
  reviewBrainDump,
  saveBlocker,
  threadsStateOf,
  rowsMatchText,
  draftStorageKey,
  isDraftStorageKey,
  toStoredDraft,
  parseStoredDraft,
  isEmptyDraft,
  savedToastText,
  draftStatusText,
} from '../brainDump.ts'

const row = (key, label, nextAction = '') => ({ key, label, nextAction })
const thread = (id, label, { isActive = true, nextAction = null } = {}) => ({ id, label, isActive, nextAction })
const flagTexts = (review) => review.flags.map((flag) => flag.text)

describe('parseLine', () => {
  test('each separator splits the label from the next action', () => {
    assert.deepEqual(parseLine('Hiring -> Post job ad'), { label: 'Hiring', nextAction: 'Post job ad' })
    assert.deepEqual(parseLine('Hiring → Post job ad'), { label: 'Hiring', nextAction: 'Post job ad' })
    assert.deepEqual(parseLine('Hiring: Post job ad'), { label: 'Hiring', nextAction: 'Post job ad' })
  })

  test('a line without a separator is a label with no next action', () => {
    assert.deepEqual(parseLine('Investor deck'), { label: 'Investor deck', nextAction: '' })
  })

  test('an arrow wins over any colon, so prefixes such as Re: or TODO: stay in the label', () => {
    assert.deepEqual(parseLine('Re: pricing -> call Ravi'), { label: 'Re: pricing', nextAction: 'call Ravi' })
    assert.deepEqual(parseLine('TODO: renew domain → pay registrar'), { label: 'TODO: renew domain', nextAction: 'pay registrar' })
    assert.deepEqual(parseLine('Q3 plan: hiring -> draft JD'), { label: 'Q3 plan: hiring', nextAction: 'draft JD' })
    assert.deepEqual(parseLine('Swarg -> menu: email chef'), { label: 'Swarg', nextAction: 'menu: email chef' })
  })

  test('the first arrow splits, later arrows stay in the next action', () => {
    assert.deepEqual(parseLine('Deck -> fix chart -> send'), { label: 'Deck', nextAction: 'fix chart -> send' })
  })

  test('without an arrow, the first colon splits', () => {
    assert.deepEqual(parseLine('Re: Investor email'), { label: 'Re', nextAction: 'Investor email' })
    assert.deepEqual(parseLine('Call at 10: discuss pricing'), { label: 'Call at 10', nextAction: 'discuss pricing' })
  })

  test('URLs, times and arrows without spaces do not split', () => {
    assert.deepEqual(parseLine('Read https://x.com/a'), { label: 'Read https://x.com/a', nextAction: '' })
    assert.deepEqual(parseLine('Standup at 10:30'), { label: 'Standup at 10:30', nextAction: '' })
    assert.deepEqual(parseLine('a->b'), { label: 'a->b', nextAction: '' })
    assert.deepEqual(parseLine('Hiring:Post'), { label: 'Hiring:Post', nextAction: '' })
    assert.deepEqual(parseLine('https://x.com -> read it'), { label: 'https://x.com', nextAction: 'read it' })
  })

  test('a trailing separator gives an empty next action', () => {
    assert.deepEqual(parseLine('Hiring ->'), { label: 'Hiring', nextAction: '' })
    assert.deepEqual(parseLine('Hiring:'), { label: 'Hiring', nextAction: '' })
    assert.deepEqual(parseLine('Hiring →   '), { label: 'Hiring', nextAction: '' })
  })

  test('dictation non-breaking spaces count as spaces', () => {
    assert.deepEqual(parseLine('Hiring -> Post ad'), { label: 'Hiring', nextAction: 'Post ad' })
  })

  test('every bullet form is stripped once', () => {
    for (const bullet of ['- ', '* ', '• ', '1. ', '1) ', '12) ', '  - ']) {
      assert.deepEqual(parseLine(`${bullet}Hiring -> Post`), { label: 'Hiring', nextAction: 'Post' }, bullet)
    }
    assert.deepEqual(parseLine('- - Hiring'), { label: '- Hiring', nextAction: '' })
  })

  test('numbers that are not bullets stay', () => {
    assert.deepEqual(parseLine('3.5 tonnes order'), { label: '3.5 tonnes order', nextAction: '' })
    assert.deepEqual(parseLine('2026 plan'), { label: '2026 plan', nextAction: '' })
  })

  test('blank and bullet-only lines are nothing', () => {
    for (const line of ['', '   ', '-', '- ', '1.', '•', '->', ':', ' -> ']) {
      assert.equal(parseLine(line), null, JSON.stringify(line))
    }
  })

  test('a next action with no label keeps the row so it can be fixed', () => {
    assert.deepEqual(parseLine(' -> call Ravi'), { label: '', nextAction: 'call Ravi' })
    assert.deepEqual(parseLine(': call Ravi'), { label: '', nextAction: 'call Ravi' })
    assert.deepEqual(parseLine('- -> call Ravi'), { label: '', nextAction: 'call Ravi' })
  })

  test('label spacing is collapsed, so a dictated or pasted label matches the typed one', () => {
    assert.deepEqual(parseLine('  Big   deal  -> x '), { label: 'Big deal', nextAction: 'x' })
    assert.deepEqual(parseLine('Big\u00a0\tdeal'), { label: 'Big deal', nextAction: '' })
  })
})

describe('normalizeLabel', () => {
  test('collapses any whitespace and trims', () => {
    assert.equal(normalizeLabel(' Investor \u00a0 deck\t'), 'Investor deck')
  })

  test('composes Unicode forms', () => {
    assert.equal(normalizeLabel('Cafe\u0301'), 'Caf\u00e9')
    assert.equal(normalizeLabel('\u0958'), normalizeLabel('\u0915\u093c'))
  })
})

describe('parseBrainDump', () => {
  test('one row per non-blank line, keyed by line number, CRLF included', () => {
    const rows = parseBrainDump('Hiring -> Post ad\r\n\r\n- Deck\n  \nTax: file GST\r')
    assert.deepEqual(rows, [
      row('line-1', 'Hiring', 'Post ad'),
      row('line-3', 'Deck'),
      row('line-5', 'Tax', 'file GST'),
    ])
  })

  test('empty text has no rows', () => {
    assert.deepEqual(parseBrainDump(''), [])
    assert.deepEqual(parseBrainDump('\n\n  \n- \n'), [])
  })
})

describe('leftOutLines', () => {
  const text = 'Hiring -> Post ad\n\n- Deck\nTax: file GST\nGST'

  test('none when every row is still there, edited or not', () => {
    const rows = parseBrainDump(text).map((item) => ({ ...item, nextAction: 'edited' }))
    assert.deepEqual(leftOutLines(text, rows), [])
  })

  test('the original lines of the removed rows, in order, blank lines skipped', () => {
    const rows = parseBrainDump(text).filter((item) => item.key === 'line-3')
    assert.deepEqual(leftOutLines(text, rows), ['Hiring -> Post ad', 'Tax: file GST', 'GST'])
  })

  test('everything when every row was removed, nothing for empty text', () => {
    assert.deepEqual(leftOutLines('A\r\nB', []), ['A', 'B'])
    assert.deepEqual(leftOutLines('', []), [])
  })
})

describe('thoughtCountText', () => {
  test('pluralises', () => {
    assert.equal(thoughtCountText(0), '0 thoughts')
    assert.equal(thoughtCountText(1), '1 thought')
    assert.equal(thoughtCountText(12), '12 thoughts')
  })
})

describe('reviewBrainDump: matching existing threads', () => {
  const threads = [
    thread('1', 'Hiring', { nextAction: 'Call agency' }),
    thread('2', 'Old idea', { isActive: false, nextAction: null }),
    thread('3', 'Deck'),
  ]

  test('a new label is a new thread and is sent by label', () => {
    const review = reviewBrainDump([row('a', ' Tax ', 'File GST')], threads)
    assert.equal(review.rows[0].status, 'new')
    assert.deepEqual(flagTexts(review.rows[0]), ['New thread'])
    assert.deepEqual(review.entries, [{ label: 'Tax', nextAction: 'File GST' }])
  })

  test('a new label without a next action is still saved, with the Top 3 caveat', () => {
    const review = reviewBrainDump([row('a', 'Tax')], threads)
    assert.equal(review.rows[0].status, 'new')
    assert.equal(review.rows[0].flags.length, 2)
    assert.match(review.rows[0].flags[1].text, /Top 3/)
    assert.deepEqual(review.entries, [{ label: 'Tax' }])
  })

  test('an active match ignores capitals, replaces the next action and is sent by thread id', () => {
    const review = reviewBrainDump([row('a', 'hIRING', 'Post ad')], threads)
    assert.equal(review.rows[0].status, 'active')
    assert.equal(review.rows[0].thread.id, '1')
    assert.match(flagTexts(review.rows[0])[0], /^Already on Start — replaces its next action/)
    assert.equal(review.rows[0].detail, 'Now: Call agency')
    assert.deepEqual(review.entries, [{ resumePointId: '1', nextAction: 'Post ad' }])
  })

  test('an active match with the same next action is left out, so a stale thread does not look fresh', () => {
    for (const nextAction of ['Call agency', ' call  AGENCY ']) {
      const review = reviewBrainDump([row('a', 'Hiring', nextAction)], threads)
      assert.equal(review.rows[0].status, 'active')
      assert.deepEqual(flagTexts(review.rows[0]), ['Already on Start — same next action, nothing to save'])
      assert.equal(review.rows[0].detail, null)
      assert.equal(review.rows[0].hasError, false)
      assert.deepEqual(review.entries, [], nextAction)
    }
  })

  test('a parked match with the same next action is left out too', () => {
    const parked = [thread('7', 'Old idea', { isActive: false, nextAction: 'Revisit' })]
    const review = reviewBrainDump([row('a', 'old idea', 'Revisit')], parked)
    assert.deepEqual(flagTexts(review.rows[0]), ['Parked — same next action, nothing to save'])
    assert.deepEqual(review.entries, [])
  })

  test('an active match with no next action is left out of the save', () => {
    const review = reviewBrainDump([row('a', 'deck')], threads)
    assert.equal(review.rows[0].status, 'active')
    assert.match(flagTexts(review.rows[0])[0], /nothing to save/)
    assert.equal(review.rows[0].hasError, false)
    assert.deepEqual(review.entries, [])
  })

  test('the current next action shows as "no next action" when there is none', () => {
    const review = reviewBrainDump([row('a', 'Deck', 'Update slides')], threads)
    assert.equal(review.rows[0].detail, 'Now: no next action')
  })

  test('a parked match says it stays parked and is still saved with its next action', () => {
    const review = reviewBrainDump([row('a', 'OLD IDEA', 'Revisit')], threads)
    assert.equal(review.rows[0].status, 'parked')
    assert.equal(review.rows[0].flags[0].tone, 'warning')
    assert.match(flagTexts(review.rows[0])[0], /stays parked and hidden from Start/)
    assert.match(review.rows[0].detail, /Show parked/)
    assert.deepEqual(review.entries, [{ resumePointId: '2', nextAction: 'Revisit' }])
  })

  test('a parked match with no next action is left out of the save', () => {
    const review = reviewBrainDump([row('a', 'Old idea')], threads)
    assert.equal(review.rows[0].status, 'parked')
    assert.match(flagTexts(review.rows[0])[0], /nothing to save/)
    assert.deepEqual(review.entries, [])
  })

  test('extra, tab or non-breaking spaces and Unicode forms still match, and the thread id is sent', () => {
    const spaced = reviewBrainDump([row('a', 'Old \u00a0 idea', 'x')], threads)
    assert.equal(spaced.rows[0].status, 'parked')
    assert.deepEqual(spaced.entries, [{ resumePointId: '2', nextAction: 'x' }])
    const composed = reviewBrainDump([row('a', 'Cafe\u0301', 'x')], [thread('8', 'Caf\u00e9')])
    assert.equal(composed.rows[0].status, 'active')
  })

  test('a new label is sent with its spacing collapsed', () => {
    const review = reviewBrainDump([row('a', '  New \t idea ', 'x')], threads)
    assert.deepEqual(review.entries, [{ label: 'New idea', nextAction: 'x' }])
  })

  test('before the threads load, rows are unknown and carry no match flags', () => {
    const review = reviewBrainDump([row('a', 'Hiring', 'x')], null)
    assert.equal(review.rows[0].status, 'unknown')
    assert.deepEqual(review.rows[0].flags, [])
  })

  test('entries never carry waitingOn or note', () => {
    const review = reviewBrainDump([row('a', 'Hiring', 'x'), row('b', 'New one')], threads)
    assert.equal(review.entries.length, 2)
    for (const entry of review.entries) {
      assert.deepEqual(Object.keys(entry).filter((key) => !['label', 'nextAction', 'resumePointId'].includes(key)), [])
    }
  })
})

describe('reviewBrainDump: duplicates inside the dump', () => {
  test('same label with the same or one next action merges into the row that has the next action', () => {
    const review = reviewBrainDump([
      row('a', 'Hiring'),
      row('b', 'Deck', 'x'),
      row('c', ' hiring ', 'Post ad'),
      row('d', 'HIRING', 'post  AD'),
    ], [])
    assert.deepEqual(review.entries, [
      { label: 'Deck', nextAction: 'x' },
      { label: 'hiring', nextAction: 'Post ad' },
    ])
    assert.deepEqual(flagTexts(review.rows[0]), ['Same label as row 3 — merged into it'])
    assert.deepEqual(flagTexts(review.rows[2]), ['New thread'])
    assert.deepEqual(flagTexts(review.rows[3]), ['Same label as row 3 — merged into it'])
    assert.deepEqual(review.errorRows, [])
  })

  test('the merged row of an existing thread shows the next action it sends', () => {
    const review = reviewBrainDump(
      [row('a', 'Swarg'), row('b', 'Deck', 'x'), row('c', 'swarg', 'menu -> call chef')],
      [thread('5', 'Swarg', { nextAction: 'Fix webhook' })],
    )
    assert.deepEqual(flagTexts(review.rows[0]), ['Same label as row 3 — merged into it'])
    assert.match(flagTexts(review.rows[2])[0], /^Already on Start — replaces its next action/)
    assert.equal(review.rows[2].detail, 'Now: Fix webhook')
    assert.deepEqual(review.entries[1], { resumePointId: '5', nextAction: 'menu -> call chef' })
  })

  test('with no next action anywhere, the first row is the one kept', () => {
    const review = reviewBrainDump([row('a', 'Tax'), row('b', 'tax')], [])
    assert.deepEqual(review.entries, [{ label: 'Tax' }])
    assert.deepEqual(flagTexts(review.rows[1]), ['Same label as row 1 — merged into it'])
  })

  test('labels that differ only in spacing are duplicates', () => {
    const review = reviewBrainDump([row('a', 'Investor deck', 'A'), row('b', 'Investor  deck', 'a')], [])
    assert.deepEqual(review.entries, [{ label: 'Investor deck', nextAction: 'A' }])
  })

  test('a duplicate of an existing thread with no next action merges into a row that saves nothing', () => {
    const review = reviewBrainDump([row('a', 'Deck'), row('b', 'deck')], [thread('1', 'Deck')])
    assert.match(flagTexts(review.rows[0])[0], /nothing to save/)
    assert.deepEqual(flagTexts(review.rows[1]), ['Same label as row 1 — merged into it'])
    assert.deepEqual(review.entries, [])
  })

  test('same label with different next actions blocks both rows', () => {
    const review = reviewBrainDump([row('a', 'Hiring', 'Post ad'), row('b', 'hiring', 'Call Ravi')], [])
    assert.equal(review.rows[0].hasError, true)
    assert.equal(review.rows[1].hasError, true)
    assert.equal(flagTexts(review.rows[0])[0], 'Same label as row 2 with a different next action — edit a label or remove a row')
    assert.match(flagTexts(review.rows[1])[0], /row 1 with a different next action/)
    assert.deepEqual(review.errorRows, [1, 2])
    assert.deepEqual(review.entries, [])
  })
})

describe('reviewBrainDump: limits', () => {
  test('label 120 is fine, 121 is an error (after trimming)', () => {
    const ok = reviewBrainDump([row('a', ` ${'a'.repeat(MAX_LABEL_LENGTH)} `)], [])
    assert.deepEqual(ok.errorRows, [])
    const long = reviewBrainDump([row('a', 'a'.repeat(MAX_LABEL_LENGTH + 1))], [])
    assert.deepEqual(long.errorRows, [1])
    assert.deepEqual(flagTexts(long.rows[0]), ['Label is 121 characters — limit 120'])
  })

  test('an emoji counts two, as the server counts it', () => {
    const review = reviewBrainDump([row('a', `${'a'.repeat(119)}🙂`)], [])
    assert.deepEqual(review.errorRows, [1])
  })

  test('next action 2000 is fine, 2001 is an error', () => {
    assert.deepEqual(reviewBrainDump([row('a', 'x', 'n'.repeat(MAX_NEXT_ACTION_LENGTH))], []).errorRows, [])
    const long = reviewBrainDump([row('a', 'x', 'n'.repeat(MAX_NEXT_ACTION_LENGTH + 1))], [])
    assert.deepEqual(long.errorRows, [1])
    assert.match(flagTexts(long.rows[0])[0], /^Next action is 2001 characters — limit 2000/)
  })

  test('an empty label needs one', () => {
    const review = reviewBrainDump([row('a', '  ', 'call Ravi')], [])
    assert.deepEqual(flagTexts(review.rows[0]), ['Needs a label'])
    assert.deepEqual(review.errorRows, [1])
  })
})

describe('threadsStateOf', () => {
  test('loading until the network answers', () => {
    assert.equal(threadsStateOf({ hasData: false, hasError: false, loading: true }), 'loading')
  })

  test('ready only with data and no error', () => {
    assert.equal(threadsStateOf({ hasData: true, hasError: false, loading: false }), 'ready')
    assert.equal(threadsStateOf({ hasData: true, hasError: false, loading: true }), 'ready')
  })

  test('an error fails even when data is on hand, so Save stays blocked and Retry shows', () => {
    assert.equal(threadsStateOf({ hasData: true, hasError: true, loading: false }), 'failed')
    assert.equal(threadsStateOf({ hasData: false, hasError: true, loading: false }), 'failed')
  })

  test('no data, no error and not loading is a failure, not an endless spinner', () => {
    assert.equal(threadsStateOf({ hasData: false, hasError: false, loading: false }), 'failed')
  })
})

describe('saveBlocker', () => {
  const ready = (rows, threads = []) => ({ isOffline: false, threads: 'ready', rowCount: rows.length, review: reviewBrainDump(rows, threads) })
  const manyRows = (count) => Array.from({ length: count }, (_, index) => row(`r${index}`, `Thread ${index}`, 'x'))

  test('nothing blocks a valid dump', () => {
    assert.equal(saveBlocker(ready([row('a', 'Tax', 'File')])), null)
  })

  test('offline blocks and says the draft is kept', () => {
    assert.match(saveBlocker({ ...ready([row('a', 'Tax')]), isOffline: true }), /^Offline.*draft is kept/)
  })

  test('threads loading or failed block', () => {
    assert.match(saveBlocker({ ...ready([row('a', 'Tax')]), threads: 'loading' }), /Checking/)
    assert.match(saveBlocker({ ...ready([row('a', 'Tax')]), threads: 'failed' }), /Couldn’t load your threads/)
  })

  test('error rows block, named by position rather than colour', () => {
    const fine = (index) => row(`ok${index}`, `Fine ${index}`, 'x')
    const broken = (index) => row(`bad${index}`, '', 'x')
    assert.equal(saveBlocker(ready([fine(1), broken(2)])), 'Fix row 2 to save.')
    assert.equal(saveBlocker(ready([row('a', 'A', 'x'), row('b', 'a', 'y')])), 'Fix rows 1 and 2 to save.')
    assert.equal(saveBlocker(ready([broken(1), fine(2), broken(3), broken(4)])), 'Fix rows 1, 3 and 4 to save.')
    const many = Array.from({ length: 8 }, (_, index) => broken(index))
    assert.equal(saveBlocker(ready(many)), 'Fix rows 1, 2, 3, 4, 5 and 3 more to save.')
  })

  test('no rows, or only no-op rows, block', () => {
    assert.match(saveBlocker(ready([])), /^Nothing to save/)
    assert.match(saveBlocker(ready([row('a', 'Deck')], [thread('1', 'Deck')])), /^Nothing to save/)
  })

  test('50 entries save, 51 do not', () => {
    assert.equal(saveBlocker(ready(manyRows(MAX_ENTRIES))), null)
    assert.equal(
      saveBlocker(ready(manyRows(MAX_ENTRIES + 1))),
      'One save takes up to 50 threads and this has 51. Remove 1 to save; removed rows stay in your draft for the next save.',
    )
  })

  test('the cap counts entries after merging and dropping no-ops', () => {
    const rows = [...manyRows(MAX_ENTRIES), row('dup', 'thread 0', 'x'), row('noop', 'Deck')]
    assert.equal(saveBlocker(ready(rows, [thread('9', 'Deck')])), null)
  })
})

describe('rowsMatchText', () => {
  const text = 'Hiring -> Post ad\nDeck'
  test('true for the rows the text parses to', () => {
    assert.equal(rowsMatchText(parseBrainDump(text), text), true)
  })
  test('false after an edit or a removal', () => {
    const rows = parseBrainDump(text)
    assert.equal(rowsMatchText([{ ...rows[0], nextAction: 'Call' }, rows[1]], text), false)
    assert.equal(rowsMatchText([rows[0]], text), false)
  })
})

describe('draft storage', () => {
  test('the key is per employee', () => {
    assert.equal(draftStorageKey('AM-0001'), 'founder_brain_dump:AM-0001')
  })

  test('draft keys are recognised so the Debug Menu can hide them', () => {
    assert.equal(isDraftStorageKey(draftStorageKey('AM-0001')), true)
    assert.equal(isDraftStorageKey('founder_flag'), false)
    assert.equal(isDraftStorageKey('founder_brain_dump'), false)
  })

  test('round-trips text and review rows', () => {
    const draft = { text: 'Hiring -> Post', review: [row('line-1', 'Hiring', 'Post')] }
    const stored = toStoredDraft(draft, new Date('2026-10-05T10:00:00Z'))
    assert.equal(stored.updatedAt, '2026-10-05T10:00:00.000Z')
    assert.deepEqual(parseStoredDraft(JSON.parse(JSON.stringify(stored))), draft)
  })

  test('text that is itself JSON survives because the draft is an object', () => {
    for (const text of ['null', '123', 'true', '[1]', '{"a":1}']) {
      const stored = JSON.parse(JSON.stringify(toStoredDraft({ text, review: null }, new Date())))
      assert.deepEqual(parseStoredDraft(stored), { text, review: null }, text)
    }
  })

  test('anything else is no draft', () => {
    for (const value of [null, undefined, 42, 'text', true, [], {}, { version: 1 }, { version: 2, text: 'x' }, { version: 1, text: 5 }]) {
      assert.equal(parseStoredDraft(value), null, JSON.stringify(value))
    }
  })

  test('a broken review falls back to the text', () => {
    assert.deepEqual(
      parseStoredDraft({ version: 1, text: 'x', review: [{ key: 'a', label: 3 }] }),
      { text: 'x', review: null },
    )
  })

  test('only whitespace is an empty draft', () => {
    assert.equal(isEmptyDraft({ text: ' \n ', review: null }), true)
    assert.equal(isEmptyDraft({ text: 'x', review: null }), false)
  })
})

describe('savedToastText', () => {
  test('counts distinct threads and the ones still parked', () => {
    assert.equal(savedToastText([{ id: '1', isActive: true }]), 'Brain dump saved — 1 thread')
    assert.equal(
      savedToastText([{ id: '1', isActive: true }, { id: '1', isActive: true }, { id: '2', isActive: false }]),
      'Brain dump saved — 2 threads, 1 still parked',
    )
  })

  test('says how many removed rows stayed in the draft', () => {
    assert.equal(savedToastText([{ id: '1', isActive: true }], 1), 'Brain dump saved — 1 thread. 1 removed row kept in your draft')
    assert.equal(
      savedToastText([{ id: '1', isActive: false }], 10),
      'Brain dump saved — 1 thread, 1 still parked. 10 removed rows kept in your draft',
    )
  })
})

describe('draftStatusText', () => {
  test('says nothing for an empty box or while loading', () => {
    assert.equal(draftStatusText('saved', false), null)
    assert.equal(draftStatusText('loading', true), null)
    assert.equal(draftStatusText('idle', true), null)
  })

  test('one short line per state', () => {
    assert.equal(draftStatusText('pending', true), 'Saving draft…')
    assert.equal(draftStatusText('saved', true), 'Draft saved')
    assert.match(draftStatusText('failed', true), /not saved/)
    assert.match(draftStatusText('unavailable', true), /can’t be kept/)
  })
})
