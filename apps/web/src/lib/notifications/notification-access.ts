/**
 * Who may read or change a user's feed notifications.
 *
 * Kept free of database imports: lookups are injected so the rules run under
 * `node --test` (see __tests__/notification-access.test.mjs). The GraphQL
 * resolvers wire in the real lookups.
 */

export const UNAUTHENTICATED_MESSAGE = 'UNAUTHENTICATED: You must be signed in.'
export const FORBIDDEN_MESSAGE = 'FORBIDDEN: You do not have permission to perform this action.'

/** The only global role that may act on other users' notifications. */
const NOTIFICATION_ADMIN_ROLE = 'admin'

export interface NotificationActor {
  employeeId: string
  role?: string
  companyId?: string | null
  isPlatformAdmin?: boolean
}

export interface NotificationAccessDeps {
  isPlatformAdmin: (actor: NotificationActor) => Promise<boolean>
  getDefaultCompanyId: (employeeId: string) => Promise<string | null>
  isMemberOfCompany: (employeeId: string, companyId: string) => Promise<boolean>
}

export function requireNotificationActor(context: unknown): NotificationActor {
  const user = (context as { user?: Partial<NotificationActor> | null } | null | undefined)?.user
  if (!user?.employeeId) throw new Error(UNAUTHENTICATED_MESSAGE)
  return user as NotificationActor
}

/**
 * True for the recipient, a platform admin, or an `admin` who shares a company
 * with the recipient. The `admin` role used to reach every tenant.
 *
 * Tokens issued before migration 062 carry no companyId; those resolve the
 * admin's default company instead of failing open like authz.isSameCompany,
 * because an unscoped admin here would read every tenant's notifications.
 */
export async function canAccessNotificationsOf(
  actor: NotificationActor,
  recipientId: string,
  deps: NotificationAccessDeps
): Promise<boolean> {
  if (recipientId === actor.employeeId) return true
  if (await deps.isPlatformAdmin(actor)) return true
  if (actor.role !== NOTIFICATION_ADMIN_ROLE) return false

  const companyId = actor.companyId ?? (await deps.getDefaultCompanyId(actor.employeeId))
  if (!companyId) return false
  return deps.isMemberOfCompany(recipientId, companyId)
}

export async function assertCanAccessNotificationsOf(
  actor: NotificationActor,
  recipientId: string,
  deps: NotificationAccessDeps
): Promise<void> {
  if (!(await canAccessNotificationsOf(actor, recipientId, deps))) {
    throw new Error(FORBIDDEN_MESSAGE)
  }
}

/**
 * Resolve the `userId` argument of the list, count and mark-all operations.
 *
 * A non-admin naming someone else is quietly scoped to themselves, as before —
 * a client holding a stale id still gets the signed-in user's data and nothing
 * more. An admin naming a user outside their reach gets FORBIDDEN rather than
 * their own notifications, which would be misleading on an admin screen.
 */
export async function resolveNotificationRecipient(
  actor: NotificationActor,
  requestedUserId: string | null | undefined,
  deps: NotificationAccessDeps
): Promise<string> {
  if (!requestedUserId || requestedUserId === actor.employeeId) return actor.employeeId
  if (await canAccessNotificationsOf(actor, requestedUserId, deps)) return requestedUserId
  if (actor.role !== NOTIFICATION_ADMIN_ROLE) return actor.employeeId
  throw new Error(FORBIDDEN_MESSAGE)
}
