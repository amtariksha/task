import { User } from '../services/userService'

// Define all available tabs in the application
// Order here determines order in the User Edit modal's permission grid
export const AVAILABLE_TABS = [
    { key: 'home', label: 'Home' },
    { key: 'feed', label: 'Feed' },
    { key: 'attendance_dashboard', label: 'Attendance Dashboard' },
    { key: 'projects', label: 'Projects' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'bugs', label: 'Development' },
    { key: 'your_work', label: 'Your Work' },
    { key: 'team_tasks', label: 'Team Tasks' },
    { key: 'user_management', label: 'User Management' },
    { key: 'feed_topics', label: 'Feed Topics' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'settings', label: 'Settings' },
    { key: 'deleted_items', label: 'Deleted Items' },
    { key: 'reports', label: 'Reports' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'leaves', label: 'Leaves' },
    { key: 'wfh', label: 'WFH' }
]

// Define default permissions for each role
// Migration 040 reconciles existing user records with these keys.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    // The database CHECK constraint names this role 'employee'; 'amtarikshian' is
    // the historical spelling and both are in live data. A missing key here meant
    // a user with no explicit tabPermissions saw NO tabs at all.
    'employee': [
        'home', 'feed', 'tasks', 'bugs', 'your_work',
        'attendance', 'leaves', 'wfh'
    ],
    'amtarikshian': [
        'home', 'feed', 'tasks', 'bugs', 'your_work',
        'attendance', 'leaves', 'wfh'
    ],
    'management': [
        'home', 'feed', 'tasks', 'bugs', 'your_work', 'team_tasks',
        'attendance', 'leaves', 'wfh', 'user_management', 'projects'
    ],
    'top_management': [
        'home', 'feed', 'tasks', 'bugs', 'your_work', 'team_tasks',
        'attendance', 'leaves', 'wfh', 'user_management', 'settings',
        'reports', 'projects', 'approvals', 'attendance_dashboard'
    ],
    'admin': [
        'home', 'feed', 'tasks', 'bugs', 'your_work', 'team_tasks',
        'attendance', 'leaves', 'wfh', 'user_management', 'settings',
        'reports', 'projects', 'approvals', 'attendance_dashboard',
        'feed_topics', 'deleted_items'
    ]
}

/**
 * Check if a user has access to a specific tab
 * Prioritizes user-specific tabPermissions over role-based defaults
 */
export function hasTabAccess(user: User | null | undefined, tab: string): boolean {
    if (!user) return false

    // Check for user-specific overrides first
    if (user.tabPermissions && user.tabPermissions.length > 0) {
        return user.tabPermissions.includes(tab)
    }

    // Fallback to role-based permissions
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[user.role] || []
    return rolePermissions.includes(tab)
}

/**
 * Get all tabs accessible to a user
 */
export function getUserAccessibleTabs(user: User | null | undefined): string[] {
    if (!user) return []

    // Return user-specific overrides if they exist
    if (user.tabPermissions && user.tabPermissions.length > 0) {
        return [...user.tabPermissions]
    }

    // Return role-based permissions
    return DEFAULT_ROLE_PERMISSIONS[user.role] || []
}

/**
 * Global roles that may approve leave, WFH and attendance for someone else.
 *
 * 'amtarikshian' (the plain employee role) used to be in the approver lists on the
 * leave and WFH detail screens, so every employee was shown Approve / Reject,
 * while 'admin' was missing and admins were not. The server decides for real
 * (lib/authz.canApproveFor: never yourself, otherwise your reporting chain or a
 * company you administer); this list only decides whether to draw the buttons.
 */
export const APPROVER_ROLES = ['admin', 'top_management', 'management']

/** Project roles that may administer a project's members and settings. */
export type ProjectRole = 'manager' | 'team_leader' | 'member'

/**
 * Check if a user can manage (create/edit) projects.
 *
 * Global-role only — use canManageThisProject() when a project is in hand, since
 * the server authorizes per project (lib/authz.canManageProject) and a global
 * 'management' role grants nothing on a project you are not the manager of.
 */
export function canManageProjects(user: User | null | undefined): boolean {
    if (!user) return false
    const role = user.role?.toLowerCase()
    return role === 'admin' || role === 'top_management' || role === 'management'
}

/**
 * Check if a user can delete projects
 */
export function canDeleteProjects(user: User | null | undefined): boolean {
    if (!user) return false
    const role = user.role?.toLowerCase()
    return role === 'admin' || role === 'top_management'
}

/**
 * May this user edit THIS project — its details, members and sub-projects?
 *
 * Mirrors the server's rule: the project's own manager, or an admin of the
 * company that owns it. The screens used the global role instead, so a
 * 'management' user saw edit controls on every project and then got a 403, while
 * a project manager without a privileged global role saw none at all.
 */
export function canManageThisProject(
    user: User | null | undefined,
    projectRole: ProjectRole | null,
    isCompanyAdmin: boolean
): boolean {
    if (!user) return false
    if (isCompanyAdmin) return true
    if (projectRole === 'manager') return true
    // Retained until every deployment has migrated off the global roles.
    const role = user.role?.toLowerCase()
    return role === 'admin' || role === 'top_management'
}

/** May this user change a project's secrets, requirements and release settings? */
export function canLeadThisProject(
    user: User | null | undefined,
    projectRole: ProjectRole | null,
    isCompanyAdmin: boolean
): boolean {
    if (projectRole === 'team_leader') return true
    return canManageThisProject(user, projectRole, isCompanyAdmin)
}
