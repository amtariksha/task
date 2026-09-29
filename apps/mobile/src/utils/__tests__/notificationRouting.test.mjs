// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { FALLBACK_TARGET, notificationTarget } from '../notificationRouting.ts'

describe('push payloads', () => {
  test('a task push opens the task', () => {
    assert.deepEqual(notificationTarget({ type: 'task', taskId: 'TSK-1' }), {
      screen: 'TaskDetails',
      params: { taskId: 'TSK-1' },
    })
  })

  test('a bug push opens the bug, whatever work-item type it is', () => {
    for (const type of ['bug', 'bug_assigned', 'feature_assigned', 'release_status_changed']) {
      assert.deepEqual(notificationTarget({ type, bugId: 'DEV-1' }), {
        screen: 'BugDetails',
        params: { bugId: 'DEV-1' },
      })
    }
  })

  test('leave and WFH pushes open their application', () => {
    assert.deepEqual(notificationTarget({ type: 'leave', leaveId: 'LEAVE-1' }), {
      screen: 'LeaveDetails',
      params: { leaveId: 'LEAVE-1' },
    })
    assert.deepEqual(notificationTarget({ type: 'wfh', wfhId: 'WFH-1' }), {
      screen: 'WFHDetails',
      params: { wfhId: 'WFH-1' },
    })
  })

  test('a feed push with a post opens the post, without one the feed', () => {
    assert.deepEqual(notificationTarget({ type: 'feed', postId: 'P-1' }), {
      screen: 'FeedPostDetails',
      params: { postId: 'P-1' },
    })
    assert.deepEqual(notificationTarget({ type: 'feed' }), { screen: 'FeedTab' })
  })
})

describe('the founder Start brief', () => {
  // FounderStart is only registered in the navigator for a founder, so sending
  // anyone else there throws.
  test('a founder goes to Start', () => {
    assert.deepEqual(notificationTarget({ screen: 'FounderStart' }, { isFounder: true }), {
      screen: 'FounderStart',
    })
    assert.deepEqual(notificationTarget({ notificationType: 'founder_start' }, { isFounder: true }), {
      screen: 'FounderStart',
    })
  })

  test('anyone else goes to the notification list', () => {
    assert.deepEqual(notificationTarget({ screen: 'FounderStart' }, { isFounder: false }), FALLBACK_TARGET)
    assert.deepEqual(notificationTarget({ notificationType: 'founder_start' }), FALLBACK_TARGET)
  })

  test('and the same applies when it arrives only as a /start link', () => {
    assert.deepEqual(notificationTarget({ linkUrl: '/start' }, { isFounder: false }), FALLBACK_TARGET)
    assert.deepEqual(notificationTarget({ linkUrl: '/start' }, { isFounder: true }), {
      screen: 'FounderStart',
    })
  })
})

describe('in-app feed rows', () => {
  // The in-app list only marked a notification read; this is the mapping that was
  // missing from it.
  test('a task_assigned row opens the task', () => {
    assert.deepEqual(
      notificationTarget({ notificationType: 'task_assigned', taskId: 'TSK-9', linkUrl: '/tasks/TSK-9' }),
      { screen: 'TaskDetails', params: { taskId: 'TSK-9' } }
    )
  })

  // Feed rows have no leaveId column, so linkUrl is the only source.
  test('a leave_approved row falls back to its link', () => {
    assert.deepEqual(
      notificationTarget({ notificationType: 'leave_approved', linkUrl: '/leaves/LEAVE-7' }),
      { screen: 'LeaveDetails', params: { leaveId: 'LEAVE-7' } }
    )
  })

  test('a link to a list opens that list', () => {
    assert.deepEqual(notificationTarget({ notificationType: 'leave_approved', linkUrl: '/leaves' }), {
      screen: 'Leaves',
    })
    assert.deepEqual(notificationTarget({ notificationType: 'wfh_approved', linkUrl: '/wfh' }), {
      screen: 'WFH',
    })
  })

  test('a requirement link carries both ids', () => {
    assert.deepEqual(
      notificationTarget({ notificationType: 'requirement_rejected', linkUrl: '/projects/PRJ-1/requirements/REQ-2' }),
      { screen: 'RequirementDetails', params: { projectId: 'PRJ-1', requirementId: 'REQ-2' } }
    )
  })

  test('a query string on the link does not break the match', () => {
    assert.deepEqual(notificationTarget({ linkUrl: '/tasks/TSK-3?from=email' }), {
      screen: 'TaskDetails',
      params: { taskId: 'TSK-3' },
    })
  })

  test('a trailing slash does not break the match', () => {
    assert.deepEqual(notificationTarget({ linkUrl: '/feed/' }), { screen: 'FeedTab' })
  })
})

describe('an id without a matching type', () => {
  // A comment on a bug is notificationType 'comment' but carries bugId; opening
  // the bug beats dropping the user on the list.
  test('still opens the entity', () => {
    assert.deepEqual(notificationTarget({ notificationType: 'comment', bugId: 'DEV-4' }), {
      screen: 'BugDetails',
      params: { bugId: 'DEV-4' },
    })
  })

  test('a post id wins over a bare category', () => {
    assert.deepEqual(notificationTarget({ notificationType: 'mention', postId: 'P-2' }), {
      screen: 'FeedPostDetails',
      params: { postId: 'P-2' },
    })
  })
})

describe('nothing usable', () => {
  test('an empty notification goes to the list rather than nowhere', () => {
    assert.deepEqual(notificationTarget({}), FALLBACK_TARGET)
    assert.deepEqual(notificationTarget({ notificationType: 'something_new' }), FALLBACK_TARGET)
  })

  test('an unrecognised link goes to the list', () => {
    assert.deepEqual(notificationTarget({ linkUrl: '/some/unknown/place' }), FALLBACK_TARGET)
  })

  test('nulls are tolerated, not crashed on', () => {
    assert.deepEqual(
      notificationTarget({ notificationType: null, taskId: null, linkUrl: null }),
      FALLBACK_TARGET
    )
  })
})
