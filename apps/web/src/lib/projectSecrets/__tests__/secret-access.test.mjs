// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_PROJECT_ACCESS_MESSAGE,
  NO_WRITE_ACCESS_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  decideProjectSecretAccess,
} from '../secret-access.ts'

// COMP-A owns PRJ-A (members below). COMP-B owns PRJ-B. PRJ-LEGACY has no company.
const PROJECT_COMPANY = {
  'PRJ-A': 'COMP-A',
  'PRJ-B': 'COMP-B',
  'PRJ-LEGACY': null,
}

const PROJECT_ROLES = {
  'PRJ-A': {
    'AM-0010': 'manager',
    'AM-0011': 'team_leader',
    'AM-0012': 'member',
  },
  'PRJ-B': {
    'BX-0010': 'manager',
  },
}

const COMPANY_ADMINS = {
  'COMP-A': ['AM-0001'],
  'COMP-B': ['BX-0001'],
}

const DEFAULT_COMPANY = {
  'AM-0001': 'COMP-A',
  'AM-0010': 'COMP-A',
  'AM-0012': 'COMP-A',
  'BX-0001': 'COMP-B',
}

function makeDeps() {
  return {
    getProjectCompanyId: async (projectId) =>
      projectId in PROJECT_COMPANY ? PROJECT_COMPANY[projectId] : undefined,
    getProjectRole: async (projectId, employeeId) =>
      PROJECT_ROLES[projectId]?.[employeeId] ?? null,
    isPlatformAdmin: async (actor) => Boolean(actor.isPlatformAdmin),
    canAdminCompany: async (actor, companyId) =>
      (COMPANY_ADMINS[companyId] ?? []).includes(actor.employeeId),
    getDefaultCompanyId: async (employeeId) => DEFAULT_COMPANY[employeeId] ?? null,
  }
}

const decide = (actor, projectId, action) =>
  decideProjectSecretAccess(actor, projectId, action, makeDeps())

const actorIn = (employeeId, companyId, extra = {}) => ({
  employeeId,
  role: 'employee',
  companyId,
  isPlatformAdmin: false,
  ...extra,
})

const projectManager = actorIn('AM-0010', 'COMP-A')
const teamLeader = actorIn('AM-0011', 'COMP-A')
const projectMember = actorIn('AM-0012', 'COMP-A')
const companyAdminA = actorIn('AM-0001', 'COMP-A', { role: 'admin' })
const companyAdminB = actorIn('BX-0001', 'COMP-B', { role: 'admin' })
const platformAdmin = actorIn('BX-0001', 'COMP-B', { role: 'admin', isPlatformAdmin: true })
const outsider = actorIn('AM-0099', 'COMP-A')

describe('tenant boundary', () => {
  // The defect this module exists for: a global admin of one company could read
  // every other company's database passwords and API keys.
  test('a company admin cannot touch another company’s project', async () => {
    for (const action of ['view', 'reveal', 'write', 'export']) {
      const decision = await decide(companyAdminB, 'PRJ-A', action)
      assert.deepEqual(decision, {
        allowed: false,
        status: 403,
        message: NO_PROJECT_ACCESS_MESSAGE,
      }, `expected ${action} to be denied`)
    }
  })

  test('a project member of another company is denied', async () => {
    const decision = await decide(actorIn('BX-0010', 'COMP-B'), 'PRJ-A', 'view')
    assert.equal(decision.allowed, false)
  })

  test('a platform admin crosses companies by design', async () => {
    assert.deepEqual(await decide(platformAdmin, 'PRJ-A', 'write'), { allowed: true })
  })

  // A pre-062 token carries no companyId. authz.isSameCompany fails open there;
  // secrets must not, so the actor's default company is resolved instead.
  test('a session with no company claim resolves its default company', async () => {
    const unscopedAdminA = { employeeId: 'AM-0001', role: 'admin' }
    assert.deepEqual(await decide(unscopedAdminA, 'PRJ-A', 'reveal'), { allowed: true })

    const unscopedAdminB = { employeeId: 'BX-0001', role: 'admin' }
    const decision = await decide(unscopedAdminB, 'PRJ-A', 'reveal')
    assert.equal(decision.allowed, false)
  })

  test('a session with no company and no default is denied, not allowed', async () => {
    const decision = await decide({ employeeId: 'ZZ-0001', role: 'admin' }, 'PRJ-A', 'view')
    assert.deepEqual(decision, {
      allowed: false,
      status: 403,
      message: NO_PROJECT_ACCESS_MESSAGE,
    })
  })
})

describe('read access', () => {
  test('any project member may view and reveal', async () => {
    assert.deepEqual(await decide(projectMember, 'PRJ-A', 'view'), { allowed: true })
    assert.deepEqual(await decide(projectMember, 'PRJ-A', 'reveal'), { allowed: true })
  })

  test('a company admin who is not on the project may still read it', async () => {
    assert.deepEqual(await decide(companyAdminA, 'PRJ-A', 'reveal'), { allowed: true })
  })

  test('someone in the company but not on the project is denied', async () => {
    assert.deepEqual(await decide(outsider, 'PRJ-A', 'view'), {
      allowed: false,
      status: 403,
      message: NO_PROJECT_ACCESS_MESSAGE,
    })
  })
})

describe('write access', () => {
  test('a plain project member may read but not write', async () => {
    assert.deepEqual(await decide(projectMember, 'PRJ-A', 'reveal'), { allowed: true })
    assert.deepEqual(await decide(projectMember, 'PRJ-A', 'write'), {
      allowed: false,
      status: 403,
      message: NO_WRITE_ACCESS_MESSAGE,
    })
  })

  test('managers and team leaders may write', async () => {
    assert.deepEqual(await decide(projectManager, 'PRJ-A', 'write'), { allowed: true })
    assert.deepEqual(await decide(teamLeader, 'PRJ-A', 'write'), { allowed: true })
  })

  test('a company admin may write', async () => {
    assert.deepEqual(await decide(companyAdminA, 'PRJ-A', 'write'), { allowed: true })
  })

  // Exporting a whole environment is the most damaging read, so it needs write
  // authority rather than mere membership.
  test('export takes write authority, not read authority', async () => {
    assert.deepEqual(await decide(projectMember, 'PRJ-A', 'export'), {
      allowed: false,
      status: 403,
      message: NO_WRITE_ACCESS_MESSAGE,
    })
    assert.deepEqual(await decide(projectManager, 'PRJ-A', 'export'), { allowed: true })
  })
})

describe('edge cases', () => {
  test('an unknown project is a 404, not a 403', async () => {
    assert.deepEqual(await decide(platformAdmin, 'PRJ-NOPE', 'view'), {
      allowed: false,
      status: 404,
      message: PROJECT_NOT_FOUND_MESSAGE,
    })
  })

  // A project migration 062 could not stamp with a company has NO global-role
  // shortcut: users.role is the old deployment-wide column, so honouring it would
  // let an admin of any company read and rewrite such a project's credentials.
  test('a project with no company grants nothing on a global role alone', async () => {
    for (const actor of [companyAdminA, companyAdminB]) {
      assert.deepEqual(await decide(actor, 'PRJ-LEGACY', 'write'), {
        allowed: false,
        status: 403,
        message: NO_PROJECT_ACCESS_MESSAGE,
      })
      assert.equal((await decide(actor, 'PRJ-LEGACY', 'view')).allowed, false)
    }
  })

  test('a project with no company still answers to its project roles', async () => {
    // PRJ-LEGACY has no members in the fixture, so nobody but a platform admin
    // reaches it — which is the point: it is not looser than the project itself.
    assert.equal((await decide(projectMember, 'PRJ-LEGACY', 'view')).allowed, false)
    assert.deepEqual(await decide(platformAdmin, 'PRJ-LEGACY', 'write'), { allowed: true })
  })
})
