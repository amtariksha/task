/**
 * Where a notification should take you.
 *
 * Tapping a push notification navigated to the right screen; tapping the same
 * notification in the in-app list only marked it read and left you where you
 * were. The routing lived inline in App.tsx and nothing else could reach it.
 *
 * The two sources carry different shapes — a push payload has `type` and a
 * `screen`, a feed row has `notificationType` and per-entity ids — so this takes
 * both and falls back to `linkUrl`, which the server sets on every notification
 * it creates. No imports, so the rules are covered by
 * __tests__/notificationRouting.test.mjs.
 */

/** Fields either source may provide. Everything is optional by design. */
export interface NotificationLike {
  /** Feed row: 'task_assigned', 'bug_status_changed', 'leave_approved', … */
  notificationType?: string | null
  /** Push payload: 'task' | 'bug' | 'leave' | 'wfh' | 'feed' | … */
  type?: string | null
  /** Push payload may name the screen outright (the founder Start brief does). */
  screen?: string | null
  taskId?: string | null
  bugId?: string | null
  leaveId?: string | null
  wfhId?: string | null
  postId?: string | null
  requirementId?: string | null
  projectId?: string | null
  /** The web path the server attached, e.g. '/tasks/TSK-1'. The reliable fallback. */
  linkUrl?: string | null
}

export interface NotificationTarget {
  screen: string
  params?: Record<string, string>
}

/** Where anything unrecognised goes: the list itself, never nowhere. */
export const FALLBACK_TARGET: NotificationTarget = { screen: 'Notifications' }

/**
 * Pull ids out of the server's linkUrl. Feed rows do not carry leaveId, wfhId or
 * requirementId as columns, so for those this is the only source.
 */
function fromLinkUrl(linkUrl: string): NotificationTarget | null {
  const path = linkUrl.split('?')[0]!.replace(/\/+$/, '')

  const requirement = /^\/projects\/([^/]+)\/requirements\/([^/]+)$/.exec(path)
  if (requirement) {
    return { screen: 'RequirementDetails', params: { projectId: requirement[1]!, requirementId: requirement[2]! } }
  }

  const single: Array<[RegExp, string, string]> = [
    [/^\/tasks\/([^/]+)$/, 'TaskDetails', 'taskId'],
    [/^\/bugs\/([^/]+)$/, 'BugDetails', 'bugId'],
    [/^\/leaves\/([^/]+)$/, 'LeaveDetails', 'leaveId'],
    [/^\/wfh\/([^/]+)$/, 'WFHDetails', 'wfhId'],
    [/^\/feed\/([^/]+)$/, 'FeedPostDetails', 'postId'],
    [/^\/projects\/([^/]+)$/, 'ProjectDetails', 'projectId'],
  ]
  for (const [pattern, screen, param] of single) {
    const match = pattern.exec(path)
    if (match) return { screen, params: { [param]: match[1]! } }
  }

  const lists: Record<string, string> = {
    '/tasks': 'TaskList',
    '/bugs': 'BugList',
    '/leaves': 'Leaves',
    '/wfh': 'WFH',
    '/feed': 'FeedTab',
    '/approvals': 'AttendanceApprovals',
    '/start': 'FounderStart',
    '/requirements': 'RequirementsList',
  }
  return lists[path] ? { screen: lists[path]! } : null
}

/**
 * The screen a notification points at.
 *
 * `isFounder` matters because FounderStart is only registered in the navigator for
 * a founder — navigating a non-founder there throws, so they go to the list.
 */
export function notificationTarget(
  notification: NotificationLike,
  options: { isFounder?: boolean } = {}
): NotificationTarget {
  const kind = (notification.notificationType || notification.type || '').toLowerCase()

  // The founder Start brief names its screen explicitly.
  if (notification.screen === 'FounderStart' || kind === 'founder_start') {
    return options.isFounder ? { screen: 'FounderStart' } : FALLBACK_TARGET
  }

  // Prefer an id we actually hold over parsing a path.
  if (notification.taskId && kind.startsWith('task')) {
    return { screen: 'TaskDetails', params: { taskId: notification.taskId } }
  }
  if (notification.bugId && (kind.startsWith('bug') || kind.startsWith('feature') || kind.startsWith('release'))) {
    return { screen: 'BugDetails', params: { bugId: notification.bugId } }
  }
  if (notification.leaveId && kind.startsWith('leave')) {
    return { screen: 'LeaveDetails', params: { leaveId: notification.leaveId } }
  }
  if (notification.wfhId && kind.startsWith('wfh')) {
    return { screen: 'WFHDetails', params: { wfhId: notification.wfhId } }
  }
  if (notification.requirementId && notification.projectId && kind.startsWith('requirement')) {
    return {
      screen: 'RequirementDetails',
      params: { requirementId: notification.requirementId, projectId: notification.projectId },
    }
  }
  if (notification.postId) {
    return { screen: 'FeedPostDetails', params: { postId: notification.postId } }
  }

  // An id without a matching type still beats the list: a bug_assigned push and a
  // comment on a bug both carry bugId and should both open the bug.
  if (notification.taskId) return { screen: 'TaskDetails', params: { taskId: notification.taskId } }
  if (notification.bugId) return { screen: 'BugDetails', params: { bugId: notification.bugId } }

  if (notification.linkUrl) {
    const fromLink = fromLinkUrl(notification.linkUrl)
    if (fromLink) {
      // Same guard as above: never send a non-founder to a screen that is not
      // registered for them.
      if (fromLink.screen === 'FounderStart' && !options.isFounder) return FALLBACK_TARGET
      return fromLink
    }
  }

  // Bare category pushes with no id at all.
  if (kind === 'feed' || kind === 'mention' || kind === 'comment' || kind === 'reaction') {
    return { screen: 'FeedTab' }
  }

  return FALLBACK_TARGET
}
