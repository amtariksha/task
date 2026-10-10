// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMemberBugCountQuery,
  buildMemberTaskCountQuery,
  countMemberArtifacts,
} from '../member-artifact-counts.ts'

const PROJECT = 'PRJ-037'
const MEMBER = 'SF-0001'

/** Every `$n` in the text is backed by a value, and every value is used. */
function assertParamsLineUp({ text, values }) {
  const used = [...new Set([...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b)
  assert.deepEqual(used, values.map((_, index) => index + 1))
}

/** The value bound to the first placeholder that follows `sqlBefore` in the text. */
function valueBoundAfter({ text, values }, sqlBefore) {
  const escaped = sqlBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\$(\\d+)`))
  assert.ok(match, `no placeholder after "${sqlBefore}" in: ${text}`)
  return values[Number(match[1]) - 1]
}

/** Answers each count query from a canned row and records what was asked. */
function fakeDb(rows) {
  const calls = []
  return {
    calls,
    deps: {
      queryOne: async (text, values) => {
        calls.push({ text, values })
        return /FROM tasks/.test(text) ? rows.tasks : rows.bugs
      },
    },
  }
}

describe('task count: assigned_to is a JSONB array (migration 019)', () => {
  const built = buildMemberTaskCountQuery(PROJECT, MEMBER)

  // `$2 = ANY(assigned_to)` is "op ANY/ALL (array) requires array on right side"
  // on a JSONB column: the route answered 500 for every caller.
  test('does not treat the column as a Postgres array', () => {
    assert.doesNotMatch(built.text, /ANY\s*\(/i)
  })

  test('tests membership with the JSONB operator the task lists use', () => {
    assert.match(built.text, /assigned_to::jsonb \? \$\d+/)
    assert.equal(valueBoundAfter(built, 'assigned_to::jsonb ? '), MEMBER)
  })

  // SF-0001 must not count SF-00010's tasks.
  test('matches whole ids, not text', () => {
    assert.doesNotMatch(built.text, /LIKE|::text/i)
  })

  test('stays inside the project', () => {
    assert.match(built.text, /FROM tasks/)
    assert.equal(valueBoundAfter(built, 'project_id = '), PROJECT)
  })

  test('leaves out soft-deleted tasks, as the task lists do', () => {
    assert.match(built.text, /deleted_at IS NULL/)
  })

  test('binds every value it is given', () => {
    assertParamsLineUp(built)
    assert.deepEqual(built.values, [PROJECT, MEMBER])
  })
})

describe('bug count: assigned_to is a single employee id', () => {
  const built = buildMemberBugCountQuery(PROJECT, MEMBER)

  test('compares the column to the member', () => {
    assert.match(built.text, /FROM bugs/)
    assert.equal(valueBoundAfter(built, 'assigned_to = '), MEMBER)
    assert.equal(valueBoundAfter(built, 'project_id = '), PROJECT)
  })

  test('leaves out soft-deleted bugs, as the bug lists do', () => {
    assert.match(built.text, /deleted_at IS NULL/)
  })

  test('binds every value it is given', () => {
    assertParamsLineUp(built)
  })
})

// A subproject's items carry the main project in project_id and the subproject in
// subproject_id (migration 028), and the member list with its remove button is on
// subproject pages too. Matching project_id alone answers a confident zero there.
describe('the project may be a subproject', () => {
  for (const [name, build] of [
    ['tasks', buildMemberTaskCountQuery],
    ['bugs', buildMemberBugCountQuery],
  ]) {
    test(`${name}: matches the id against project_id or subproject_id`, () => {
      const built = build('PRJ-037-SUB-001', MEMBER)
      // parenthesised, so the OR cannot swallow the conditions around it
      assert.match(built.text, /\(project_id = \$(\d+) OR subproject_id = \$\1\) AND/)
      assert.equal(valueBoundAfter(built, 'subproject_id = '), 'PRJ-037-SUB-001')
      assertParamsLineUp(built)
    })
  }
})

describe('countMemberArtifacts', () => {
  test('runs both counts and returns them as numbers', async () => {
    // node-postgres returns COUNT(*) (bigint) as a string
    const db = fakeDb({ tasks: { count: '12' }, bugs: { count: '3' } })
    assert.deepEqual(await countMemberArtifacts(PROJECT, MEMBER, db.deps), { taskCount: 12, bugCount: 3 })
    assert.deepEqual(db.calls, [
      buildMemberTaskCountQuery(PROJECT, MEMBER),
      buildMemberBugCountQuery(PROJECT, MEMBER),
    ])
  })

  test('a member with nothing in the project counts as zero', async () => {
    const db = fakeDb({ tasks: { count: '0' }, bugs: null })
    assert.deepEqual(await countMemberArtifacts(PROJECT, MEMBER, db.deps), { taskCount: 0, bugCount: 0 })
  })

  // The dialog shows "unknown counts" only when the route fails; a swallowed
  // error here would show a confident, wrong zero instead.
  test('a failing query is not turned into a zero', async () => {
    const deps = {
      queryOne: async () => {
        throw new Error('op ANY/ALL (array) requires array on right side')
      },
    }
    await assert.rejects(countMemberArtifacts(PROJECT, MEMBER, deps), /requires array/)
  })
})

// db/project-users.ts cannot be imported here (it opens the pool), so this reads
// the source. A tripwire: the counts must keep coming from the queries above.
describe('getUserArtifactCounts is wired to these queries', () => {
  const source = readFileSync(new URL('../../db/project-users.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function getUserArtifactCounts(')
  assert.notEqual(start, -1, 'getUserArtifactCounts not found')
  const next = source.indexOf('\nexport ', start + 1)
  const body = source.slice(start, next === -1 ? undefined : next)

  test('delegates to countMemberArtifacts with the pool', () => {
    assert.match(source, /import \{ countMemberArtifacts \} from '\.\.\/projects\/member-artifact-counts'/)
    assert.match(body, /countMemberArtifacts\(projectId, employeeId, \{ queryOne \}\)/)
  })

  test('keeps no query text of its own', () => {
    assert.doesNotMatch(body, /FROM (tasks|bugs)/)
  })
})
