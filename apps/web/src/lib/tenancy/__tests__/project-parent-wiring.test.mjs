// Run: npm test (node --experimental-strip-types --test)
//
// The route handlers and project-guard.ts cannot be imported here (path aliases,
// server-only auth), so this reads the source. It is a tripwire, not a proof: a
// way of creating a project under a parent, or of moving one, that does not go
// through lib/tenancy/project-parent fails here and has to be looked at before
// it ships.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const SRC = new URL('../../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, SRC), 'utf8')

const COLLECTION_ROUTE = 'app/api/projects/route.ts'
const PROJECT_ROUTE = 'app/api/projects/[projectId]/route.ts'

/** Every .ts and .tsx file under src/, tests aside, as paths relative to src/. */
function sourceFiles(dir = '') {
  return readdirSync(new URL(dir || '.', SRC), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(`${dir}${entry.name}/`)
    return /\.tsx?$/.test(entry.name) ? [`${dir}${entry.name}`] : []
  })
}

/** One exported HTTP handler's source, up to the next handler. */
function handler(path, method) {
  const source = read(path)
  const starts = [...source.matchAll(/^export async function (GET|POST|PUT|PATCH|DELETE)\(/gm)]
  const index = starts.findIndex((match) => match[1] === method)
  assert.ok(index >= 0, `${method} handler not found in ${path}`)
  return source.slice(starts[index].index, starts[index + 1]?.index ?? source.length)
}

/** One function's source, from its signature to the brace that closes it. */
function functionBody(source, signature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `not found: ${signature}`)
  const end = source.indexOf('\n}', start)
  assert.ok(end > start, `end not found: ${signature}`)
  return source.slice(start, end)
}

function assertBefore(body, first, second, where) {
  assert.ok(body.includes(first), `${where}: ${first} is not called`)
  assert.ok(body.includes(second), `${where}: ${second} is not called`)
  assert.ok(body.indexOf(first) < body.indexOf(second), `${where}: ${second} runs before ${first}`)
}

/** A refusal handed back in the envelope, with the rule's own status. */
const refusal = (name) =>
  new RegExp(
    `if \\(!${name}\\.allowed\\) \\{\\n\\s+return NextResponse\\.json\\(\\n\\s+\\{ success: false, error: ${name}\\.message \\},\\n\\s+\\{ status: ${name}\\.status \\}\\n\\s+\\)\\n\\s+\\}`
  )

describe('POST /api/projects decides through lib/tenancy/project-parent', () => {
  const body = handler(COLLECTION_ROUTE, 'POST')

  test('the rule runs before the project is written, and its refusal is returned', () => {
    assertBefore(body, 'projectCreateAccess(authUser, parent.parentId)', 'createProject(', 'POST /api/projects')
    assert.match(body, refusal('access'))
  })

  test('the session comes first and the parent is read from the body once', () => {
    assertBefore(body, 'getAuthUser(request)', 'projectCreateAccess(', 'POST /api/projects')
    assertBefore(body, 'parentIdFromBody(body.parentProjectId)', 'projectCreateAccess(', 'POST /api/projects')
    assert.match(body, /parentProjectId: parent\.parentId \|\| undefined,/)
    assert.equal(body.split('body.parentProjectId').length - 1, 1, 'the raw body value is used again')
  })

  test('the route keeps no permission rule of its own', () => {
    assert.doesNotMatch(read(COLLECTION_ROUTE), /canAdminCompany|canManageProject|isSameCompany/)
  })
})

describe('PUT /api/projects/[projectId] decides a change of parent through lib/tenancy/project-parent', () => {
  const body = handler(PROJECT_ROUTE, 'PUT')

  test('the rule runs after the manage check and before the project is written', () => {
    assertBefore(body, 'canManageProject(auth.user, projectId)', 'projectReparentAccess(', 'PUT project')
    assertBefore(body, 'projectReparentAccess(auth.user, existingProject, parent.parentId)', 'updateProject(', 'PUT project')
    assert.match(body, refusal('move'))
  })

  test('every request that names a parent is checked, and only the checked value is written', () => {
    assert.match(body, /if \(body\.parentProjectId !== undefined\) \{\n\s+const parent = parentIdFromBody\(body\.parentProjectId\)/)
    assert.match(body, /updates\.parentProjectId = parent\.parentId\n/)
    assert.doesNotMatch(body, /updates\.parentProjectId = body\./)
  })

  test('PATCH is still the same handler', () => {
    assert.match(handler(PROJECT_ROUTE, 'PATCH'), /\) \{\n\s+return PUT\(request, \{ params \}\)\n\}/)
  })
})

describe('lib/tenancy/project-guard wires the real lookups into the parent rules', () => {
  const guard = read('lib/tenancy/project-guard.ts')

  test('the lookups are the database and authz ones, not stand-ins', () => {
    assert.match(guard, /import \{ getProjectCompanyId \} from '\.\.\/db\/projects'/)
    assert.match(guard, /import \{ canAdminCompany, canManageProject, isPlatformAdmin \} from '\.\.\/authz'/)
    assert.match(
      guard,
      /const parentDeps: ProjectParentDeps = \{\n  readAccess: projectReadAccess,\n  canManageProject,\n  canAdminCompany,\n  getProjectCompanyId,\n\}/
    )
  })

  test('the route-facing functions are the tested rules, not copies', () => {
    assert.match(
      functionBody(guard, 'export async function projectCreateAccess('),
      /return decideProjectCreate\(actor, parentProjectId, parentDeps\)/
    )
    const reparent = functionBody(guard, 'export async function projectReparentAccess(')
    assert.match(reparent, /return decideProjectReparent\(actor, facts, newParentId, parentDeps\)/)
    assert.match(reparent, /companyId: project\.companyId \?\? null,/)
    assert.match(reparent, /parentProjectId: project\.parentProjectId \?\? null,/)
  })
})

describe('nothing else creates a project or moves one', () => {
  const sources = sourceFiles().map((path) => ({ path, source: read(path) }))

  test('lib/db/projects is the only place that writes the projects table', () => {
    const writers = sources
      .filter(({ source }) => /INSERT INTO projects\b|UPDATE projects\b/.test(source))
      .map(({ path }) => path)
    assert.deepEqual(writers, ['lib/db/projects.ts'])
  })

  test('createProject and updateProject are called from the two guarded routes only', () => {
    const callers = sources
      .filter(({ path }) => path !== 'lib/db/projects.ts')
      .filter(({ source }) => /\b(createProject|updateProject)\b/.test(source) && /db\/projects['"]/.test(source))
      .map(({ path }) => path)
      .sort()
    assert.deepEqual(callers, [PROJECT_ROUTE, COLLECTION_ROUTE].sort())
  })

  test('createProject still homes a sub-project in its parent\'s company', () => {
    const body = functionBody(read('lib/db/projects.ts'), 'export async function createProject(')
    assert.match(body, /companyId = parent\?\.companyId \|\| companyId/)
  })
})
