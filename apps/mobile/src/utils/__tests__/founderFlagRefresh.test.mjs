// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { refreshFounderFlagWith } from '../founderFlagRefresh.ts'

/** Deps whose calls are recorded. Override any of them per test. */
function fakeDeps(overrides = {}) {
  const calls = { saved: [], logs: [], cacheReads: 0 }
  const deps = {
    query: async () => ({ data: { me: { employeeId: 'E1', isFounder: true } } }),
    saveAnswer: async (answer) => {
      calls.saved.push(answer)
    },
    cachedFlag: async () => {
      calls.cacheReads += 1
      return false
    },
    log: (level, message, data) => {
      calls.logs.push({ level, message, data })
    },
    ...overrides,
  }
  return { deps, calls }
}

describe('refreshFounderFlagWith', () => {
  test('returns and caches the server answer', async () => {
    const { deps, calls } = fakeDeps()
    assert.equal(await refreshFounderFlagWith(deps), true)
    assert.deepEqual(calls.saved, [{ employeeId: 'E1', isFounder: true }])
    assert.equal(calls.cacheReads, 0)
    assert.deepEqual(calls.logs, [])
  })

  test('caches a non-founder answer as false', async () => {
    const { deps, calls } = fakeDeps({
      query: async () => ({ data: { me: { employeeId: 'E2', isFounder: false } } }),
    })
    assert.equal(await refreshFounderFlagWith(deps), false)
    assert.deepEqual(calls.saved, [{ employeeId: 'E2', isFounder: false }])
  })

  test('a failed cache write no longer discards a true answer from the server', async () => {
    const { deps, calls } = fakeDeps({
      saveAnswer: async () => {
        throw new Error('AsyncStorage is full')
      },
    })
    assert.equal(await refreshFounderFlagWith(deps), true)
    assert.equal(calls.cacheReads, 0)
    assert.equal(calls.logs.length, 1)
    assert.equal(calls.logs[0].level, 'warn')
    assert.equal(calls.logs[0].data.error, 'AsyncStorage is full')
  })

  test('logs result.error and falls back to the cached flag', async () => {
    const { deps, calls } = fakeDeps({
      query: async () => ({ data: { me: null }, error: { message: 'UNAUTHENTICATED: You must be signed in.' } }),
      cachedFlag: async () => true,
    })
    assert.equal(await refreshFounderFlagWith(deps), true)
    assert.deepEqual(calls.saved, [])
    assert.equal(calls.logs.length, 1)
    assert.equal(calls.logs[0].level, 'error')
    assert.equal(calls.logs[0].data.error, 'UNAUTHENTICATED: You must be signed in.')
  })

  test('an error wins even when partial data came back with it', async () => {
    const { deps, calls } = fakeDeps({
      query: async () => ({ data: { me: { employeeId: 'E1', isFounder: true } }, error: { message: 'partial' } }),
    })
    assert.equal(await refreshFounderFlagWith(deps), false)
    assert.deepEqual(calls.saved, [])
    assert.equal(calls.cacheReads, 1)
  })

  test('logs me = null (the request carried no valid token) and falls back to the cache', async () => {
    const { deps, calls } = fakeDeps({ query: async () => ({ data: { me: null } }) })
    assert.equal(await refreshFounderFlagWith(deps), false)
    assert.deepEqual(calls.saved, [])
    assert.equal(calls.cacheReads, 1)
    assert.equal(calls.logs.length, 1)
    assert.equal(calls.logs[0].level, 'warn')
    assert.match(calls.logs[0].message, /me = null/)
  })

  test('treats missing data like me = null', async () => {
    const { deps, calls } = fakeDeps({ query: async () => ({ data: undefined }) })
    assert.equal(await refreshFounderFlagWith(deps), false)
    assert.equal(calls.cacheReads, 1)
    assert.equal(calls.logs.length, 1)
  })

  test('logs a thrown query and falls back to the cache', async () => {
    const { deps, calls } = fakeDeps({
      query: async () => {
        throw new Error('Network request failed')
      },
      cachedFlag: async () => true,
    })
    assert.equal(await refreshFounderFlagWith(deps), true)
    assert.equal(calls.logs.length, 1)
    assert.equal(calls.logs[0].level, 'error')
    assert.equal(calls.logs[0].data.error, 'Network request failed')
  })

  test('copes with a non-Error rejection', async () => {
    const { deps, calls } = fakeDeps({
      query: async () => {
        throw 'offline'
      },
    })
    assert.equal(await refreshFounderFlagWith(deps), false)
    assert.equal(calls.logs[0].data.error, 'offline')
  })
})
