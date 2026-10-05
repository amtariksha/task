// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { unwrapApiBody, unwrapApiList } from '../apiEnvelope.ts'

const FALLBACK = 'Something went wrong'

describe('unwrapApiBody', () => {
  test('a bare created project is a success (POST /api/projects answers 201 with the record)', () => {
    const created = { projectId: 'PRJ-007', projectName: 'Launch', status: 'Active' }
    assert.deepEqual(unwrapApiBody(created, FALLBACK), { success: true, data: created })
  })

  test('a bare array is a success', () => {
    const rows = [{ projectId: 'PRJ-001' }]
    assert.deepEqual(unwrapApiBody(rows, FALLBACK), { success: true, data: rows })
  })

  test('an empty bare array is still a success, not a failure', () => {
    assert.deepEqual(unwrapApiBody([], FALLBACK), { success: true, data: [] })
  })

  test('an envelope is unwrapped to its data', () => {
    const rows = [{ employeeId: 'E1' }]
    assert.deepEqual(unwrapApiBody({ success: true, data: rows }, FALLBACK), { success: true, data: rows })
  })

  test('an envelope with success but no data yields the body (PUT /api/projects/{id} spreads the record)', () => {
    const body = { projectId: 'PRJ-001', projectName: 'Renamed', success: true }
    assert.deepEqual(unwrapApiBody(body, FALLBACK), { success: true, data: body })
  })

  test('a failed envelope carries its error', () => {
    assert.deepEqual(unwrapApiBody({ success: false, error: 'Unauthorized' }, FALLBACK), {
      success: false,
      error: 'Unauthorized',
    })
  })

  test('a failed envelope falls back to its message, then to the fallback', () => {
    assert.deepEqual(unwrapApiBody({ success: false, message: 'Not allowed' }, FALLBACK), {
      success: false,
      error: 'Not allowed',
    })
    assert.deepEqual(unwrapApiBody({ success: false }, FALLBACK), { success: false, error: FALLBACK })
    assert.deepEqual(unwrapApiBody({ success: false, error: '' }, FALLBACK), { success: false, error: FALLBACK })
  })

  test('a bare refusal ({ error } with no success) is a failure', () => {
    const body = { error: 'You do not have permission to create projects in this company.' }
    assert.deepEqual(unwrapApiBody(body, FALLBACK), { success: false, error: body.error })
  })

  test('a bare object with a message but no error is a success', () => {
    const body = { projectId: 'PRJ-001', message: 'hello' }
    assert.deepEqual(unwrapApiBody(body, FALLBACK), { success: true, data: body })
  })

  test('no body at all is a failure', () => {
    assert.deepEqual(unwrapApiBody(null, FALLBACK), { success: false, error: FALLBACK })
    assert.deepEqual(unwrapApiBody(undefined, FALLBACK), { success: false, error: FALLBACK })
  })
})

describe('unwrapApiList', () => {
  test('accepts a bare array (GET /api/projects)', () => {
    const rows = [{ projectId: 'PRJ-001' }, { projectId: 'PRJ-002' }]
    assert.deepEqual(unwrapApiList(rows, FALLBACK), { success: true, data: rows })
  })

  test('accepts an enveloped array', () => {
    const rows = [{ projectId: 'PRJ-001' }]
    assert.deepEqual(unwrapApiList({ success: true, data: rows }, FALLBACK), { success: true, data: rows })
  })

  test('a success that is not an array is a failure, so callers never map over an object', () => {
    assert.deepEqual(unwrapApiList({ projectId: 'PRJ-001' }, FALLBACK), { success: false, error: FALLBACK })
    assert.deepEqual(unwrapApiList({ success: true, data: null }, FALLBACK), { success: false, error: FALLBACK })
  })

  test('passes a failure through', () => {
    assert.deepEqual(unwrapApiList({ error: 'Unauthorized' }, FALLBACK), { success: false, error: 'Unauthorized' })
    assert.deepEqual(unwrapApiList({ success: false, error: 'Network error' }, FALLBACK), {
      success: false,
      error: 'Network error',
    })
  })
})
