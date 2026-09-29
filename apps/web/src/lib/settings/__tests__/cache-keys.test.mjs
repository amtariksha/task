// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  allSettingsKey,
  dropdownSettingsKey,
  groupedSettingsKey,
  settingsCacheKeysToInvalidate,
  settingsCacheScope,
} from '../cache-keys.ts'

describe('settingsCacheScope', () => {
  test('a company is its own namespace; no company is the platform', () => {
    assert.equal(settingsCacheScope('COMP-002'), 'COMP-002')
    assert.equal(settingsCacheScope(null), 'platform')
    assert.equal(settingsCacheScope(undefined), 'platform')
  })
})

describe('key builders', () => {
  // Two companies must never share a key: the first to warm the cache would
  // otherwise serve its departments and roles to the other.
  test('each company gets distinct keys', () => {
    assert.notEqual(groupedSettingsKey('COMP-001'), groupedSettingsKey('COMP-002'))
    assert.notEqual(dropdownSettingsKey('COMP-001'), dropdownSettingsKey('COMP-002'))
    assert.notEqual(allSettingsKey('COMP-001', true), allSettingsKey('COMP-002', true))
  })

  test('activeOnly is part of the key', () => {
    assert.notEqual(allSettingsKey('COMP-001', true), allSettingsKey('COMP-001', false))
  })

  test('the platform namespace is stable', () => {
    assert.equal(groupedSettingsKey(null), 'settings_grouped_platform')
    assert.equal(dropdownSettingsKey(null), 'settings_dropdowns_platform')
    assert.equal(allSettingsKey(null, true), 'settings_all_active_1_platform')
  })
})

describe('settingsCacheKeysToInvalidate', () => {
  test('a company write drops that company’s four keys', () => {
    const keys = settingsCacheKeysToInvalidate('COMP-002')
    assert.deepEqual(keys.sort(), [
      'settings_all_active_0_COMP-002',
      'settings_all_active_1_COMP-002',
      'settings_dropdowns_COMP-002',
      'settings_grouped_COMP-002',
    ])
  })

  test('a company write leaves other companies’ caches alone', () => {
    const keys = settingsCacheKeysToInvalidate('COMP-002')
    assert.equal(keys.some((k) => k.includes('COMP-001')), false)
    assert.equal(keys.some((k) => k.includes('platform')), false)
  })

  // A platform row is the fallback for every company without an override, so its
  // change has to invalidate their payloads as well.
  test('a platform write also drops the companies it falls through to', () => {
    const keys = settingsCacheKeysToInvalidate(null, ['COMP-001', 'COMP-002'])
    assert.ok(keys.includes('settings_dropdowns_platform'))
    assert.ok(keys.includes('settings_dropdowns_COMP-001'))
    assert.ok(keys.includes('settings_dropdowns_COMP-002'))
    assert.equal(keys.length, 12)
  })

  test('keys are deduplicated when a company is listed twice', () => {
    const keys = settingsCacheKeysToInvalidate('COMP-001', ['COMP-001'])
    assert.equal(keys.length, 4)
  })
})
