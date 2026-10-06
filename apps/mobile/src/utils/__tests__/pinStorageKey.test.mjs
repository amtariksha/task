// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { SECURE_STORE_KEY_PATTERN, pinStorageKey } from '../pinStorageKey.ts'

describe('the PIN key SecureStore will accept', () => {
  // The old `userPin:AM-0001` failed here on a real phone, so no PIN could be saved.
  test('the old colon form is exactly what SecureStore rejects', () => {
    assert.equal(SECURE_STORE_KEY_PATTERN.test('userPin:AM-0001'), false)
  })

  test('real employee IDs give a valid key', () => {
    for (const id of ['AM-0001', 'SW-0003', 'TS-0120', 'am_0001']) {
      assert.match(pinStorageKey(id), SECURE_STORE_KEY_PATTERN)
    }
  })

  test('characters SecureStore forbids are replaced, never passed through', () => {
    for (const id of ['AM:0001', 'AM 0001', 'AM/0001', 'AM@01', 'ÄM-0001']) {
      assert.match(pinStorageKey(id), SECURE_STORE_KEY_PATTERN)
    }
  })

  test('each person gets their own key', () => {
    assert.notEqual(pinStorageKey('AM-0001'), pinStorageKey('AM-0002'))
  })

  // discardLegacyDevicePin deletes the old device-wide `userPin`; it must never hit a per-user key.
  test('a per-user key is never the legacy device-wide key', () => {
    assert.notEqual(pinStorageKey(''), 'userPin')
    assert.notEqual(pinStorageKey('AM-0001'), 'userPin')
  })
})
