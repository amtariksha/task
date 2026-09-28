// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { workItemLabels, workItemNoun, workItemSubject } from '../workItemType.ts'

describe('workItemNoun', () => {
  test('names each type the way the user filed it', () => {
    assert.equal(workItemNoun('feature'), 'Feature Request')
    assert.equal(workItemNoun('bug'), 'Bug Report')
    assert.equal(workItemNoun('release'), 'Release')
    assert.equal(workItemNoun('other'), 'Work Item')
  })

  // Rows created before migration 056 have type NULL and have always been bugs.
  test('treats a missing type as a bug rather than throwing', () => {
    assert.equal(workItemNoun(null), 'Bug Report')
    assert.equal(workItemNoun(undefined), 'Bug Report')
  })

  test('falls back for a type the database grows later', () => {
    assert.equal(workItemNoun('epic'), 'Bug Report')
  })
})

describe('notification titles', () => {
  // The defect: "New Bug Assigned" was sent for feature requests too.
  test('assignment title follows the type', () => {
    assert.equal(`New ${workItemNoun('feature')} Assigned`, 'New Feature Request Assigned')
    assert.equal(`New ${workItemNoun('bug')} Assigned`, 'New Bug Report Assigned')
    assert.equal(`New ${workItemNoun(null)} Assigned`, 'New Bug Report Assigned')
  })

  test('status and severity titles follow the type', () => {
    assert.equal(`${workItemNoun('release')} Status Changed`, 'Release Status Changed')
    assert.equal(`${workItemNoun('feature')} Severity Changed`, 'Feature Request Severity Changed')
  })
})

describe('workItemSubject', () => {
  test('carries the emoji, noun, action, title and id', () => {
    assert.equal(
      workItemSubject('feature', 'Assigned', 'Dark mode', 'DEV-12'),
      '✨ Feature Request Assigned: Dark mode (DEV-12)'
    )
    assert.equal(
      workItemSubject(null, 'Created', 'Login fails', 'DEV-13'),
      '🐛 Bug Report Created: Login fails (DEV-13)'
    )
  })
})

describe('workItemLabels', () => {
  test('the description label differs per type', () => {
    assert.equal(workItemLabels('feature').descriptionLabel, 'Feature Description')
    assert.equal(workItemLabels('bug').descriptionLabel, 'Steps to Reproduce')
    assert.equal(workItemLabels('release').descriptionLabel, 'Release Notes')
  })
})
