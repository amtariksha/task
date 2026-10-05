// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  bugAccessFacts,
  canViewBug,
  canViewProjectRequirements,
  canViewTask,
  isSameCompany,
  readBug,
  readTask,
  taskAccessFacts,
} from '../item-access.ts'

// The 2026-09-29 split: COMP-001 Amtariksha, COMP-002 Swarg Food (PRJ-037), COMP-003 Tattva Silicon.
const comp001Member = { employeeId: 'AM-0002', role: 'employee', companyId: 'COMP-001', isPlatformAdmin: false }
const comp002Member = { employeeId: 'SF-0001', role: 'employee', companyId: 'COMP-002', isPlatformAdmin: false }
const companyAdmin = { employeeId: 'AM-0001', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: false }
const platformAdmin = { employeeId: 'AM-0009', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: true }
const platformAdminInComp002 = { ...platformAdmin, companyId: 'COMP-002' }
// The same COMP-001 member on a token issued before migration 062.
const pre062Token = { employeeId: 'AM-0002', role: 'employee' }

const PROJECT_COMPANY = {
  'PRJ-001': 'COMP-001',
  'PRJ-037': 'COMP-002',
  'PRJ-050': 'COMP-003',
  'PRJ-LEGACY': null,
}

// AM-0002 still holds a PRJ-037 membership from before the project moved to COMP-002.
const PROJECT_MEMBERS = {
  'PRJ-001': ['AM-0002'],
  'PRJ-037': ['AM-0002', 'SF-0001'],
  'PRJ-050': [],
  'PRJ-LEGACY': ['AM-0002'],
}

// Company roles as user_companies holds them; AM-0001 is a legacy global admin, not a company_admin.
const COMPANY_ROLES = {
  'AM-0001': { 'COMP-001': 'member' },
  'AM-0002': { 'COMP-001': 'member' },
  'SF-0001': { 'COMP-002': 'member' },
  'SF-0002': { 'COMP-002': 'company_admin' },
}

// Rows as the GraphQL loaders return them: snake_case, JSONB already parsed.
const TASKS = [
  { task_id: 'TASK-C1', company_id: 'COMP-001', project_id: 'PRJ-001', assigned_to: ['AM-0002'], assigned_by: 'AM-0001', support: null },
  { task_id: 'TASK-P1', company_id: 'COMP-001', project_id: 'PRJ-001', assigned_to: ['AM-0005'], assigned_by: 'AM-0005', support: null },
  { task_id: 'TASK-C2', company_id: 'COMP-002', project_id: 'PRJ-037', assigned_to: ['SF-0001'], assigned_by: 'SF-0001', support: ['AM-0002'] },
  { task_id: 'TASK-C3', company_id: 'COMP-003', project_id: 'PRJ-050', assigned_to: ['AM-0002'], assigned_by: 'AM-0001', support: null },
  { task_id: 'TASK-NULL', company_id: null, project_id: null, assigned_to: ['AM-0002'], assigned_by: 'AM-0001', support: null },
]

const BUGS = [
  { bug_id: 'BUG-C1', company_id: 'COMP-001', project_id: 'PRJ-001', assigned_to: 'AM-0002', reported_by: 'AM-0001' },
  { bug_id: 'BUG-P1', company_id: 'COMP-001', project_id: 'PRJ-001', assigned_to: 'AM-0005', reported_by: 'AM-0005' },
  { bug_id: 'BUG-C2', company_id: 'COMP-002', project_id: 'PRJ-037', assigned_to: 'AM-0002', reported_by: 'SF-0001' },
  { bug_id: 'BUG-C3', company_id: 'COMP-003', project_id: 'PRJ-050', assigned_to: 'AM-0002', reported_by: 'AM-0001' },
  { bug_id: 'BUG-NULL', company_id: null, project_id: null, assigned_to: 'AM-0002', reported_by: 'AM-0001' },
]

/** Fake lookups with the database's answers, recording every call. */
function fakeDeps() {
  const calls = []
  const record = (name, ...args) => calls.push([name, ...args])
  const isPlatformAdmin = async (actor) => {
    record('isPlatformAdmin', actor.employeeId)
    return actor.isPlatformAdmin === true
  }
  return {
    calls,
    isPlatformAdmin,
    isProjectMember: async (projectId, employeeId) => {
      record('isProjectMember', projectId, employeeId)
      return (PROJECT_MEMBERS[projectId] ?? []).includes(employeeId)
    },
    getProjectCompanyId: async (projectId) => {
      record('getProjectCompanyId', projectId)
      return projectId in PROJECT_COMPANY ? PROJECT_COMPANY[projectId] : undefined
    },
    // authz.canAdminCompany
    canAdminCompany: async (actor, companyId) => {
      record('canAdminCompany', actor.employeeId, companyId)
      if (await isPlatformAdmin(actor)) return true
      const companyRole = COMPANY_ROLES[actor.employeeId]?.[companyId] ?? null
      if (companyRole === 'company_admin') return true
      return ['admin', 'top_management'].includes(actor.role) && companyRole !== null
    },
    loadTask: async (taskId) => TASKS.find((task) => task.task_id === taskId) ?? null,
    loadBug: async (bugId) => BUGS.find((bug) => bug.bug_id === bugId) ?? null,
  }
}

async function visibleTasks(actor) {
  const deps = fakeDeps()
  const visible = []
  for (const row of TASKS) {
    if (await canViewTask(actor, taskAccessFacts(row), deps)) visible.push(row.task_id)
  }
  return visible
}

async function visibleBugs(actor) {
  const deps = fakeDeps()
  const visible = []
  for (const row of BUGS) {
    if (await canViewBug(actor, bugAccessFacts(row), deps)) visible.push(row.bug_id)
  }
  return visible
}

const task = (overrides) => ({ companyId: 'COMP-001', projectId: null, assignees: [], assignedBy: null, supporters: [], ...overrides })
const bug = (overrides) => ({ companyId: 'COMP-001', projectId: null, assignedTo: null, reportedBy: null, ...overrides })

describe('isSameCompany — mirrors authz.isSameCompany', () => {
  test('a record in the session company passes without a platform-admin lookup', async () => {
    const deps = fakeDeps()
    assert.equal(await isSameCompany(comp001Member, 'COMP-001', deps), true)
    assert.deepEqual(deps.calls, [])
  })

  test('another company is refused unless the actor is a platform admin', async () => {
    assert.equal(await isSameCompany(comp001Member, 'COMP-002', fakeDeps()), false)
    assert.equal(await isSameCompany(companyAdmin, 'COMP-002', fakeDeps()), false)
    assert.equal(await isSameCompany(platformAdmin, 'COMP-002', fakeDeps()), true)
  })

  test('fails open for a record with no company and a token with no company', async () => {
    assert.equal(await isSameCompany(comp002Member, null, fakeDeps()), true)
    assert.equal(await isSameCompany(comp002Member, '', fakeDeps()), true)
    assert.equal(await isSameCompany(pre062Token, 'COMP-003', fakeDeps()), true)
  })
})

describe('canViewTask — mirrors canAccessTask in /api/tasks/[taskId]', () => {
  test('a COMP-001 member sees their own and their project\'s COMP-001 tasks, plus legacy ones', async () => {
    assert.deepEqual(await visibleTasks(comp001Member), ['TASK-C1', 'TASK-P1', 'TASK-NULL'])
  })

  test('a COMP-002 member sees only their COMP-002 task', async () => {
    assert.deepEqual(await visibleTasks(comp002Member), ['TASK-C2'])
  })

  test('a company admin sees all of their company and nothing of another', async () => {
    assert.deepEqual(await visibleTasks(companyAdmin), ['TASK-C1', 'TASK-P1', 'TASK-NULL'])
  })

  test('a platform admin with the admin role sees every company', async () => {
    assert.deepEqual(await visibleTasks(platformAdmin), ['TASK-C1', 'TASK-P1', 'TASK-C2', 'TASK-C3', 'TASK-NULL'])
    assert.deepEqual(await visibleTasks(platformAdminInComp002), ['TASK-C1', 'TASK-P1', 'TASK-C2', 'TASK-C3', 'TASK-NULL'])
  })

  test('the platform-admin flag crosses the tenant boundary but grants nothing on its own', async () => {
    const platformEmployee = { employeeId: 'AM-0009', role: 'employee', companyId: 'COMP-001', isPlatformAdmin: true }
    assert.deepEqual(await visibleTasks(platformEmployee), [])
    assert.deepEqual(await visibleTasks({ ...platformEmployee, employeeId: 'AM-0002' }),
      ['TASK-C1', 'TASK-P1', 'TASK-C2', 'TASK-C3', 'TASK-NULL'])
  })

  test('a token with no company falls back to the pre-tenancy rules', async () => {
    assert.deepEqual(await visibleTasks(pre062Token), ['TASK-C1', 'TASK-P1', 'TASK-C2', 'TASK-C3', 'TASK-NULL'])
  })

  test('checks the tenant boundary before the role, people or membership', async () => {
    const deps = fakeDeps()
    const crossCompany = task({ companyId: 'COMP-002', projectId: 'PRJ-037', assignees: ['AM-0001'], assignedBy: 'AM-0001' })
    assert.equal(await canViewTask(companyAdmin, crossCompany, deps), false)
    assert.deepEqual(deps.calls, [['isPlatformAdmin', 'AM-0001']])
  })

  test('each of the item\'s people is let in, and nobody else without membership', async () => {
    const deps = fakeDeps()
    assert.equal(await canViewTask(comp001Member, task({ assignees: ['AM-0005', 'AM-0002'] }), deps), true)
    assert.equal(await canViewTask(comp001Member, task({ assignedBy: 'AM-0002' }), deps), true)
    assert.equal(await canViewTask(comp001Member, task({ supporters: ['AM-0002'] }), deps), true)
    assert.equal(await canViewTask(comp001Member, task({ assignees: ['AM-0005'], assignedBy: 'AM-0005' }), deps), false)
    assert.deepEqual(deps.calls, [])
  })

  test('a supporter stored as a single string is not let in, as over REST', async () => {
    const row = { company_id: 'COMP-001', project_id: null, assigned_to: ['AM-0005'], assigned_by: 'AM-0005', support: '"AM-0002"' }
    assert.equal(await canViewTask(comp001Member, taskAccessFacts(row), fakeDeps()), false)
  })

  test('project membership is consulted last, and only with a project', async () => {
    const deps = fakeDeps()
    assert.equal(await canViewTask(comp001Member, task({ projectId: 'PRJ-001' }), deps), true)
    assert.equal(await canViewTask(comp001Member, task({ projectId: 'PRJ-050' }), deps), false)
    assert.deepEqual(deps.calls, [
      ['isProjectMember', 'PRJ-001', 'AM-0002'],
      ['isProjectMember', 'PRJ-050', 'AM-0002'],
    ])
  })

  test('top_management is the other legacy admin role', async () => {
    const topManagement = { employeeId: 'AM-0004', role: 'top_management', companyId: 'COMP-001', isPlatformAdmin: false }
    assert.equal(await canViewTask(topManagement, task({}), fakeDeps()), true)
    assert.equal(await canViewTask(topManagement, task({ companyId: 'COMP-002' }), fakeDeps()), false)
  })
})

describe('taskAccessFacts — reads assignees the way rowToTask does', () => {
  test('takes JSONB arrays as the driver parses them', () => {
    const facts = taskAccessFacts(TASKS[2])
    assert.deepEqual(facts, {
      companyId: 'COMP-002',
      projectId: 'PRJ-037',
      assignees: ['SF-0001'],
      assignedBy: 'SF-0001',
      supporters: ['AM-0002'],
    })
  })

  test('parses JSON text, so a supporter stored as text is still a supporter', () => {
    const facts = taskAccessFacts({ assigned_to: '["AM-0002","AM-0003"]', support: ' ["AM-0004"] ' })
    assert.deepEqual(facts.assignees, ['AM-0002', 'AM-0003'])
    assert.deepEqual(facts.supporters, ['AM-0004'])
  })

  test('a single JSON string is an assignee but not a supporter, as in canAccessTask', () => {
    const facts = taskAccessFacts({ assigned_to: '"AM-0002"', support: '"AM-0002"' })
    assert.deepEqual(facts.assignees, ['AM-0002'])
    assert.deepEqual(facts.supporters, [])
  })

  test('text that is not JSON grants nothing, as rowToTask parses it to an empty list', () => {
    const facts = taskAccessFacts({ assigned_to: 'AM-0002', support: 'AM-0002' })
    assert.deepEqual(facts.assignees, [])
    assert.deepEqual(facts.supporters, [])
  })

  test('empty, null and non-string values give no people and no company', () => {
    for (const empty of [null, undefined, '', '  ', 'null', '[]', 42, {}, { 0: 'AM-0002' }]) {
      const facts = taskAccessFacts({ assigned_to: empty, support: empty })
      assert.deepEqual(facts.assignees, [], `assigned_to ${JSON.stringify(empty)}`)
      assert.deepEqual(facts.supporters, [], `support ${JSON.stringify(empty)}`)
    }
    assert.deepEqual(taskAccessFacts({ support: ['AM-0002', null, 7] }).supporters, ['AM-0002'])
    assert.deepEqual(taskAccessFacts({ assigned_to: ['AM-0002', null, 7] }).assignees, ['AM-0002'])
    assert.equal(taskAccessFacts({ company_id: '' }).companyId, null)
    assert.equal(taskAccessFacts({ assigned_by: '' }).assignedBy, null)
  })
})

describe('canViewBug — mirrors canAccessBug in /api/bugs/[bugId]', () => {
  test('a COMP-001 member sees their own and their project\'s COMP-001 bugs, plus legacy ones', async () => {
    assert.deepEqual(await visibleBugs(comp001Member), ['BUG-C1', 'BUG-P1', 'BUG-NULL'])
  })

  test('a COMP-002 member sees only the COMP-002 bug they reported', async () => {
    assert.deepEqual(await visibleBugs(comp002Member), ['BUG-C2'])
  })

  test('a company admin sees all of their company and nothing of another', async () => {
    assert.deepEqual(await visibleBugs(companyAdmin), ['BUG-C1', 'BUG-P1', 'BUG-NULL'])
  })

  test('a platform admin with the admin role sees every company', async () => {
    assert.deepEqual(await visibleBugs(platformAdmin), ['BUG-C1', 'BUG-P1', 'BUG-C2', 'BUG-C3', 'BUG-NULL'])
  })

  test('a token with no company falls back to the pre-tenancy rules', async () => {
    assert.deepEqual(await visibleBugs(pre062Token), ['BUG-C1', 'BUG-P1', 'BUG-C2', 'BUG-C3', 'BUG-NULL'])
  })

  test('checks the tenant boundary before the role, people or membership', async () => {
    const deps = fakeDeps()
    const crossCompany = bug({ companyId: 'COMP-002', projectId: 'PRJ-037', assignedTo: 'AM-0002', reportedBy: 'AM-0002' })
    assert.equal(await canViewBug(comp001Member, crossCompany, deps), false)
    assert.deepEqual(deps.calls, [['isPlatformAdmin', 'AM-0002']])
  })

  test('the reporter and the assignee are let in; membership is consulted last', async () => {
    const deps = fakeDeps()
    assert.equal(await canViewBug(comp001Member, bug({ reportedBy: 'AM-0002' }), deps), true)
    assert.equal(await canViewBug(comp001Member, bug({ assignedTo: 'AM-0002' }), deps), true)
    assert.equal(await canViewBug(comp001Member, bug({ assignedTo: 'AM-0005', reportedBy: 'AM-0005' }), deps), false)
    assert.deepEqual(deps.calls, [])
    assert.equal(await canViewBug(comp001Member, bug({ projectId: 'PRJ-001' }), deps), true)
    assert.deepEqual(deps.calls, [['isProjectMember', 'PRJ-001', 'AM-0002']])
  })

  test('bugAccessFacts reads the bug columns', () => {
    assert.deepEqual(bugAccessFacts(BUGS[2]), {
      companyId: 'COMP-002',
      projectId: 'PRJ-037',
      assignedTo: 'AM-0002',
      reportedBy: 'SF-0001',
    })
    assert.deepEqual(bugAccessFacts({}), { companyId: null, projectId: null, assignedTo: null, reportedBy: null })
  })
})

describe('readTask / readBug — what the single-item queries return', () => {
  test('returns the loaded row itself when the caller may see it', async () => {
    const found = await readTask(comp001Member, 'TASK-C1', fakeDeps())
    assert.equal(found.status, 'found')
    assert.equal(found.row, TASKS[0])
    const foundBug = await readBug(comp002Member, 'BUG-C2', fakeDeps())
    assert.equal(foundBug.status, 'found')
    assert.equal(foundBug.row, BUGS[2])
  })

  test('refuses another company\'s item by id', async () => {
    assert.deepEqual(await readTask(comp001Member, 'TASK-C2', fakeDeps()), { status: 'forbidden' })
    assert.deepEqual(await readTask(comp002Member, 'TASK-C1', fakeDeps()), { status: 'forbidden' })
    assert.deepEqual(await readTask(companyAdmin, 'TASK-C3', fakeDeps()), { status: 'forbidden' })
    assert.deepEqual(await readBug(comp001Member, 'BUG-C2', fakeDeps()), { status: 'forbidden' })
    assert.deepEqual(await readBug(companyAdmin, 'BUG-C3', fakeDeps()), { status: 'forbidden' })
  })

  test('reports a missing item without running any access check', async () => {
    const deps = fakeDeps()
    assert.deepEqual(await readTask(comp001Member, 'TASK-NOPE', deps), { status: 'not_found' })
    assert.deepEqual(await readBug(comp001Member, 'BUG-NOPE', deps), { status: 'not_found' })
    assert.deepEqual(deps.calls, [])
  })
})

describe('canViewProjectRequirements — authz.canViewProject behind the tenant boundary', () => {
  const canView = (actor, projectId, deps = fakeDeps()) => canViewProjectRequirements(actor, projectId, deps)

  test('a member sees their own company\'s project', async () => {
    assert.equal(await canView(comp001Member, 'PRJ-001'), true)
    assert.equal(await canView(comp002Member, 'PRJ-037'), true)
  })

  test('a membership left over from before the split does not cross companies', async () => {
    const deps = fakeDeps()
    assert.equal(await canView(comp001Member, 'PRJ-037', deps), false)
    assert.ok(!deps.calls.some(([name]) => name === 'isProjectMember' || name === 'canAdminCompany'))
  })

  test('a global admin role no longer opens another company\'s project', async () => {
    assert.equal(await canView(companyAdmin, 'PRJ-001'), true)
    assert.equal(await canView(companyAdmin, 'PRJ-037'), false)
    assert.equal(await canView(companyAdmin, 'PRJ-050'), false)
  })

  test('a company admin sees every project of their company without membership', async () => {
    const swargAdmin = { employeeId: 'SF-0002', role: 'employee', companyId: 'COMP-002', isPlatformAdmin: false }
    const deps = fakeDeps()
    assert.equal(await canView(swargAdmin, 'PRJ-037', deps), true)
    assert.ok(!deps.calls.some(([name]) => name === 'isProjectMember'))
  })

  test('a platform admin sees every company\'s project', async () => {
    for (const projectId of ['PRJ-001', 'PRJ-037', 'PRJ-050', 'PRJ-LEGACY']) {
      assert.equal(await canView(platformAdmin, projectId), true, projectId)
    }
  })

  test('a project with no company needs membership — no global-role shortcut', async () => {
    assert.equal(await canView(comp001Member, 'PRJ-LEGACY'), true)
    assert.equal(await canView(companyAdmin, 'PRJ-LEGACY'), false)
    assert.equal(await canView(comp002Member, 'PRJ-LEGACY'), false)
  })

  test('a token with no company is judged by company role and membership', async () => {
    const pre062Admin = { employeeId: 'AM-0001', role: 'admin' }
    assert.equal(await canView(pre062Admin, 'PRJ-001'), true)
    assert.equal(await canView(pre062Admin, 'PRJ-037'), false)
    assert.equal(await canView(pre062Token, 'PRJ-037'), true)
  })

  test('an unknown project is refused', async () => {
    assert.equal(await canView(platformAdmin, 'PRJ-NOPE'), false)
  })
})
