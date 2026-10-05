// Run: npm test (node --experimental-strip-types --test)
//
// resolvers.ts and the route handlers cannot be imported here (path aliases,
// server-only auth), so this reads the source. It is a tripwire, not a proof: a
// task or bug write that stops going through its authorization check fails here.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const resolvers = read('../../../graphql/resolvers.ts')
const taskRoute = read('../../../app/api/tasks/[taskId]/route.ts')

/** The body of a mutation resolver, from its signature to the first write. */
function mutationHead(name) {
  const start = resolvers.indexOf(`    ${name}: async (`)
  assert.notEqual(start, -1, `${name} resolver not found`)
  const firstWrite = resolvers.slice(start).search(/UPDATE |INSERT INTO /)
  return resolvers.slice(start, start + firstWrite)
}

describe('GraphQL task and bug writes check authorization before writing', () => {
  for (const [name, check] of [
    ['updateTask', 'assertCanModifyTask(actor, taskId, '],
    ['deleteTask', 'assertCanModifyTask(actor, taskId, '],
    ['updateBug', 'assertCanModifyBug(actor, bugId)'],
    ['deleteBug', 'assertCanModifyBug(actor, bugId)'],
  ]) {
    test(name, () => {
      const head = mutationHead(name)
      assert.match(head, /const actor = requireUser\(context\)/)
      assert.ok(head.includes(`await ${check}`), `${name} must call ${check} before writing`)
    })
  }

  // POST /api/tasks and POST /api/bugs require a session and nothing more.
  for (const name of ['createTask', 'createBug']) {
    test(`${name} requires a session, as its REST route does`, () => {
      assert.match(mutationHead(name), /requireUser\(context\)/)
    })
  }
})

describe('REST and GraphQL share one task modify rule', () => {
  test('the [taskId] route uses lib/tasks/task-access and keeps no copy of its own', () => {
    assert.match(taskRoute, /import \{ canModifyTask \} from '@\/lib\/tasks\/task-access'/)
    assert.doesNotMatch(taskRoute, /function canModifyTask/)
    assert.equal(taskRoute.match(/canModifyTask\((authUser|user), \w+, \{ canEditWorkItem \}\)/g)?.length, 2)
  })
})
