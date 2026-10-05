// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBugListQuery,
  buildProjectTasksQuery,
  buildTaskListQuery,
  buildUserBugsQuery,
  buildUserListQuery,
  buildUserTasksQuery,
  isInCompanyScope,
  listBugs,
  listBugsOfUser,
  listProjects,
  listTasks,
  listTasksOfProject,
  listTasksOfUser,
  listUsers,
  projectListScope,
  userListScope,
  workItemListScope,
} from '../list-scope.ts'

// The 2026-09-29 split: COMP-001 Amtariksha, COMP-002 Swarg Food (PRJ-037), COMP-003 Tattva Silicon.
const comp001Member = { employeeId: 'AM-0002', role: 'employee', companyId: 'COMP-001', isPlatformAdmin: false }
const comp002Member = { employeeId: 'SF-0001', role: 'employee', companyId: 'COMP-002', isPlatformAdmin: false }
const companyAdmin = { employeeId: 'AM-0001', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: false }
const platformAdmin = { employeeId: 'AM-0009', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: true }
const pre062Token = { employeeId: 'AM-0003', role: 'employee' }

const COMPANY_CLAUSE = /AND \(company_id = \$(\d+) OR company_id IS NULL\)/

const WORK_ITEMS = [
  { id: 'TASK-001', company_id: 'COMP-001' },
  { id: 'TASK-037', company_id: 'COMP-002' },
  { id: 'TASK-TS1', company_id: 'COMP-003' },
  { id: 'TASK-OLD', company_id: null },
]

const PROJECTS = [
  { project_id: 'PRJ-001', company_id: 'COMP-001' },
  { project_id: 'PRJ-037', company_id: 'COMP-002' },
  { project_id: 'PRJ-050', company_id: 'COMP-003' },
  { project_id: 'PRJ-LEGACY', company_id: null },
]

function visibleIds(scope, rows, key) {
  return rows.filter((row) => isInCompanyScope(scope, row.company_id)).map((row) => row[key])
}

/** Every `$n` in the text is backed by a value, and every value is used. */
function assertParamsLineUp({ text, values }) {
  const used = [...new Set([...text.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b)
  assert.deepEqual(used, values.map((_, index) => index + 1))
}

/** The value bound to the first placeholder that follows `sqlBefore` in the text. */
function valueBoundAfter({ text, values }, sqlBefore) {
  const escaped = sqlBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\$(\\d+)`))
  assert.ok(match, `no placeholder after "${sqlBefore}"`)
  return values[Number(match[1]) - 1]
}

/** The value bound to the company clause, or undefined when the query is unscoped. */
function scopedCompany({ text, values }) {
  const match = text.match(COMPANY_CLAUSE)
  return match ? values[Number(match[1]) - 1] : undefined
}

function recordingDeps(rows = []) {
  const calls = []
  return {
    calls,
    query: async (text, values) => {
      calls.push({ text, values })
      return rows
    },
  }
}

describe('workItemListScope — mirrors /api/tasks and /api/bugs', () => {
  test('a member is scoped to the company the session is acting in', () => {
    assert.deepEqual(workItemListScope(comp001Member), { all: false, companyId: 'COMP-001' })
    assert.deepEqual(workItemListScope(comp002Member), { all: false, companyId: 'COMP-002' })
  })

  test('a company admin is scoped like any member of that company', () => {
    assert.deepEqual(workItemListScope(companyAdmin), { all: false, companyId: 'COMP-001' })
  })

  test('a platform admin is scoped to the active company, as the REST routes do', () => {
    assert.deepEqual(workItemListScope(platformAdmin), { all: false, companyId: 'COMP-001' })
  })

  test('a token without a company is not filtered (pre-062 fail-open)', () => {
    assert.deepEqual(workItemListScope(pre062Token), { all: true })
    assert.deepEqual(workItemListScope({ ...pre062Token, companyId: null }), { all: true })
  })
})

describe('projectListScope — mirrors /api/projects', () => {
  test('members and company admins are scoped to the active company', () => {
    assert.deepEqual(projectListScope(comp001Member), { all: false, companyId: 'COMP-001' })
    assert.deepEqual(projectListScope(comp002Member), { all: false, companyId: 'COMP-002' })
    assert.deepEqual(projectListScope(companyAdmin), { all: false, companyId: 'COMP-001' })
  })

  test('a platform admin keeps the wide view', () => {
    assert.deepEqual(projectListScope(platformAdmin), { all: true })
  })

  test('a token without a company is not filtered', () => {
    assert.deepEqual(projectListScope(pre062Token), { all: true })
  })
})

describe('isInCompanyScope — who sees which work items', () => {
  test('a COMP-001 member sees COMP-001 and unscoped legacy items only', () => {
    assert.deepEqual(visibleIds(workItemListScope(comp001Member), WORK_ITEMS, 'id'), ['TASK-001', 'TASK-OLD'])
  })

  test('a COMP-002 member sees COMP-002 and unscoped legacy items only', () => {
    assert.deepEqual(visibleIds(workItemListScope(comp002Member), WORK_ITEMS, 'id'), ['TASK-037', 'TASK-OLD'])
  })

  test('a company admin does not see other companies', () => {
    assert.deepEqual(visibleIds(workItemListScope(companyAdmin), WORK_ITEMS, 'id'), ['TASK-001', 'TASK-OLD'])
  })

  test('a platform admin sees the active company until they switch', () => {
    assert.deepEqual(visibleIds(workItemListScope(platformAdmin), WORK_ITEMS, 'id'), ['TASK-001', 'TASK-OLD'])
    const switchedToSwarg = { ...platformAdmin, companyId: 'COMP-002' }
    assert.deepEqual(visibleIds(workItemListScope(switchedToSwarg), WORK_ITEMS, 'id'), ['TASK-037', 'TASK-OLD'])
  })

  test('treats an empty company like NULL, as /api/projects does', () => {
    assert.equal(isInCompanyScope({ all: false, companyId: 'COMP-001' }, ''), true)
    assert.equal(isInCompanyScope({ all: false, companyId: 'COMP-001' }, undefined), true)
  })
})

describe('buildTaskListQuery', () => {
  test('scopes an unfiltered list to the session company', () => {
    const built = buildTaskListQuery(comp002Member, {})
    assert.match(built.text, /^SELECT \* FROM tasks WHERE deleted_at IS NULL AND \(company_id = \$1 OR company_id IS NULL\)/)
    assert.deepEqual(built.values, ['COMP-002'])
  })

  test('scopes a platform admin to the active company', () => {
    assert.equal(scopedCompany(buildTaskListQuery(platformAdmin, {})), 'COMP-001')
  })

  test('adds no company clause for a token without a company', () => {
    const built = buildTaskListQuery(pre062Token, {})
    assert.doesNotMatch(built.text, /company_id/)
    assert.deepEqual(built.values, [])
  })

  test('binds every filter to its own column when all are combined', () => {
    const filters = {
      assignedTo: ['AM-0002', 'AM-0004'],
      assignedBy: ['AM-0001'],
      status: ['In Progress'],
      priority: ['High'],
      projectId: 'PRJ-001',
      projectIds: ['PRJ-001', 'PRJ-002'],
      subprojectId: 'PRJ-001-A',
      limit: 50,
      offset: 100,
    }
    const built = buildTaskListQuery(comp001Member, filters)
    assertParamsLineUp(built)
    assert.equal(scopedCompany(built), 'COMP-001')
    assert.equal(valueBoundAfter(built, 'assigned_to::jsonb ?| '), filters.assignedTo)
    assert.equal(valueBoundAfter(built, 'support::jsonb END) ?| '), filters.assignedTo)
    assert.equal(valueBoundAfter(built, 'AND assigned_by = ANY('), filters.assignedBy)
    assert.equal(valueBoundAfter(built, 'AND status = ANY('), filters.status)
    assert.equal(valueBoundAfter(built, 'AND priority = ANY('), filters.priority)
    assert.equal(valueBoundAfter(built, 'AND project_id = '), filters.projectId)
    assert.equal(valueBoundAfter(built, 'AND project_id = ANY('), filters.projectIds)
    assert.equal(valueBoundAfter(built, 'AND subproject_id = '), filters.subprojectId)
    assert.equal(valueBoundAfter(built, 'LIMIT '), 50)
    assert.equal(valueBoundAfter(built, 'OFFSET '), 100)
    assert.match(built.text, /LIMIT \$9 OFFSET \$10$/)
  })

  test('ignores empty and null filters', () => {
    const built = buildTaskListQuery(comp001Member, {
      assignedTo: [],
      status: null,
      projectId: null,
      limit: null,
      offset: 0,
    })
    assert.deepEqual(built.values, ['COMP-001'])
    assert.doesNotMatch(built.text, /LIMIT|OFFSET|assigned_to/)
  })

  test('never writes the company id into the SQL text', () => {
    const hostile = { ...comp001Member, companyId: "COMP-001' OR '1'='1" }
    const built = buildTaskListQuery(hostile, {})
    assert.equal(built.text.includes(hostile.companyId), false)
    assert.deepEqual(built.values, [hostile.companyId])
  })
})

describe('buildBugListQuery', () => {
  test('scopes an unfiltered list to the session company', () => {
    const built = buildBugListQuery(comp001Member, {})
    assert.match(built.text, /^SELECT \* FROM bugs WHERE deleted_at IS NULL AND \(company_id = \$1 OR company_id IS NULL\)/)
    assert.deepEqual(built.values, ['COMP-001'])
  })

  test('scopes a platform admin to the active company', () => {
    assert.equal(scopedCompany(buildBugListQuery(platformAdmin, {})), 'COMP-001')
  })

  test('adds no company clause for a token without a company', () => {
    const built = buildBugListQuery(pre062Token, { status: ['New'] })
    assert.doesNotMatch(built.text, /company_id/)
    assert.deepEqual(built.values, [['New']])
  })

  test('binds every filter to its own column when all are combined', () => {
    const filters = {
      assignedTo: ['SF-0001'],
      reportedBy: ['SF-0002'],
      status: ['New'],
      severity: ['Major'],
      category: ['UI'],
      type: ['bug', 'feature'],
      projectId: 'PRJ-037',
      projectIds: ['PRJ-037', 'PRJ-045'],
      subprojectId: 'PRJ-037-A',
      limit: 20,
      offset: 40,
    }
    const built = buildBugListQuery(comp002Member, filters)
    assertParamsLineUp(built)
    assert.equal(scopedCompany(built), 'COMP-002')
    assert.equal(built.values.length, 12)
    assert.equal(valueBoundAfter(built, 'AND assigned_to = ANY('), filters.assignedTo)
    assert.equal(valueBoundAfter(built, 'AND reported_by = ANY('), filters.reportedBy)
    assert.equal(valueBoundAfter(built, 'AND status = ANY('), filters.status)
    assert.equal(valueBoundAfter(built, 'AND severity = ANY('), filters.severity)
    assert.equal(valueBoundAfter(built, 'AND category = ANY('), filters.category)
    assert.equal(valueBoundAfter(built, 'AND type = ANY('), filters.type)
    assert.equal(valueBoundAfter(built, 'AND project_id = '), filters.projectId)
    assert.equal(valueBoundAfter(built, 'AND project_id = ANY('), filters.projectIds)
    assert.equal(valueBoundAfter(built, 'AND subproject_id = '), filters.subprojectId)
    assert.equal(valueBoundAfter(built, 'LIMIT '), 20)
    assert.equal(valueBoundAfter(built, 'OFFSET '), 40)
  })
})

describe('nested list fields', () => {
  test('User.tasks matches the user and is scoped to the session company', () => {
    const built = buildUserTasksQuery(comp001Member, 'SF-0001')
    assertParamsLineUp(built)
    assert.deepEqual(built.values, ['SF-0001', 'COMP-001'])
    assert.equal((built.text.match(/elem = \$1/g) || []).length, 2)
    assert.equal(scopedCompany(built), 'COMP-001')
  })

  test('User.bugs is scoped to the session company', () => {
    const built = buildUserBugsQuery(comp002Member, 'AM-0002')
    assertParamsLineUp(built)
    assert.match(built.text, /assigned_to = \$1/)
    assert.equal(scopedCompany(built), 'COMP-002')
  })

  test('Project.tasks is scoped to the session company', () => {
    const built = buildProjectTasksQuery(comp001Member, 'PRJ-037')
    assertParamsLineUp(built)
    assert.match(built.text, /project_id = \$1/)
    assert.deepEqual(built.values, ['PRJ-037', 'COMP-001'])
  })

  test('nested fields are unscoped only for a token without a company', () => {
    assert.equal(scopedCompany(buildUserTasksQuery(platformAdmin, 'AM-0002')), 'COMP-001')
    assert.equal(scopedCompany(buildUserBugsQuery(pre062Token, 'AM-0002')), undefined)
    assert.equal(scopedCompany(buildProjectTasksQuery(pre062Token, 'PRJ-001')), undefined)
  })
})

describe('list functions run the scoped SQL through the injected query', () => {
  const cases = [
    ['listTasks', (deps) => listTasks(comp002Member, {}, deps), buildTaskListQuery(comp002Member, {})],
    ['listBugs', (deps) => listBugs(comp002Member, {}, deps), buildBugListQuery(comp002Member, {})],
    ['listTasksOfUser', (deps) => listTasksOfUser(comp002Member, 'AM-0002', deps), buildUserTasksQuery(comp002Member, 'AM-0002')],
    ['listBugsOfUser', (deps) => listBugsOfUser(comp002Member, 'AM-0002', deps), buildUserBugsQuery(comp002Member, 'AM-0002')],
    ['listTasksOfProject', (deps) => listTasksOfProject(comp002Member, 'PRJ-001', deps), buildProjectTasksQuery(comp002Member, 'PRJ-001')],
    ['listUsers', (deps) => listUsers(comp002Member, deps), buildUserListQuery(comp002Member)],
  ]

  for (const [name, call, expected] of cases) {
    test(name, async () => {
      const rows = [{ id: 'row' }]
      const deps = recordingDeps(rows)
      assert.equal(await call(deps), rows)
      assert.deepEqual(deps.calls, [expected])
    })
  }
})

describe('listProjects', () => {
  async function projectIdsFor(actor) {
    const rows = await listProjects(actor, recordingDeps(PROJECTS))
    return rows.map((row) => row.project_id)
  }

  test('a COMP-001 member no longer sees Swarg or Tattva Silicon projects', async () => {
    assert.deepEqual(await projectIdsFor(comp001Member), ['PRJ-001', 'PRJ-LEGACY'])
  })

  test('a COMP-002 member sees PRJ-037', async () => {
    assert.deepEqual(await projectIdsFor(comp002Member), ['PRJ-037', 'PRJ-LEGACY'])
  })

  test('a company admin sees only their company', async () => {
    assert.deepEqual(await projectIdsFor(companyAdmin), ['PRJ-001', 'PRJ-LEGACY'])
  })

  test('a platform admin and a pre-062 token see every project', async () => {
    const everything = PROJECTS.map((project) => project.project_id)
    assert.deepEqual(await projectIdsFor(platformAdmin), everything)
    assert.deepEqual(await projectIdsFor(pre062Token), everything)
  })

  test('reads non-deleted projects with no interpolated values', async () => {
    const deps = recordingDeps([])
    await listProjects(comp001Member, deps)
    assert.deepEqual(deps.calls, [
      { text: 'SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY project_name ASC', values: [] },
    ])
  })
})

describe('users — mirrors GET /api/users', () => {
  test('members and company admins are scoped to the active company', () => {
    assert.deepEqual(userListScope(comp001Member), { all: false, companyId: 'COMP-001' })
    assert.deepEqual(userListScope(comp002Member), { all: false, companyId: 'COMP-002' })
    assert.deepEqual(userListScope(companyAdmin), { all: false, companyId: 'COMP-001' })
  })

  test('a platform admin and a token without a company keep the wide view', () => {
    assert.deepEqual(userListScope(platformAdmin), { all: true })
    assert.deepEqual(userListScope(pre062Token), { all: true })
  })

  test('a scoped list joins the session company\'s memberships and binds the company', () => {
    const built = buildUserListQuery(comp002Member)
    assert.match(built.text, /JOIN user_companies uc ON uc\.employee_id = u\.employee_id/)
    assert.equal(valueBoundAfter(built, 'uc.company_id = '), 'COMP-002')
    assert.ok(!built.text.includes('COMP-002'))
    assertParamsLineUp(built)
  })

  test('inactive users stay in the list, active first, as the resolver always returned them', () => {
    const built = buildUserListQuery(comp001Member)
    const where = built.text.slice(built.text.indexOf('WHERE'), built.text.indexOf('ORDER BY'))
    assert.doesNotMatch(where, /status/)
    assert.match(built.text, /ORDER BY CASE WHEN u\.status = 'active' THEN 0 ELSE 1 END, u\.name ASC$/)
  })

  test('the wide view is the unscoped query the resolver always ran', () => {
    assert.deepEqual(buildUserListQuery(platformAdmin), {
      text: "SELECT * FROM users ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, name ASC",
      values: [],
    })
    assert.deepEqual(buildUserListQuery(pre062Token), buildUserListQuery(platformAdmin))
  })
})
