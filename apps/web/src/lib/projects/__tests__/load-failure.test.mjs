// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_ACCESS_REFUSED_MESSAGE, describeProjectLoadFailure } from '../load-failure.ts'

describe('describeProjectLoadFailure — what the project page shows when its project does not load', () => {
  test('a refusal shows the reason the server gave', () => {
    const body = { success: false, error: 'This project belongs to another company. Switch to that company to open it.' }
    assert.deepEqual(describeProjectLoadFailure(403, body), {
      kind: 'forbidden',
      message: 'This project belongs to another company. Switch to that company to open it.',
    })
  })

  test('a refusal with no usable reason still says access was refused', () => {
    for (const body of [null, undefined, 'Forbidden', {}, { error: '' }, { error: 42 }]) {
      assert.deepEqual(describeProjectLoadFailure(403, body), {
        kind: 'forbidden',
        message: PROJECT_ACCESS_REFUSED_MESSAGE,
      })
    }
  })

  test('a missing project is not presented as a permissions problem', () => {
    assert.deepEqual(describeProjectLoadFailure(404, { success: false, error: 'Project not found' }), {
      kind: 'not_found',
      message: 'Project not found',
    })
  })

  test('anything else is a generic failure that does not echo the server', () => {
    for (const status of [400, 401, 500, 503]) {
      assert.deepEqual(describeProjectLoadFailure(status, { error: 'relation "projects" does not exist' }), {
        kind: 'error',
        message: 'Failed to fetch project',
      })
    }
  })
})
