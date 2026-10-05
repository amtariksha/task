// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  buildExpoPushHeaders,
  isPermanentTokenError,
  maskPushToken,
  redactPushTokens,
} from '../expo-push.ts'

const scriptsMask = createRequire(import.meta.url)('../../../../../scripts/lib/push-token-mask.js')

const TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]'
const DEVICE_NOT_REGISTERED = `"${TOKEN}" is not a registered push notification recipient`

const implementations = [
  ['apps/web', { maskPushToken, redactPushTokens }],
  ['scripts', scriptsMask],
]

for (const [name, mask] of implementations) {
  describe(`push token masking (${name})`, () => {
    test('keeps the Expo wrapper and the first 6 characters of the id', () => {
      assert.equal(mask.maskPushToken(TOKEN), 'ExponentPushToken[AbCdEf…]')
      assert.equal(mask.maskPushToken('ExpoPushToken[AbCdEfGhIjKl]'), 'ExpoPushToken[AbCdEf…]')
    })

    test('masks raw device tokens and never reveals more than half of a short value', () => {
      assert.equal(mask.maskPushToken('fcm-device-token-1234567890'), 'fcm-de…')
      assert.equal(mask.maskPushToken('abcd'), 'ab…')
      assert.equal(mask.maskPushToken('ExponentPushToken[abc]'), 'ExponentPushToken[a…]')
    })

    test('handles missing tokens', () => {
      assert.equal(mask.maskPushToken(''), '<none>')
      assert.equal(mask.maskPushToken(null), '<none>')
      assert.equal(mask.maskPushToken(undefined), '<none>')
    })

    test('redacts every token inside free text', () => {
      assert.equal(
        mask.redactPushTokens(DEVICE_NOT_REGISTERED),
        '"ExponentPushToken[AbCdEf…]" is not a registered push notification recipient'
      )
      const json = JSON.stringify({ details: { a: [TOKEN, 'ExpoPushToken[ZyXwVuTsRqPo]'] } })
      const redacted = mask.redactPushTokens(json)
      assert.ok(!redacted.includes('GhIjKl'))
      assert.ok(!redacted.includes('TsRqPo'))
      assert.ok(redacted.includes('ExpoPushToken[ZyXwVu…]'))
    })

    test('leaves text without tokens unchanged', () => {
      const message = "Unable to retrieve the FCM server key for the recipient's app."
      assert.equal(mask.redactPushTokens(message), message)
    })
  })
}

describe('Expo push request headers', () => {
  test('omits Authorization when no access token is configured', () => {
    for (const token of [undefined, '', '   ']) {
      const headers = buildExpoPushHeaders(token)
      assert.equal(headers.Authorization, undefined)
      assert.equal(headers['Content-Type'], 'application/json')
      assert.equal(headers.Accept, 'application/json')
    }
  })

  test('sends the trimmed access token as a bearer header', () => {
    assert.equal(buildExpoPushHeaders('  expo-token-123\n').Authorization, 'Bearer expo-token-123')
  })

  test('reads EXPO_ACCESS_TOKEN by default', () => {
    const previous = process.env.EXPO_ACCESS_TOKEN
    try {
      process.env.EXPO_ACCESS_TOKEN = 'from-env'
      assert.equal(buildExpoPushHeaders().Authorization, 'Bearer from-env')
      delete process.env.EXPO_ACCESS_TOKEN
      assert.equal(buildExpoPushHeaders().Authorization, undefined)
    } finally {
      if (previous === undefined) delete process.env.EXPO_ACCESS_TOKEN
      else process.env.EXPO_ACCESS_TOKEN = previous
    }
  })
})

describe('token deactivation', () => {
  test('only DeviceNotRegistered is permanent', () => {
    assert.equal(isPermanentTokenError('DeviceNotRegistered'), true)
    for (const code of ['InvalidCredentials', 'MismatchSenderId', 'MessageTooBig', 'MessageRateExceeded', undefined]) {
      assert.equal(isPermanentTokenError(code), false, String(code))
    }
  })
})
