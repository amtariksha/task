/**
 * Who may do what to a requirement.
 *
 * These mirror the guards in apps/web/src/graphql/requirement-resolvers.ts. The
 * server is authoritative; this module exists so the mobile UI stops offering
 * actions that can only end in a FORBIDDEN error — every edit control was shown
 * to every project member, and the status picker offered transitions the server
 * rejects outright.
 *
 * No imports: the rules are covered by __tests__/requirementPermissions.test.mjs.
 */

/** Global roles that may review any requirement and drive its lifecycle. */
export const PRIVILEGED_ROLES = ['admin', 'top_management', 'management'] as const

export interface RequirementActor {
  employeeId?: string
  role?: string
}

export interface RequirementFacts {
  status: string
  createdBy?: string | null
  reviewerId?: string | null
}

export function isPrivilegedRole(role?: string | null): boolean {
  return !!role && (PRIVILEGED_ROLES as readonly string[]).includes(role)
}

/** Draft and Rejected are the only statuses that can be sent for review. */
export function canSubmitForReview(status: string): boolean {
  return status === 'Draft' || status === 'Rejected'
}

/**
 * May this person approve or reject?
 *
 * Privileged roles may review anything, including their own work — small teams
 * need a working approver. Everyone else must be the designated reviewer and not
 * the author. The server additionally refuses the last editor, which cannot be
 * determined here, so the buttons may still be refused on submit.
 */
export function canReviewRequirement(req: RequirementFacts, actor: RequirementActor): boolean {
  if (req.status !== 'In Review') return false
  if (isPrivilegedRole(actor.role)) return true
  if (!actor.employeeId || req.reviewerId !== actor.employeeId) return false
  return req.createdBy !== actor.employeeId
}

/**
 * Lifecycle transitions `updateRequirementStatus` actually accepts.
 *
 * 'Implemented' is NOT one of them — it is reached only by creating a DEV item —
 * yet the picker offered it, so choosing it always failed. 'Verified' needs an
 * Implemented requirement and the reviewer (or a privileged role); 'Deprecated'
 * needs a privileged role, or the author while it is still a Draft.
 */
export function lifecycleStatusOptions(req: RequirementFacts, actor: RequirementActor): string[] {
  const options: string[] = []
  const privileged = isPrivilegedRole(actor.role)
  const isReviewer = !!actor.employeeId && req.reviewerId === actor.employeeId

  if (req.status === 'Implemented' && (privileged || isReviewer)) {
    options.push('Verified')
  }
  if (privileged || (req.createdBy === actor.employeeId && req.status === 'Draft')) {
    if (req.status !== 'Deprecated') options.push('Deprecated')
  }
  return options
}

/** A DEV item can only come from an Approved requirement. */
export function canCreateDevItem(status: string): boolean {
  return status === 'Approved'
}

/** Only the author or a privileged role may delete a requirement. */
export function canDeleteRequirement(req: RequirementFacts, actor: RequirementActor): boolean {
  if (isPrivilegedRole(actor.role)) return true
  return !!actor.employeeId && req.createdBy === actor.employeeId
}
