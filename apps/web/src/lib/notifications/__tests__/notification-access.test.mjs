// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
  assertCanAccessNotificationsOf,
  canAccessNotificationsOf,
  requireNotificationActor,
  resolveNotificationRecipient,
} from '../notification-access.ts'

// COMP-A: AM-0001 (admin), AM-0002, AM-0003   COMP-B: BX-0001 (admin), BX-0002
const MEMBERSHIPS = {
  'COMP-A': ['AM-0001', 'AM-0002', 'AM-0003'],
  'COMP-B': ['BX-0001', 'BX-0002'],
}

function makeDeps({ defaultCompanies = {} } = {}) {
  const lookups = []
  return {
    lookups,
    isPlatformAdmin: async (actor) => Boolean(actor.isPlatformAdmin),
    getDefaultCompanyId: async (employeeId) => {
      lookups.push(['getDefaultCompanyId', employeeId])
      return defaultCompanies[employeeId] ?? null
    },
    isMemberOfCompany: async (employeeId, companyId) => {
      lookups.push(['isMemberOfCompany', employeeId, companyId])
      return (MEMBERSHIPS[companyId] ?? []).includes(employeeId)
    },
  }
}

const member = { employeeId: 'AM-0002', role: 'employee', companyId: 'COMP-A', isPlatformAdmin: false }
const companyAdmin = { employeeId: 'AM-0001', role: 'admin', companyId: 'COMP-A', isPlatformAdmin: false }
const platformAdmin = { employeeId: 'BX-0001', role: 'admin', companyId: 'COMP-B', isPlatformAdmin: true }

describe('requireNotificationActor', () => {
  test('rejects a missing session', () => {
    for (const context of [undefined, null, {}, { user: null }, { user: { role: 'admin' } }]) {
      assert.throws(() => requireNotificationActor(context), { message: UNAUTHENTICATED_MESSAGE })
    }
  })

  test('returns the signed-in user', () => {
    assert.equal(requireNotificationActor({ user: member }), member)
  })
})

describe('canAccessNotificationsOf', () => {
  test('a user always reaches their own notifications without a lookup', async () => {
    const deps = makeDeps()
    assert.equal(await canAccessNotificationsOf(member, 'AM-0002', deps), true)
    assert.deepEqual(deps.lookups, [])
  })

  test('a non-admin cannot reach a colleague in the same company', async () => {
    assert.equal(await canAccessNotificationsOf(member, 'AM-0003', makeDeps()), false)
  })

  test('top_management is not a notification override role', async () => {
    const topManagement = { ...member, role: 'top_management' }
    assert.equal(await canAccessNotificationsOf(topManagement, 'AM-0003', makeDeps()), false)
  })

  test('an admin reaches users in their own company only', async () => {
    assert.equal(await canAccessNotificationsOf(companyAdmin, 'AM-0003', makeDeps()), true)
    assert.equal(await canAccessNotificationsOf(companyAdmin, 'BX-0002', makeDeps()), false)
  })

  test('an admin token without a company falls back to the default company', async () => {
    const legacyToken = { employeeId: 'AM-0001', role: 'admin' }
    const deps = makeDeps({ defaultCompanies: { 'AM-0001': 'COMP-A' } })
    assert.equal(await canAccessNotificationsOf(legacyToken, 'AM-0003', deps), true)
    assert.equal(await canAccessNotificationsOf(legacyToken, 'BX-0002', deps), false)
    assert.deepEqual(deps.lookups[0], ['getDefaultCompanyId', 'AM-0001'])
  })

  test('an admin with no company at all reaches nobody else', async () => {
    const orphanAdmin = { employeeId: 'ZZ-0001', role: 'admin', companyId: null }
    assert.equal(await canAccessNotificationsOf(orphanAdmin, 'AM-0003', makeDeps()), false)
  })

  test('a platform admin reaches users in any company', async () => {
    assert.equal(await canAccessNotificationsOf(platformAdmin, 'AM-0003', makeDeps()), true)
    assert.equal(await canAccessNotificationsOf(platformAdmin, 'BX-0002', makeDeps()), true)
  })
})

describe('assertCanAccessNotificationsOf', () => {
  test('throws the standard FORBIDDEN message', async () => {
    await assert.rejects(assertCanAccessNotificationsOf(member, 'AM-0003', makeDeps()), {
      message: FORBIDDEN_MESSAGE,
    })
    await assertCanAccessNotificationsOf(member, 'AM-0002', makeDeps())
  })
})

describe('resolveNotificationRecipient', () => {
  test('defaults to the signed-in user', async () => {
    assert.equal(await resolveNotificationRecipient(member, undefined, makeDeps()), 'AM-0002')
    assert.equal(await resolveNotificationRecipient(member, '', makeDeps()), 'AM-0002')
    assert.equal(await resolveNotificationRecipient(member, 'AM-0002', makeDeps()), 'AM-0002')
  })

  test('a non-admin asking for someone else is scoped to themselves', async () => {
    assert.equal(await resolveNotificationRecipient(member, 'AM-0003', makeDeps()), 'AM-0002')
    assert.equal(await resolveNotificationRecipient(member, 'BX-0002', makeDeps()), 'AM-0002')
  })

  test('an admin may target a user in their company', async () => {
    assert.equal(await resolveNotificationRecipient(companyAdmin, 'AM-0003', makeDeps()), 'AM-0003')
  })

  test('an admin targeting another company is refused', async () => {
    await assert.rejects(resolveNotificationRecipient(companyAdmin, 'BX-0002', makeDeps()), {
      message: FORBIDDEN_MESSAGE,
    })
  })

  test('a platform admin may target any user', async () => {
    assert.equal(await resolveNotificationRecipient(platformAdmin, 'AM-0003', makeDeps()), 'AM-0003')
  })
})
