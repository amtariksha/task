// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isUnauthenticatedError,
  isForbiddenError,
  isUnauthenticatedGraphQLError,
  classifyAuthRejection,
  shouldEndSession,
  handleAuthRejectionWith,
} from '../authErrors.ts'

describe('isUnauthenticatedError', () => {
  test('matches every message the API uses for a missing or invalid session', () => {
    assert.equal(isUnauthenticatedError('UNAUTHENTICATED: You must be signed in.'), true)
    assert.equal(isUnauthenticatedError('Unauthorized'), true)
    assert.equal(isUnauthenticatedError('you must be signed in'), true)
  })

  test('does not match permission failures or attendance "signed in" messages', () => {
    assert.equal(isUnauthenticatedError('FORBIDDEN: You do not have permission to do that.'), false)
    assert.equal(isUnauthenticatedError('You are not authorized to edit this bug'), false)
    assert.equal(isUnauthenticatedError('You have not signed in today'), false)
    assert.equal(isUnauthenticatedError('You have already signed in today'), false)
  })
})

describe('isForbiddenError', () => {
  test('matches permission failures only', () => {
    assert.equal(isForbiddenError('FORBIDDEN: Founder only.'), true)
    assert.equal(isForbiddenError('You do not have permission to view this'), true)
    assert.equal(isForbiddenError('not authorized'), true)
    assert.equal(isForbiddenError('Unauthorized'), false)
  })
})

describe('isUnauthenticatedGraphQLError', () => {
  test('trusts an UNAUTHENTICATED extensions code', () => {
    assert.equal(isUnauthenticatedGraphQLError({ message: 'Session expired', extensions: { code: 'UNAUTHENTICATED' } }), true)
  })

  test('falls back to the message, because this API sets no code', () => {
    assert.equal(isUnauthenticatedGraphQLError({ message: 'UNAUTHENTICATED: You must be signed in.' }), true)
    assert.equal(isUnauthenticatedGraphQLError({ message: 'Unauthorized', extensions: {} }), true)
  })

  test('a FORBIDDEN code wins over a message that mentions auth', () => {
    assert.equal(isUnauthenticatedGraphQLError({ message: 'Unauthorized', extensions: { code: 'FORBIDDEN' } }), false)
  })

  test('ordinary errors and malformed entries are not auth failures', () => {
    assert.equal(isUnauthenticatedGraphQLError({ message: 'Task not found' }), false)
    assert.equal(isUnauthenticatedGraphQLError({ message: 'boom', extensions: { code: 'INTERNAL_SERVER_ERROR' } }), false)
    assert.equal(isUnauthenticatedGraphQLError({}), false)
    assert.equal(isUnauthenticatedGraphQLError({ extensions: null }), false)
  })
})

describe('classifyAuthRejection', () => {
  test('the token still in storage was refused: the session is over', () => {
    assert.equal(classifyAuthRejection('jwt-a', 'jwt-a'), 'expired')
  })

  test('the request carried a token that has since been replaced (company switch, new sign-in)', () => {
    assert.equal(classifyAuthRejection('jwt-old', 'jwt-new'), 'stale')
  })

  test('the request carried a token that has since been removed (sign-out under way)', () => {
    assert.equal(classifyAuthRejection('jwt-a', null), 'stale')
  })

  test('the request left without a token while one is stored (read before it was written)', () => {
    assert.equal(classifyAuthRejection(null, 'jwt-a'), 'unsent')
  })

  test('no token sent and none stored: there is no credential left', () => {
    assert.equal(classifyAuthRejection(null, null), 'missing')
  })

  test('an empty string counts as no token (authLink sends an empty header)', () => {
    assert.equal(classifyAuthRejection('', 'jwt-a'), 'unsent')
    assert.equal(classifyAuthRejection('', ''), 'missing')
    assert.equal(classifyAuthRejection('jwt-a', ''), 'stale')
  })
})

describe('shouldEndSession', () => {
  test('ends the session only when the current credential is refused or gone', () => {
    assert.equal(shouldEndSession('expired'), true)
    assert.equal(shouldEndSession('missing'), true)
    assert.equal(shouldEndSession('stale'), false)
    assert.equal(shouldEndSession('unsent'), false)
  })
})

describe('handleAuthRejectionWith', () => {
  /** Deps whose calls are recorded. `stored` is what storage holds; `readFails` makes the read throw. */
  function fakeDeps({ stored = null, readFails = false, clearFails = false } = {}) {
    const calls = { cleared: 0, ended: 0, logs: [] }
    const deps = {
      readStoredToken: async () => {
        if (readFails) throw new Error('KeyStore: could not decrypt')
        return stored
      },
      clearToken: async () => {
        calls.cleared += 1
        if (clearFails) throw new Error('KeyStore locked')
      },
      endSession: () => {
        calls.ended += 1
      },
      log: (level, message, data) => {
        calls.logs.push({ level, message, data })
      },
    }
    return { deps, calls }
  }

  test('the stored token was refused: clears it, then ends the session', async () => {
    const order = []
    const { deps, calls } = fakeDeps({ stored: 'jwt-a' })
    deps.clearToken = async () => order.push('clear')
    deps.endSession = () => order.push('end')
    assert.equal(await handleAuthRejectionWith('jwt-a', 'Feed', deps), 'expired')
    assert.deepEqual(order, ['clear', 'end'])
    assert.equal(calls.logs.length, 1)
  })

  test('no token sent and none stored: ends the session', async () => {
    const { deps, calls } = fakeDeps({ stored: null })
    assert.equal(await handleAuthRejectionWith(null, 'Feed', deps), 'missing')
    assert.equal(calls.ended, 1)
  })

  test('a refusal of a replaced token keeps the session (company switch)', async () => {
    const { deps, calls } = fakeDeps({ stored: 'jwt-new' })
    assert.equal(await handleAuthRejectionWith('jwt-old', 'Feed', deps), 'stale')
    assert.equal(calls.cleared, 0)
    assert.equal(calls.ended, 0)
    assert.equal(calls.logs[0].level, 'warn')
  })

  test('a request sent before the token was readable keeps the session', async () => {
    const { deps, calls } = fakeDeps({ stored: 'jwt-a' })
    assert.equal(await handleAuthRejectionWith(null, 'MeIsFounder', deps), 'unsent')
    assert.equal(calls.cleared, 0)
    assert.equal(calls.ended, 0)
  })

  test('an unreadable keystore keeps the session instead of passing for "no token"', async () => {
    const { deps, calls } = fakeDeps({ readFails: true })
    assert.equal(await handleAuthRejectionWith(null, 'Feed', deps), 'unreadable')
    assert.equal(calls.cleared, 0)
    assert.equal(calls.ended, 0)
    assert.equal(calls.logs[0].level, 'warn')
  })

  test('still ends the session when clearing the token fails', async () => {
    const { deps, calls } = fakeDeps({ stored: 'jwt-a', clearFails: true })
    assert.equal(await handleAuthRejectionWith('jwt-a', 'Feed', deps), 'expired')
    assert.equal(calls.ended, 1)
    assert.ok(calls.logs.some((entry) => entry.level === 'error'))
  })

  test('never logs the token', async () => {
    const { deps, calls } = fakeDeps({ stored: 'jwt-secret-value' })
    await handleAuthRejectionWith('jwt-secret-value', 'Feed', deps)
    await handleAuthRejectionWith('jwt-other-value', 'Feed', deps)
    assert.ok(!JSON.stringify(calls.logs).includes('jwt-'))
  })
})
