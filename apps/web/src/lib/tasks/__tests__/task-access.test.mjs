// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  TASK_FORBIDDEN_MESSAGE,
  TASK_NOT_FOUND_MESSAGE,
  TASK_OWNERSHIP_SQL,
  assertCanModifyTask,
  canModifyTask,
  taskOwnershipFromRow,
} from '../task-access.ts'

// COMP-001: AM-0001 (company admin), AM-0002 (reports to AM-0004), AM-0003, AM-0004,
//           AM-0005 (manages PRJ-1)
// COMP-002: BX-0001, BX-0002 (company admin)
// PA-0001 is a platform admin whose session is in COMP-002.
const PROJECT_COMPANY = { 'PRJ-1': 'COMP-001' }
const PROJECT_LEADS = { 'PRJ-1': ['AM-0005'] }
const COMPANY_ADMINS = { 'COMP-001': ['AM-0001'], 'COMP-002': ['BX-0002'] }
const MANAGER_OF = { 'AM-0002': 'AM-0004' }

function isAbove(managerId, employeeId) {
  for (let current = MANAGER_OF[employeeId]; current; current = MANAGER_OF[current]) {
    if (current === managerId) return true
  }
  return false
}

/**
 * Stands in for lib/authz.canEditWorkItem over the fixtures above — tenant
 * boundary first, then owner, project lead, company admin, reporting chain — and
 * records every work item it is asked about.
 */
function makeDeps({ rows = [] } = {}) {
  const calls = []
  const queries = []
  return {
    calls,
    queries,
    query: async (text, values) => {
      queries.push({ text, values })
      return rows
    },
    canEditWorkItem: async (actor, item) => {
      calls.push(item)
      const crossTenant = item.companyId && actor.companyId && item.companyId !== actor.companyId
      if (crossTenant && !actor.isPlatformAdmin) return false
      if (item.ownerEmployeeId && item.ownerEmployeeId === actor.employeeId) return true
      if (item.projectId) {
        if ((PROJECT_LEADS[item.projectId] ?? []).includes(actor.employeeId)) return true
        const companyAdmins = COMPANY_ADMINS[PROJECT_COMPANY[item.projectId]] ?? []
        if (actor.isPlatformAdmin || companyAdmins.includes(actor.employeeId)) return true
      } else if (actor.role === 'admin' || actor.isPlatformAdmin) {
        return true
      }
      return Boolean(item.ownerEmployeeId) && isAbove(actor.employeeId, item.ownerEmployeeId)
    },
  }
}

const actor = (employeeId, companyId, extra = {}) => ({
  employeeId,
  role: 'employee',
  companyId,
  isPlatformAdmin: false,
  ...extra,
})

const comp1Assignee = actor('AM-0002', 'COMP-001')
const comp1Member = actor('AM-0003', 'COMP-001')
const comp1Manager = actor('AM-0004', 'COMP-001')
const projectManager = actor('AM-0005', 'COMP-001')
const comp1Admin = actor('AM-0001', 'COMP-001', { role: 'admin' })
const comp2Member = actor('BX-0001', 'COMP-002')
const comp2Admin = actor('BX-0002', 'COMP-002', { role: 'admin' })
const platformAdmin = actor('PA-0001', 'COMP-002', { role: 'admin', isPlatformAdmin: true })

/** A COMP-001 task on PRJ-1, assigned to AM-0002 by the company admin. */
const comp1Task = {
  projectId: 'PRJ-1',
  assignedTo: ['AM-0002'],
  assignedBy: 'AM-0001',
  companyId: 'COMP-001',
}

describe('canModifyTask — the four kinds of caller', () => {
  const cases = [
    ['a COMP-001 member assigned to the task', comp1Assignee, true],
    ['a COMP-001 member with no tie to the task', comp1Member, false],
    ['a COMP-002 member', comp2Member, false],
    ['the COMP-001 company admin', comp1Admin, true],
    ['the COMP-002 company admin', comp2Admin, false],
    ['a platform admin acting from COMP-002', platformAdmin, true],
  ]
  for (const [who, caller, expected] of cases) {
    test(`${who}: ${expected ? 'allowed' : 'refused'}`, async () => {
      assert.equal(await canModifyTask(caller, comp1Task, makeDeps()), expected)
    })
  }
})

describe('canModifyTask', () => {
  test('judges the first assignee as owner, with the task project and company', async () => {
    const deps = makeDeps()
    assert.equal(await canModifyTask(comp1Assignee, comp1Task, deps), true)
    assert.deepEqual(deps.calls, [{ projectId: 'PRJ-1', ownerEmployeeId: 'AM-0002', companyId: 'COMP-001' }])
  })

  test('any assignee of a multi-assignee task may modify it', async () => {
    const task = { ...comp1Task, assignedTo: ['AM-0003', 'AM-0002'] }
    assert.equal(await canModifyTask(comp1Assignee, task, makeDeps()), true)
  })

  test('so may the manager of any assignee, not only of the first', async () => {
    const task = { ...comp1Task, projectId: null, assignedTo: ['AM-0003', 'AM-0002'] }
    const deps = makeDeps()
    assert.equal(await canModifyTask(comp1Manager, task, deps), true)
    assert.deepEqual(
      deps.calls.map((item) => item.ownerEmployeeId),
      ['AM-0003', 'AM-0003', 'AM-0002']
    )
  })

  test('a project manager may modify a task on their project', async () => {
    assert.equal(await canModifyTask(projectManager, comp1Task, makeDeps()), true)
  })

  test('the assigner of an assigned task is not its owner', async () => {
    const task = { ...comp1Task, projectId: null, assignedBy: 'AM-0003' }
    const deps = makeDeps()
    assert.equal(await canModifyTask(comp1Member, task, deps), false)
    assert.equal(deps.calls[0].ownerEmployeeId, 'AM-0002')
  })

  test('a legacy single-assignee string is the owner', async () => {
    const task = { ...comp1Task, assignedTo: 'AM-0003' }
    assert.equal(await canModifyTask(comp1Member, task, makeDeps()), true)
  })

  test('the assigner stands in only when there is no assignee value at all', async () => {
    for (const assignedTo of [null, undefined, '']) {
      const task = { ...comp1Task, assignedTo, assignedBy: 'AM-0003' }
      assert.equal(await canModifyTask(comp1Member, task, makeDeps()), true, `assignedTo: ${assignedTo}`)
    }
    const emptyList = { ...comp1Task, assignedTo: [], assignedBy: 'AM-0003' }
    assert.equal(await canModifyTask(comp1Member, emptyList, makeDeps()), false)
  })

  test('absent project and company reach canEditWorkItem as null', async () => {
    const deps = makeDeps()
    await canModifyTask(comp1Member, { assignedTo: ['AM-0003'] }, deps)
    assert.deepEqual(deps.calls[0], { projectId: null, ownerEmployeeId: 'AM-0003', companyId: null })
  })

  test('the tenant boundary refuses a legacy single assignee from another company', async () => {
    const task = { ...comp1Task, assignedTo: 'BX-0001' }
    assert.equal(await canModifyTask(comp2Member, task, makeDeps()), false)
  })

  // Inherited from PUT/DELETE /api/tasks/[taskId] as-is: the multi-assignee loop
  // accepts any listed assignee without canEditWorkItem's tenant boundary. Kept
  // so both paths behave the same; see the PR for the follow-up.
  test('an assignee from another company passes the multi-assignee loop', async () => {
    for (const assignedTo of [['BX-0001'], ['AM-0002', 'BX-0001']]) {
      const task = { ...comp1Task, assignedTo }
      assert.equal(await canModifyTask(comp2Member, task, makeDeps()), true, `assignedTo: ${assignedTo}`)
    }
  })
})

describe('taskOwnershipFromRow', () => {
  const row = (assigned_to, extra = {}) => ({
    project_id: 'PRJ-1',
    assigned_to,
    assigned_by: 'AM-0001',
    company_id: 'COMP-001',
    ...extra,
  })

  test('maps the columns the rule reads', () => {
    assert.deepEqual(taskOwnershipFromRow(row(['AM-0002', 'AM-0003'])), {
      projectId: 'PRJ-1',
      assignedTo: ['AM-0002', 'AM-0003'],
      assignedBy: 'AM-0001',
      companyId: 'COMP-001',
    })
  })

  test('missing project, company and assigner become null', () => {
    const mapped = taskOwnershipFromRow({ assigned_to: [], project_id: '', company_id: null })
    assert.deepEqual(mapped, { projectId: null, assignedTo: [], assignedBy: null, companyId: null })
  })

  // Same normalisation as lib/db/tasks rowToTask, which the REST route reads through.
  test('parses assigned_to the way rowToTask does', () => {
    const cases = [
      [null, []],
      [undefined, []],
      ['', []],
      ['   ', []],
      ['null', []],
      ['["AM-0002","AM-0003"]', ['AM-0002', 'AM-0003']],
      ['"AM-0002"', 'AM-0002'],
      ['AM-0002', []],
      [42, []],
    ]
    for (const [stored, expected] of cases) {
      assert.deepEqual(taskOwnershipFromRow(row(stored)).assignedTo, expected, `assigned_to: ${stored}`)
    }
  })
})

describe('assertCanModifyTask', () => {
  const taskRow = {
    project_id: 'PRJ-1',
    assigned_to: ['AM-0002'],
    assigned_by: 'AM-0001',
    company_id: 'COMP-001',
  }

  test('reads the row the mutations write, by a bound task_id', async () => {
    const deps = makeDeps({ rows: [taskRow] })
    const hostileId = "TSK-1' OR '1'='1"
    await assert.rejects(assertCanModifyTask(comp2Member, hostileId, deps))
    assert.deepEqual(deps.queries, [{ text: TASK_OWNERSHIP_SQL, values: [hostileId] }])
    assert.match(TASK_OWNERSHIP_SQL, /^SELECT [a-z_, ]+ FROM tasks WHERE task_id = \$1$/)
  })

  test('an unknown task is NOT_FOUND, without an authorization lookup', async () => {
    const deps = makeDeps({ rows: [] })
    await assert.rejects(assertCanModifyTask(comp1Admin, 'TSK-404', deps), { message: TASK_NOT_FOUND_MESSAGE })
    assert.deepEqual(deps.calls, [])
  })

  test('refuses with FORBIDDEN', async () => {
    for (const caller of [comp1Member, comp2Member, comp2Admin]) {
      await assert.rejects(assertCanModifyTask(caller, 'TSK-1', makeDeps({ rows: [taskRow] })), {
        message: TASK_FORBIDDEN_MESSAGE,
      })
    }
  })

  test('resolves for a caller the rule allows', async () => {
    for (const caller of [comp1Assignee, comp1Admin, projectManager, platformAdmin]) {
      await assertCanModifyTask(caller, 'TSK-1', makeDeps({ rows: [taskRow] }))
    }
  })

  test('judges the stored row, normalised', async () => {
    const deps = makeDeps({ rows: [{ ...taskRow, assigned_to: '["AM-0003"]', project_id: null }] })
    await assertCanModifyTask(comp1Member, 'TSK-1', deps)
    assert.deepEqual(deps.calls, [{ projectId: null, ownerEmployeeId: 'AM-0003', companyId: 'COMP-001' }])
  })
})
