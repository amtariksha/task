// Run: npm test (node --experimental-strip-types --test)
//
// resolvers.ts cannot be imported here (path aliases, server-only auth), so this
// reads the source. It is a tripwire, not a proof: a task, bug or project query
// added to the GraphQL layer without going through lib/tenancy/list-scope fails
// here and has to be looked at before it ships.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const GRAPHQL_DIR = new URL('../../../graphql/', import.meta.url)

const graphqlSources = readdirSync(GRAPHQL_DIR)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => ({ file, source: readFileSync(new URL(file, GRAPHQL_DIR), 'utf8') }))

const resolversSource = graphqlSources.find(({ file }) => file === 'resolvers.ts').source

/** Raw SQL left in the GraphQL layer: all single-row or id lookups. */
const ALLOWED_DIRECT_QUERIES = [
  'SELECT * FROM tasks WHERE task_id = ANY($1) AND deleted_at IS NULL',
  'SELECT * FROM bugs WHERE bug_id = ANY($1) AND deleted_at IS NULL',
  'SELECT * FROM projects WHERE project_id = ANY($1) AND deleted_at IS NULL',
  'SELECT project_id, assigned_to, reported_by, company_id FROM bugs WHERE bug_id = $1',
  'SELECT * FROM tasks WHERE task_id = $1',
  'SELECT * FROM bugs WHERE bug_id = $1',
  // Next sequential bug id for createBug — never returned to the caller.
  'SELECT bug_id FROM bugs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
]

/** The SQL string literal around each `FROM tasks|bugs|projects`, whitespace collapsed. */
function directQueries(source) {
  const found = []
  for (const match of source.matchAll(/FROM (tasks|bugs|projects)\b/g)) {
    const start = Math.max(source.lastIndexOf("'", match.index), source.lastIndexOf('`', match.index)) + 1
    const after = source.slice(match.index).search(/['`]/)
    found.push(source.slice(start, match.index + after).replace(/\s+/g, ' ').trim())
  }
  return found
}

describe('GraphQL list resolvers go through lib/tenancy/list-scope', () => {
  test('no task, bug or project query bypasses the company scope', () => {
    for (const { file, source } of graphqlSources) {
      for (const sql of directQueries(source)) {
        assert.ok(ALLOWED_DIRECT_QUERIES.includes(sql), `${file}: unscoped query "${sql}"`)
      }
    }
  })

  test('each list resolver delegates to its scoped list function', () => {
    const delegations = [
      /tasks: async \(_: any, filters: any, context: any\) => \{\s+const actor = requireUser\(context\)[\s\S]*?listTasks\(actor, filters, /,
      /bugs: async \(_: any, filters: any, context: any\) => \{\s+const actor = requireUser\(context\)[\s\S]*?listBugs\(actor, filters, /,
      /projects: async \(_: any, __: any, \{ user \}: any\) => \{\s+if \(!user\) throw[^\n]*\n[^\n]*\n\s+let projects = await listProjects\(user, /,
      /tasks: async \(user: any, _: any, context: any\) => \{\s+const actor = requireUser\(context\)[\s\S]*?listTasksOfUser\(actor, employeeId, /,
      /bugs: async \(user: any, _: any, context: any\) => \{\s+const actor = requireUser\(context\)[\s\S]*?listBugsOfUser\(actor, employeeId, /,
      /tasks: async \(project: any, _: any, context: any\) => \{\s+const actor = requireUser\(context\)\s+return listTasksOfProject\(actor, project\.project_id, /,
    ]
    for (const delegation of delegations) {
      assert.match(resolversSource, delegation)
    }
  })

  test('users delegates to its scoped list function', () => {
    assert.match(
      resolversSource,
      /users: async \(_: any, __: any, \{ user \}: any\) => \{\s+if \(!user\) throw[^\n]*\n[^\n]*\n\s+return listUsers\(user, /
    )
  })
})

/** One resolver's source, from its signature to the brace that closes it. */
function resolverBody(source, signature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `resolver not found: ${signature}`)
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start)
  const end = source.indexOf(`\n${indent}},\n`, start)
  assert.ok(end > start, `end of resolver not found: ${signature}`)
  return source.slice(start, end)
}

describe('GraphQL single-item reads go through lib/tenancy/item-access', () => {
  const requirementSource = graphqlSources.find(({ file }) => file === 'requirement-resolvers.ts').source

  test('task and bug require a session first, then delegate to readTask / readBug', () => {
    const task = resolverBody(resolversSource, 'task: async (_: any, { taskId }: any, context: any) => {')
    assert.match(task, /^[^\n]*\n\s+const actor = requireUser\(context\)\n/)
    assert.match(task, /readTask\(actor, taskId, /)

    const bug = resolverBody(resolversSource, 'bug: async (_: any, { bugId }: any, context: any) => {')
    assert.match(bug, /^[^\n]*\n\s+const actor = requireUser\(context\)\n/)
    assert.match(bug, /readBug\(actor, bugId, /)
  })

  test('no resolver runs its own project-membership gate any more', () => {
    assert.doesNotMatch(resolversSource, /FROM project_users WHERE employee_id = \$1 AND project_id = \$2/)
  })

  test('user(employeeId) requires a session before it reads', () => {
    const user = resolverBody(resolversSource, 'user: async (_: any, { employeeId }: any, context: any) => {')
    assert.ok(user.indexOf('requireUser(context)') > 0, 'user(employeeId) does not call requireUser')
    assert.ok(user.indexOf('requireUser(context)') < user.indexOf('.query('), 'user(employeeId) reads before requireUser')
  })

  test('requirements check the tenant boundary, with no global-role shortcut', () => {
    const guard = requirementSource.match(/async function requireProjectMember\([\s\S]*?\n\}/)
    assert.ok(guard, 'requireProjectMember not found')
    assert.match(guard[0], /canViewProjectRequirements\(user, projectId, /)
    assert.doesNotMatch(guard[0], /'admin'|'top_management'/)
  })

  test('section revisions are refused, not unguarded, when the requirement is gone', () => {
    const revisions = resolverBody(requirementSource, 'requirementSectionRevisions: async (_: any, { sectionId }: any, context: any) => {')
    assert.match(revisions, /if \(!req\) return \[\]\n\s+await requireProjectMember\(context, req\.projectId\)/)
  })
})
