// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  canCreateDevItem,
  canDeleteRequirement,
  canReviewRequirement,
  canSubmitForReview,
  isPrivilegedRole,
  lifecycleStatusOptions,
} from '../requirementPermissions.ts'

const author = { employeeId: 'AM-0010', role: 'employee' }
const reviewer = { employeeId: 'AM-0011', role: 'employee' }
const bystander = { employeeId: 'AM-0012', role: 'employee' }
const manager = { employeeId: 'AM-0013', role: 'management' }

const req = (overrides = {}) => ({
  status: 'In Review',
  createdBy: 'AM-0010',
  reviewerId: 'AM-0011',
  ...overrides,
})

describe('canSubmitForReview', () => {
  test('only from Draft or Rejected', () => {
    assert.equal(canSubmitForReview('Draft'), true)
    assert.equal(canSubmitForReview('Rejected'), true)
    assert.equal(canSubmitForReview('In Review'), false)
    assert.equal(canSubmitForReview('Approved'), false)
  })
})

describe('canReviewRequirement', () => {
  test('the designated reviewer may review', () => {
    assert.equal(canReviewRequirement(req(), reviewer), true)
  })

  // The screen showed Approve/Reject to every project member.
  test('a bystander may not', () => {
    assert.equal(canReviewRequirement(req(), bystander), false)
  })

  test('the author may not approve their own, even as the named reviewer', () => {
    assert.equal(canReviewRequirement(req({ reviewerId: 'AM-0010' }), author), false)
  })

  test('a privileged role may review anything, including their own', () => {
    assert.equal(canReviewRequirement(req(), manager), true)
    assert.equal(canReviewRequirement(req({ createdBy: 'AM-0013' }), manager), true)
  })

  test('nothing is reviewable unless it is In Review', () => {
    for (const status of ['Draft', 'Approved', 'Rejected', 'Implemented', 'Verified']) {
      assert.equal(canReviewRequirement(req({ status }), manager), false, status)
    }
  })
})

describe('lifecycleStatusOptions', () => {
  // The picker offered Implemented, which updateRequirementStatus rejects
  // outright, so choosing it always failed.
  test('never offers Implemented', () => {
    for (const status of ['Draft', 'In Review', 'Approved', 'Implemented', 'Verified']) {
      assert.equal(
        lifecycleStatusOptions(req({ status }), manager).includes('Implemented'),
        false,
        status
      )
    }
  })

  test('Verified only from Implemented, and only for the reviewer or a privileged role', () => {
    assert.deepEqual(lifecycleStatusOptions(req({ status: 'Implemented' }), reviewer), ['Verified'])
    assert.equal(
      lifecycleStatusOptions(req({ status: 'Implemented' }), bystander).includes('Verified'),
      false
    )
    assert.equal(
      lifecycleStatusOptions(req({ status: 'Approved' }), reviewer).includes('Verified'),
      false
    )
  })

  test('Deprecated for a privileged role at any status', () => {
    assert.ok(lifecycleStatusOptions(req({ status: 'Approved' }), manager).includes('Deprecated'))
  })

  test('Deprecated for the author only while it is a Draft', () => {
    assert.deepEqual(lifecycleStatusOptions(req({ status: 'Draft' }), author), ['Deprecated'])
    assert.deepEqual(lifecycleStatusOptions(req({ status: 'Approved' }), author), [])
  })

  test('never offers the status it already has', () => {
    assert.equal(
      lifecycleStatusOptions(req({ status: 'Deprecated' }), manager).includes('Deprecated'),
      false
    )
  })

  test('a bystander gets nothing', () => {
    assert.deepEqual(lifecycleStatusOptions(req({ status: 'Implemented' }), bystander), [])
  })
})

describe('canCreateDevItem', () => {
  // The button appeared for Approved, Implemented and Verified; the server takes
  // Approved only.
  test('Approved only', () => {
    assert.equal(canCreateDevItem('Approved'), true)
    assert.equal(canCreateDevItem('Implemented'), false)
    assert.equal(canCreateDevItem('Verified'), false)
    assert.equal(canCreateDevItem('Draft'), false)
  })
})

describe('canDeleteRequirement', () => {
  test('the author may', () => {
    assert.equal(canDeleteRequirement(req(), author), true)
  })
  test('a bystander may not', () => {
    assert.equal(canDeleteRequirement(req(), bystander), false)
  })
  test('a privileged role may', () => {
    assert.equal(canDeleteRequirement(req(), manager), true)
  })
})

describe('isPrivilegedRole', () => {
  test('matches the server list and nothing else', () => {
    assert.equal(isPrivilegedRole('admin'), true)
    assert.equal(isPrivilegedRole('top_management'), true)
    assert.equal(isPrivilegedRole('management'), true)
    assert.equal(isPrivilegedRole('employee'), false)
    assert.equal(isPrivilegedRole(undefined), false)
  })
})
