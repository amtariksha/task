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
})
