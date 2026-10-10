// Run: npm test (node --experimental-strip-types --test)
//
// The route handlers, authz.ts and resolvers.ts cannot be imported here (path
// aliases, server-only auth), so this reads the source. It is a tripwire, not a
// proof: a handler under /api/projects/[projectId] that reads or changes a
// project without going through a tenant-boundary check fails here and has to be
// looked at before it ships.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const SRC = new URL('../../../', import.meta.url)
const PROJECT_API = 'app/api/projects/[projectId]/'
const read = (path) => readFileSync(new URL(path, SRC), 'utf8')

/** Every route.ts under /api/projects/[projectId], as paths relative to src/. */
function routeFiles(dir = PROJECT_API) {
  return readdirSync(new URL(dir, SRC), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(`${dir}${entry.name}/`)
    return entry.name === 'route.ts' ? [`${dir}${entry.name}`] : []
  })
}

/** Each exported HTTP handler in a route file: its method and its source. */
function handlers(source) {
  const starts = [...source.matchAll(/^export async function (GET|POST|PUT|PATCH|DELETE)\(/gm)]
  return starts.map((match, index) => ({
    method: match[1],
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }))
}

function handler(path, method) {
  const found = handlers(read(path)).find((candidate) => candidate.method === method)
  assert.ok(found, `${method} handler not found in ${path}`)
  return found.body
}

/** One function's source, from its signature to the brace that closes it. */
function functionBody(source, signature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `not found: ${signature}`)
  const indent = source.slice(source.lastIndexOf('\n', start) + 1, start)
  const end = source.indexOf(`\n${indent}}`, start)
  assert.ok(end > start, `end not found: ${signature}`)
  return source.slice(start, end)
}

function assertBefore(body, first, second, where) {
  assert.ok(body.includes(first), `${where}: ${first} is not called`)
  assert.ok(body.includes(second), `${where}: ${second} is not called`)
  assert.ok(body.indexOf(first) < body.indexOf(second), `${where}: ${second} runs before ${first}`)
}

/** The checks that put the tenant boundary in front of a project handler. */
const TENANT_CHECKS = [
  'requireProjectRead(request, projectId)',
  'canManageProject(auth.user, projectId)',
  'assertProjectSecretAccess(request, projectId, ',
]

describe('every /api/projects/[projectId] handler checks the tenant boundary', () => {
  test('each route file declares its handlers the way this file can read them', () => {
    for (const path of routeFiles()) {
      const source = read(path)
      assert.ok(handlers(source).length > 0, `${path} exports no handler this test can see`)
      assert.doesNotMatch(source, /export (const|let|var|function) (GET|POST|PUT|PATCH|DELETE)\b/, path)
    }
  })

  for (const path of routeFiles()) {
    for (const { method, body } of handlers(read(path))) {
      test(`${method} ${path}`, () => {
        // PATCH on the project is an alias that hands the request to PUT.
        if (/^[^\n]*\n[^\n]*\n[^\n]*\n\) \{\n\s+return PUT\(request, \{ params \}\)\n\}/.test(body)) return
        assert.ok(
          TENANT_CHECKS.some((check) => body.includes(check)),
          `${method} ${path} reaches the database without a tenant-boundary check`
        )
      })
    }
  }
})

/** The guard call with its early return on the very next line. */
const READ_GUARD = /const auth = await requireProjectRead\(request, projectId\)\n\s+if \(!auth\.ok\) return auth\.response\n/

/** The manage check with the 403 it returns. */
const MANAGE_GUARD =
  /if \(!\(await canManageProject\(auth\.user, projectId\)\)\) \{\n\s+return NextResponse\.json\(\n\s+\{[^}]*\},\n\s+\{ status: 403 \}\n\s+\)\n\s+\}/

describe('project reads go through requireProjectRead before they load anything', () => {
  test('each read returns the refusal as soon as the guard gives one', () => {
    for (const path of ['route.ts', 'users/route.ts', 'users/[employeeId]/artifacts/route.ts']) {
      assert.match(handler(`${PROJECT_API}${path}`, 'GET'), READ_GUARD, path)
    }
  })

  test('GET /api/projects/[projectId]', () => {
    const body = handler(`${PROJECT_API}route.ts`, 'GET')
    assertBefore(body, 'requireProjectRead(request, projectId)', 'getProjectById(', 'project GET')
    assertBefore(body, 'requireProjectRead(request, projectId)', 'getSubProjects(', 'project GET')
  })

  test('includeDeleted is honoured only for someone who may manage the project', () => {
    const body = handler(`${PROJECT_API}route.ts`, 'GET')
    assert.match(body, /const includeDeleted = wantsDeleted && \(await canManageProject\(auth\.user, projectId\)\)/)
    assert.match(body, /getProjectById\(projectId, includeDeleted\)/)
  })

  test('sub-projects are filtered to the companies the session may see', () => {
    const body = handler(`${PROJECT_API}route.ts`, 'GET')
    assert.match(body, /isInCompanyScope\(scope, subProject\.companyId\)/)
  })

  test('GET /api/projects/[projectId]/users', () => {
    const body = handler(`${PROJECT_API}users/route.ts`, 'GET')
    assertBefore(body, 'requireProjectRead(request, projectId)', 'getProjectUsers(', 'member list GET')
  })

  test('GET /api/projects/[projectId]/users/[employeeId]/artifacts', () => {
    const body = handler(`${PROJECT_API}users/[employeeId]/artifacts/route.ts`, 'GET')
    assertBefore(body, 'requireProjectRead(request, projectId)', 'getUserArtifactCounts(', 'artifact counts GET')
  })
})

describe('project writes check canManageProject before they write', () => {
  const writes = [
    [`${PROJECT_API}route.ts`, 'PUT', 'updateProject('],
    [`${PROJECT_API}route.ts`, 'DELETE', 'softDeleteProject('],
    [`${PROJECT_API}restore/route.ts`, 'POST', 'restoreProject('],
    [`${PROJECT_API}users/route.ts`, 'POST', 'assignUserToProject('],
    [`${PROJECT_API}users/route.ts`, 'PATCH', 'setProjectRole('],
    [`${PROJECT_API}users/route.ts`, 'PATCH', 'setCanEditRequirements('],
    [`${PROJECT_API}users/route.ts`, 'DELETE', 'removeUserFromProject('],
  ]
  for (const [path, method, write] of writes) {
    test(`${method} ${path} before ${write}`, () => {
      const body = handler(path, method)
      assertBefore(body, 'canManageProject(auth.user, projectId)', write, `${method} ${path}`)
      assert.match(body, MANAGE_GUARD, `${method} ${path} does not return a 403 when the check fails`)
    })
  }
})

describe('lib/tenancy/project-guard wires the real lookups and returns the refusal', () => {
  const guard = read('lib/tenancy/project-guard.ts')

  test('the lookups are the database ones, not stand-ins', () => {
    assert.match(guard, /import \{ getProjectCompanyId \} from '\.\.\/db\/projects'/)
    assert.match(guard, /import \{ canAdminCompany, canManageProject, isPlatformAdmin \} from '\.\.\/authz'/)
    assert.match(guard, /const deps: ProjectReadDeps = \{\n  getProjectCompanyId,\n  isPlatformAdmin,\n\}/)
    assert.match(
      functionBody(guard, 'export async function projectReadAccess('),
      /return decideProjectRead\(actor, projectId, deps\)/
    )
  })

  test('requireProjectRead needs a session, then turns a refusal into its response', () => {
    const body = functionBody(guard, 'export async function requireProjectRead(')
    assert.match(body, /const auth = await requireAuth\(request\)\n  if \(!auth\.ok\) return auth\n/)
    assert.match(
      body,
      /const decision = await projectReadAccess\(auth\.user, projectId\)\n  if \(!decision\.allowed\) \{\n    return \{\n      ok: false,/
    )
    assert.match(body, /\{ success: false, error: decision\.message \},\n\s+\{ status: decision\.status \}/)
  })
})

describe('authz project helpers apply the tenant boundary', () => {
  const authz = read('lib/authz.ts')

  test('canManageProject is the tested rule in lib/tenancy/item-access, not a copy', () => {
    const body = functionBody(authz, 'export async function canManageProject(')
    assert.match(body, /return canManageProjectRule\(actor, projectId, projectManageDeps\)/)
    assert.doesNotMatch(body, /getProjectRole\(|canAdminCompany\(/)
  })

  test('canManageProject is given the real lookups', () => {
    assert.match(authz, /import \{ getProjectById, getProjectCompanyId \} from '\.\/db\/projects'/)
    assert.match(
      authz,
      /const projectManageDeps: ProjectManageDeps = \{\n  getProjectCompanyId,\n  isPlatformAdmin,\n  canAdminCompany,\n  getProjectRole,\n\}/
    )
  })

  test('canViewProject checks the company before the admin role or membership', () => {
    const body = functionBody(authz, 'export async function canViewProject(')
    assertBefore(body, 'isSameCompany(actor, companyId)', 'canAdminCompany(', 'canViewProject')
    assertBefore(body, 'isSameCompany(actor, companyId)', 'isUserAssignedToProject(', 'canViewProject')
  })
})

describe('GraphQL project members follow the REST member routes', () => {
  const resolvers = read('graphql/resolvers.ts')

  test('projectUsers requires a session, then the tenant boundary, before it reads project_users', () => {
    const body = functionBody(resolvers, 'projectUsers: async (_: any, { projectId }: any, context: any) => {')
    assertBefore(body, 'requireUser(context)', 'projectReadAccess(actor, projectId)', 'projectUsers')
    assertBefore(body, 'projectReadAccess(actor, projectId)', 'FROM project_users', 'projectUsers')
    assert.match(
      body,
      /if \(!access\.allowed\) \{\n\s+if \(access\.status === 404\) return \[\]\n\s+throw new Error\(`FORBIDDEN: \$\{access\.message\}`\)\n\s+\}/
    )
  })

  test('assertCanManageProject is authz.canManageProject and throws when it fails', () => {
    const body = functionBody(resolvers, 'async function assertCanManageProject(')
    assert.match(body, /const \{ canManageProject \} = await import\('@\/lib\/authz'\)/)
    assert.match(body, /if \(!\(await canManageProject\(actor, projectId\)\)\) \{\n\s+throw new Error\('FORBIDDEN: /)
  })

  for (const [name, write] of [
    ['assignUserToProject', 'INSERT INTO project_users'],
    ['removeUserFromProject', 'DELETE FROM project_users'],
  ]) {
    test(`${name} checks canManageProject before it writes, with no global-role shortcut`, () => {
      const body = functionBody(resolvers, `${name}: async (_: any, { projectId, employeeId }: any, context: any) => {`)
      assertBefore(body, 'const actor = requireUser(context)', 'await assertCanManageProject(actor, projectId)', name)
      assertBefore(body, 'await assertCanManageProject(actor, projectId)', write, name)
      assert.doesNotMatch(body, /'admin'|'top_management'/)
    })
  }

  test('assignUserToProject records the session as the assigner, not an argument', () => {
    const body = functionBody(resolvers, 'assignUserToProject: async (_: any, { projectId, employeeId }: any, context: any) => {')
    assert.match(body, /\[projectId, employeeId, actor\.employeeId\]/)
    assert.doesNotMatch(body, /assignedBy/)
  })
})
