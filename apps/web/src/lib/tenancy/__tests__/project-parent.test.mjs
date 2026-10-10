// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { canManageProject, decideProjectRead } from '../item-access.ts'
import {
  CREATE_NOT_ALLOWED_MESSAGE,
  NO_ACTIVE_COMPANY_MESSAGE,
  PARENT_COMPANY_MISMATCH_MESSAGE,
  PARENT_NOT_FOUND_MESSAGE,
  PARENT_NOT_MANAGED_MESSAGE,
  PARENT_OTHER_COMPANY_MESSAGE,
  decideProjectCreate,
  decideProjectReparent,
  parentIdFromBody,
} from '../project-parent.ts'

// COMP-001 Amtariksha, COMP-002 Swarg Food. AM-0001 holds the legacy global admin role.
const alphaAdmin = { employeeId: 'AM-0001', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: false }
const alphaTopManagement = { employeeId: 'AM-0003', role: 'top_management', companyId: 'COMP-001', isPlatformAdmin: false }
const alphaManager = { employeeId: 'AM-0002', role: 'employee', companyId: 'COMP-001', isPlatformAdmin: false }
const betaAdmin = { employeeId: 'SF-0002', role: 'employee', companyId: 'COMP-002', isPlatformAdmin: false }
const adminOfBoth = { employeeId: 'AM-0010', role: 'employee', companyId: 'COMP-001', isPlatformAdmin: false }
const platformAdmin = { employeeId: 'AM-0009', role: 'admin', companyId: 'COMP-001', isPlatformAdmin: true }
// Tokens that carry no company: issued before migration 062, or for a user in no company.
const noCompanyEmployee = { employeeId: 'AM-0004', role: 'employee' }
const noCompanyManager = { employeeId: 'AM-0002', role: 'employee' }
const noCompanyAdmin = { employeeId: 'AM-0001', role: 'admin' }

const PROJECT_COMPANY = {
  'PRJ-001': 'COMP-001',
  'PRJ-002': 'COMP-001',
  'PRJ-037': 'COMP-002',
  'PRJ-040': 'COMP-002',
  'PRJ-LEGACY': null,
}

// AM-0002 still holds PRJ-037's manager row from before the project moved to COMP-002.
const PROJECT_ROLES = {
  'PRJ-001': { 'AM-0002': 'manager' },
  'PRJ-002': { 'AM-0002': 'manager' },
  'PRJ-037': { 'AM-0002': 'manager', 'SF-0001': 'manager' },
  'PRJ-LEGACY': { 'AM-0002': 'manager' },
}

const COMPANY_ROLES = {
  'AM-0001': { 'COMP-001': 'member' },
  'AM-0002': { 'COMP-001': 'member' },
  'AM-0003': { 'COMP-001': 'member' },
  'AM-0009': { 'COMP-001': 'member' },
  'AM-0010': { 'COMP-001': 'company_admin', 'COMP-002': 'company_admin' },
  'SF-0002': { 'COMP-002': 'company_admin' },
}

/**
 * The lookups lib/tenancy/project-guard wires in, with the database's answers.
 * `readAccess` and `canManageProject` are the real rules from item-access.
 */
function fakeDeps() {
  const calls = []
  const record = (name, ...args) => calls.push([name, ...args])
  const isPlatformAdmin = async (actor) => actor.isPlatformAdmin === true
  const getProjectCompanyId = async (projectId) =>
    projectId in PROJECT_COMPANY ? PROJECT_COMPANY[projectId] : undefined
  const canAdminCompany = async (actor, companyId) => {
    if (await isPlatformAdmin(actor)) return true
    const companyRole = COMPANY_ROLES[actor.employeeId]?.[companyId] ?? null
    if (companyRole === 'company_admin') return true
    return ['admin', 'top_management'].includes(actor.role) && companyRole !== null
  }
  const getProjectRole = async (projectId, employeeId) => PROJECT_ROLES[projectId]?.[employeeId] ?? null
  const lookups = { isPlatformAdmin, getProjectCompanyId, canAdminCompany, getProjectRole }
  return {
    calls,
    readAccess: async (actor, projectId) => {
      record('readAccess', projectId)
      return decideProjectRead(actor, projectId, lookups)
    },
    canManageProject: async (actor, projectId) => {
      record('canManageProject', projectId)
      return canManageProject(actor, projectId, lookups)
    },
    canAdminCompany: async (actor, companyId) => {
      record('canAdminCompany', companyId)
      return canAdminCompany(actor, companyId)
    },
    getProjectCompanyId: async (projectId) => {
      record('getProjectCompanyId', projectId)
      return getProjectCompanyId(projectId)
    },
  }
}

const allowed = { allowed: true }
const refused = (status, message) => ({ allowed: false, status, message })
const otherCompany = refused(403, PARENT_OTHER_COMPANY_MESSAGE)
const notManaged = refused(403, PARENT_NOT_MANAGED_MESSAGE)

describe('decideProjectCreate — POST /api/projects', () => {
  const create = (actor, parentProjectId, deps = fakeDeps()) => decideProjectCreate(actor, parentProjectId, deps)

  test('a top-level project needs an admin of the session company, and no parent lookup', async () => {
    const deps = fakeDeps()
    assert.deepEqual(await create(alphaAdmin, null, deps), allowed)
    assert.deepEqual(deps.calls, [['canAdminCompany', 'COMP-001']])
    assert.deepEqual(await create(betaAdmin, null), allowed)
    assert.deepEqual(await create(alphaManager, null), refused(403, CREATE_NOT_ALLOWED_MESSAGE))
  })

  test('a top-level project needs a session company to belong to', async () => {
    assert.deepEqual(await create(noCompanyAdmin, null), refused(400, NO_ACTIVE_COMPANY_MESSAGE))
  })

  test('a company admin creates a sub-project under their own company\'s project', async () => {
    assert.deepEqual(await create(alphaAdmin, 'PRJ-001'), allowed)
    assert.deepEqual(await create(alphaTopManagement, 'PRJ-001'), allowed)
    assert.deepEqual(await create(betaAdmin, 'PRJ-037'), allowed)
  })

  test('an admin of one company cannot create under another company\'s project', async () => {
    // Reproduced 2026-10-10: this created a COMP-002 row from a COMP-001 session.
    assert.deepEqual(await create(alphaAdmin, 'PRJ-037'), otherCompany)
    assert.deepEqual(await create(alphaTopManagement, 'PRJ-037'), otherCompany)
    assert.deepEqual(await create(betaAdmin, 'PRJ-001'), otherCompany)
  })

  test('an admin of both companies must be working in the parent\'s company', async () => {
    assert.deepEqual(await create(adminOfBoth, 'PRJ-037'), otherCompany)
    assert.deepEqual(await create({ ...adminOfBoth, companyId: 'COMP-002' }, 'PRJ-037'), allowed)
  })

  test('a platform admin creates under any company\'s project', async () => {
    assert.deepEqual(await create(platformAdmin, 'PRJ-001'), allowed)
    assert.deepEqual(await create(platformAdmin, 'PRJ-037'), allowed)
  })

  test('someone who cannot create projects learns nothing about the parent', async () => {
    const deps = fakeDeps()
    const refusal = refused(403, CREATE_NOT_ALLOWED_MESSAGE)
    assert.deepEqual(await create(alphaManager, 'PRJ-037', deps), refusal)
    assert.deepEqual(await create(alphaManager, 'PRJ-NOPE', deps), refusal)
    assert.deepEqual(await create(alphaManager, 'PRJ-001', deps), refusal)
    assert.ok(deps.calls.every(([name]) => name === 'canAdminCompany'))
  })

  test('the tenant boundary is checked before the manage role', async () => {
    const deps = fakeDeps()
    await create(alphaAdmin, 'PRJ-037', deps)
    assert.deepEqual(deps.calls, [['canAdminCompany', 'COMP-001'], ['readAccess', 'PRJ-037']])
  })

  test('an unknown parent is refused as before', async () => {
    assert.deepEqual(await create(alphaAdmin, 'PRJ-NOPE'), refused(400, PARENT_NOT_FOUND_MESSAGE))
  })

  test('a token with no company is judged by its authority over the parent', async () => {
    // Reproduced 2026-10-10: an employee with no company created a COMP-002 sub-project.
    assert.deepEqual(await create(noCompanyEmployee, 'PRJ-037'), notManaged)
    assert.deepEqual(await create(noCompanyEmployee, 'PRJ-001'), notManaged)
    // The legacy admin role counts only inside a company the user belongs to.
    assert.deepEqual(await create(noCompanyAdmin, 'PRJ-001'), allowed)
    assert.deepEqual(await create(noCompanyAdmin, 'PRJ-037'), notManaged)
    assert.deepEqual(await create({ employeeId: 'SF-0002', role: 'employee' }, 'PRJ-037'), allowed)
  })

  test('a token with no company still needs an admin of the company the project lands in', async () => {
    // A manager row is enough to manage the parent, not to create projects:
    // with a session company the same person is refused by the admin check.
    const deps = fakeDeps()
    assert.deepEqual(await create(noCompanyManager, 'PRJ-037', deps), refused(403, CREATE_NOT_ALLOWED_MESSAGE))
    assert.deepEqual(deps.calls.at(-1), ['canAdminCompany', 'COMP-002'])
    assert.deepEqual(await create(noCompanyManager, 'PRJ-001'), refused(403, CREATE_NOT_ALLOWED_MESSAGE))
    assert.deepEqual(await create(alphaManager, 'PRJ-001'), refused(403, CREATE_NOT_ALLOWED_MESSAGE))
  })

  test('a parent with no company passes the boundary and is left to its own manage rule', async () => {
    assert.deepEqual(await create(alphaAdmin, 'PRJ-LEGACY'), notManaged)
    assert.deepEqual(await create({ ...alphaManager, role: 'admin' }, 'PRJ-LEGACY'), allowed)
  })
})

describe('decideProjectReparent — PUT /api/projects/[projectId] with parentProjectId', () => {
  const project = (projectId, parentProjectId = null) => ({
    projectId,
    companyId: PROJECT_COMPANY[projectId] ?? null,
    parentProjectId,
  })
  const move = (actor, facts, newParentId, deps = fakeDeps()) => decideProjectReparent(actor, facts, newParentId, deps)
  const alphaSub = { projectId: 'PRJ-003', companyId: 'COMP-001', parentProjectId: 'PRJ-001' }

  test('a parent that is not changing is not checked: the web form resends it on every edit', async () => {
    const deps = fakeDeps()
    assert.deepEqual(await move(alphaManager, alphaSub, 'PRJ-001', deps), allowed)
    assert.deepEqual(await move(alphaManager, project('PRJ-002'), null, deps), allowed)
    assert.deepEqual(deps.calls, [])
  })

  test('moving a project to the top level needs nothing beyond managing it', async () => {
    const deps = fakeDeps()
    assert.deepEqual(await move(alphaManager, alphaSub, null, deps), allowed)
    assert.deepEqual(deps.calls, [])
  })

  test('a company admin moves a project under another project of the same company', async () => {
    assert.deepEqual(await move(alphaAdmin, alphaSub, 'PRJ-002'), allowed)
    assert.deepEqual(await move(alphaManager, project('PRJ-002'), 'PRJ-001'), allowed)
  })

  test('a project cannot be moved under another company\'s project', async () => {
    // Reproduced 2026-10-10: PRJ-040 could then no longer be deleted by its own company.
    assert.deepEqual(await move(alphaManager, project('PRJ-002'), 'PRJ-040'), otherCompany)
    assert.deepEqual(await move(alphaAdmin, project('PRJ-002'), 'PRJ-037'), otherCompany)
    assert.deepEqual(await move(adminOfBoth, project('PRJ-002'), 'PRJ-037'), otherCompany)
  })

  test('the tenant boundary is checked before anything else about the new parent', async () => {
    const deps = fakeDeps()
    await move(alphaManager, project('PRJ-002'), 'PRJ-040', deps)
    assert.deepEqual(deps.calls, [['readAccess', 'PRJ-040']])
  })

  test('moving under a project needs the right to manage that project', async () => {
    const leftoverFree = { ...alphaManager, employeeId: 'AM-0007' }
    assert.deepEqual(await move(leftoverFree, project('PRJ-002'), 'PRJ-001'), notManaged)
  })

  test('a sub-project stays in its parent\'s company, even for a platform admin', async () => {
    const mismatch = refused(400, PARENT_COMPANY_MISMATCH_MESSAGE)
    assert.deepEqual(await move(platformAdmin, alphaSub, 'PRJ-037'), mismatch)
    assert.deepEqual(await move(platformAdmin, project('PRJ-040'), 'PRJ-001'), mismatch)
    assert.deepEqual(await move(platformAdmin, alphaSub, 'PRJ-002'), allowed)
    assert.deepEqual(await move(platformAdmin, project('PRJ-040'), 'PRJ-037'), allowed)
  })

  test('a token with no company still cannot join two companies', async () => {
    // AM-0002 manages PRJ-002 and, by a leftover row, PRJ-037.
    assert.deepEqual(
      await move(noCompanyManager, project('PRJ-002'), 'PRJ-037'),
      refused(400, PARENT_COMPANY_MISMATCH_MESSAGE)
    )
    assert.deepEqual(await move(noCompanyManager, project('PRJ-002'), 'PRJ-001'), allowed)
    assert.deepEqual(await move(noCompanyEmployee, project('PRJ-002'), 'PRJ-001'), notManaged)
  })

  test('a project or parent with no company fails open on the same-company rule', async () => {
    assert.deepEqual(await move({ ...alphaManager, role: 'admin' }, project('PRJ-LEGACY'), 'PRJ-001'), allowed)
    assert.deepEqual(await move(alphaManager, project('PRJ-002'), 'PRJ-LEGACY'), allowed)
  })

  test('an unknown parent is refused as before', async () => {
    assert.deepEqual(await move(alphaAdmin, alphaSub, 'PRJ-NOPE'), refused(400, PARENT_NOT_FOUND_MESSAGE))
  })

  test('a child already under another company\'s project can be edited and moved out', async () => {
    const stranded = { projectId: 'PRJ-002', companyId: 'COMP-001', parentProjectId: 'PRJ-040' }
    const deps = fakeDeps()
    assert.deepEqual(await move(alphaManager, stranded, 'PRJ-040', deps), allowed)
    assert.deepEqual(await move(alphaManager, stranded, null, deps), allowed)
    assert.deepEqual(deps.calls, [])
  })
})

describe('parentIdFromBody — the parent a request body names', () => {
  test('null, an empty string and an absent field all mean no parent', () => {
    for (const value of [null, '', undefined]) {
      assert.deepEqual(parentIdFromBody(value), { valid: true, parentId: null })
    }
  })

  test('a project id is taken as it is', () => {
    assert.deepEqual(parentIdFromBody('PRJ-037'), { valid: true, parentId: 'PRJ-037' })
  })

  test('anything that is not a string is rejected rather than read as no parent', () => {
    for (const value of [37, true, ['PRJ-037'], { projectId: 'PRJ-037' }]) {
      assert.deepEqual(parentIdFromBody(value), { valid: false })
    }
  })
})

describe('the refusals say why', () => {
  test('in words a user can act on', () => {
    assert.match(PARENT_OTHER_COMPANY_MESSAGE, /another company/)
    assert.match(PARENT_COMPANY_MISMATCH_MESSAGE, /same company/)
    assert.match(PARENT_NOT_MANAGED_MESSAGE, /permission/)
    // Unchanged text: the clients already show these two.
    assert.equal(PARENT_NOT_FOUND_MESSAGE, 'Parent project does not exist')
    assert.equal(CREATE_NOT_ALLOWED_MESSAGE, 'You do not have permission to create projects in this company.')
  })
})
