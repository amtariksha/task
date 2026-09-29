// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getBugDisplayId, getBugTypeDisplayName, isFeatureBug } from '../bugHelpers.ts'

describe('getBugTypeDisplayName', () => {
  // Mirrors workItemNoun() in apps/web/src/lib/workItemType.ts — the two apps must
  // name a work item the same way.
  test('names each type the way the user filed it', () => {
    assert.equal(getBugTypeDisplayName('feature'), 'Feature Request')
    assert.equal(getBugTypeDisplayName('bug'), 'Bug Report')
    assert.equal(getBugTypeDisplayName('release'), 'Release')
    assert.equal(getBugTypeDisplayName('other'), 'Work Item')
  })

  test('is case-insensitive, since the column is not normalised', () => {
    assert.equal(getBugTypeDisplayName('Feature'), 'Feature Request')
    assert.equal(getBugTypeDisplayName('RELEASE'), 'Release')
  })

  // Rows created before migration 056 have type NULL and have always been bugs.
  test('treats a missing type as a bug rather than throwing', () => {
    assert.equal(getBugTypeDisplayName(null), 'Bug Report')
    assert.equal(getBugTypeDisplayName(undefined), 'Bug Report')
    assert.equal(getBugTypeDisplayName(''), 'Bug Report')
  })

  test('still recognises the retired testcase type', () => {
    assert.equal(getBugTypeDisplayName('testcase'), 'Test Case')
  })
})

describe('getBugDisplayId', () => {
  test('prefixes features so they are distinguishable in a mixed list', () => {
    assert.equal(getBugDisplayId('DEV-0001', 'feature'), 'FT-DEV-0001')
    assert.equal(getBugDisplayId('DEV-0001', 'Feature'), 'FT-DEV-0001')
  })

  test('leaves everything else alone', () => {
    assert.equal(getBugDisplayId('DEV-0001', 'bug'), 'DEV-0001')
    assert.equal(getBugDisplayId('DEV-0001', 'release'), 'DEV-0001')
    assert.equal(getBugDisplayId('DEV-0001', null), 'DEV-0001')
  })

  test('an absent id is an empty string, not "undefined"', () => {
    assert.equal(getBugDisplayId('', 'feature'), '')
  })
})

describe('isFeatureBug', () => {
  test('matches either capitalisation and nothing else', () => {
    assert.equal(isFeatureBug('feature'), true)
    assert.equal(isFeatureBug('Feature'), true)
    assert.equal(isFeatureBug('bug'), false)
    assert.equal(isFeatureBug(null), false)
  })
})
