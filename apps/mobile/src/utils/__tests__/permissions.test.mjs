// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPROVER_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  canLeadThisProject,
  canManageThisProject,
  hasTabAccess,
} from '../permissions.ts'

const user = (role) => ({ employeeId: 'AM-0010', role, tabPermissions: undefined })

describe('canManageThisProject', () => {
  // The defect: the screens gated on the global role, so a 'management' user saw
  // edit controls on every project and got a 403, while a project manager without
  // a privileged global role saw none.
  test('a project manager may manage their own project whatever their global role', () => {
    assert.equal(canManageThisProject(user('employee'), 'manager', false), true)
  })

  test('a plain member may not, however senior their global role sounds', () => {
    assert.equal(canManageThisProject(user('management'), 'member', false), false)
  })

  test('someone not on the project may not', () => {
    assert.equal(canManageThisProject(user('management'), null, false), false)
  })

  test('a company admin may, without being on the project', () => {
    assert.equal(canManageThisProject(user('employee'), null, true), true)
  })

  // Retained until every deployment has migrated off the global roles.
  test('the legacy global admins still pass', () => {
    assert.equal(canManageThisProject(user('admin'), null, false), true)
    assert.equal(canManageThisProject(user('top_management'), null, false), true)
  })

  test('no user means no', () => {
    assert.equal(canManageThisProject(null, 'manager', true), false)
  })
})

describe('canLeadThisProject', () => {
  test('a team leader may lead but not manage', () => {
    assert.equal(canLeadThisProject(user('employee'), 'team_leader', false), true)
    assert.equal(canManageThisProject(user('employee'), 'team_leader', false), false)
  })

  test('a plain member may do neither', () => {
    assert.equal(canLeadThisProject(user('employee'), 'member', false), false)
  })
})

describe('APPROVER_ROLES', () => {
  // 'amtarikshian' is the plain employee role: it used to be on the approver list
  // on the leave and WFH screens, and 'admin' was missing.
  test('includes admin and excludes the plain employee roles', () => {
    assert.ok(APPROVER_ROLES.includes('admin'))
    assert.ok(APPROVER_ROLES.includes('top_management'))
    assert.ok(APPROVER_ROLES.includes('management'))
    assert.equal(APPROVER_ROLES.includes('amtarikshian'), false)
    assert.equal(APPROVER_ROLES.includes('employee'), false)
  })
})

describe('hasTabAccess', () => {
  // The database CHECK constraint names this role 'employee'; the key was missing,
  // so such a user saw no tabs at all.
  test('the employee role has defaults, not an empty tab list', () => {
    assert.ok(DEFAULT_ROLE_PERMISSIONS.employee.length > 0)
    assert.equal(hasTabAccess(user('employee'), 'home'), true)
    assert.equal(hasTabAccess(user('employee'), 'tasks'), true)
  })

  test('both spellings of the employee role behave the same', () => {
    assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.employee, DEFAULT_ROLE_PERMISSIONS.amtarikshian)
  })

  test('an employee has no admin-only tab', () => {
    assert.equal(hasTabAccess(user('employee'), 'user_management'), false)
    assert.equal(hasTabAccess(user('employee'), 'deleted_items'), false)
  })

  test('explicit tabPermissions override the role defaults', () => {
    const restricted = { employeeId: 'AM-0011', role: 'admin', tabPermissions: ['home'] }
    assert.equal(hasTabAccess(restricted, 'home'), true)
    assert.equal(hasTabAccess(restricted, 'settings'), false)
  })

  test('no user means no access', () => {
    assert.equal(hasTabAccess(null, 'home'), false)
  })
})
