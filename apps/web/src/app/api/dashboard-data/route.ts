import { NextRequest, NextResponse } from 'next/server'
import { withTimeout } from '@/lib/db/config'
import { getTasksByEmployeeId, getAllTasks } from '@/lib/db/tasks'
import { getBugsByEmployeeId, getAllBugs } from '@/lib/db/bugs'
import { getUsersByEmployeeIds, getAllUsers } from '@/lib/db/users'
import { getDropdownSettings } from '@/lib/db/settings'
import { getSubTasksByAssignedTo } from '@/lib/db/taskChecklists'
import { getBugSubTasksByAssignedTo } from '@/lib/db/bugSubtasks'
import { getUserProjectIds } from '@/lib/db/project-users'
import { getAuthUser } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    
    // Override search parameters with authUser info unless requester is admin or top_management
    let employeeId = sp.get('employeeId') || ''
    let role = (sp.get('role') || 'amtarikshian').toLowerCase()

    const isAdminOrTopMgmt = ['admin', 'top_management'].includes(authUser.role.toLowerCase())

    if (!isAdminOrTopMgmt) {
      employeeId = authUser.employeeId
      role = authUser.role.toLowerCase()
    } else {
      if (!employeeId) {
        employeeId = authUser.employeeId
      }
      if (!sp.get('role')) {
        role = authUser.role.toLowerCase()
      }
    }

    const includeUsers = sp.get('includeUsers') === 'true' || ['admin', 'top_management'].includes(role)

    // Load core data in parallel based on role
    let tasksPromise: Promise<any[]> | null = null
    let bugsPromise: Promise<any[]> | null = null
    let usersPromise: Promise<any[]> | null = null
    let subtasksPromise: Promise<any[]> | null = null
    let bugSubtasksPromise: Promise<any[]> | null = null

    if (includeUsers) {
      usersPromise = withTimeout(getAllUsers(), 10000, 'Failed to fetch users')
      tasksPromise = withTimeout(getAllTasks(), 10000, 'Failed to fetch tasks')
      bugsPromise = withTimeout(getAllBugs(), 10000, 'Failed to fetch bugs')
    } else {
      tasksPromise = withTimeout(getTasksByEmployeeId(employeeId), 10000, 'Failed to fetch tasks for user')
      bugsPromise = withTimeout(getBugsByEmployeeId(employeeId), 10000, 'Failed to fetch bugs for user')
      // Fetch subtasks assigned to the user
      subtasksPromise = withTimeout(getSubTasksByAssignedTo(employeeId), 10000, 'Failed to fetch subtasks for user')
      bugSubtasksPromise = withTimeout(getBugSubTasksByAssignedTo(employeeId), 10000, 'Failed to fetch bug subtasks for user')
    }

    const settingsPromise = withTimeout(
      getDropdownSettings(authUser.companyId ?? null),
      8000,
      'Failed to fetch settings'
    )

    let [tasks, bugs, settings, users, subtasks, bugSubtasks] = await Promise.all([
      tasksPromise!,
      bugsPromise!,
      settingsPromise,
      usersPromise || Promise.resolve([]),
      subtasksPromise || Promise.resolve([]),
      bugSubtasksPromise || Promise.resolve([])
    ])

    // Project-access scoping for non-admin users (Dashboard widgets — option C)
    // Admin/top_management see everything; others see only items in projects they're assigned to.
    if (!['admin', 'top_management'].includes(role) && employeeId) {
      const accessibleProjectIds = await getUserProjectIds(employeeId)
      const accessibleSet = new Set(accessibleProjectIds)
      // Items without a projectId stay visible (treat as not-project-scoped)
      tasks = tasks.filter((t: any) => !t.projectId || accessibleSet.has(t.projectId))
      bugs = bugs.filter((b: any) => !b.projectId || accessibleSet.has(b.projectId))
    }

    // Build user map from referenced IDs
    const idSet = new Set<string>()
    tasks.forEach((t: any) => {
      // assignedTo is now a JSONB array
      if (Array.isArray(t.assignedTo)) {
        t.assignedTo.forEach((id: string) => idSet.add(id))
      } else if (t.assignedTo) {
        idSet.add(t.assignedTo) // Backward compatibility
      }
      if (t.assignedBy) idSet.add(t.assignedBy)
      if (Array.isArray(t.support)) t.support.forEach((s: string) => idSet.add(s))
    })
    bugs.forEach((b: any) => {
      if (b.assignedTo) idSet.add(b.assignedTo)
      if (b.assignedBy) idSet.add(b.assignedBy)
      if (b.reportedBy) idSet.add(b.reportedBy)
    })
    // Add users from subtasks
    if (subtasks) {
      subtasks.forEach((st: any) => {
        if (st.assignedTo) idSet.add(st.assignedTo)
        if (st.createdBy) idSet.add(st.createdBy)
      })
    }
    if (bugSubtasks) {
      bugSubtasks.forEach((bst: any) => {
        if (bst.assignedTo) idSet.add(bst.assignedTo)
        if (bst.createdBy) idSet.add(bst.createdBy)
      })
    }
    // Always include current user
    if (employeeId) idSet.add(employeeId)

    // If we already fetched all users (admin view), use that list to build map
    let userMap: Record<string, any> = {}
    if (users && users.length > 0 && includeUsers) {
      userMap = Object.fromEntries(users.map((u: any) => [u.employeeId, u]))
    } else {
      const ids = Array.from(idSet)
      const batchUsers = ids.length > 0 ? await withTimeout(getUsersByEmployeeIds(ids), 8000, 'Failed to fetch users batch') : []
      userMap = Object.fromEntries(batchUsers.map((u: any) => [u.employeeId, u]))
    }

    const payload = {
      success: true,
      data: {
        tasks,
        bugs,
        subtasks: subtasks || [],
        bugSubtasks: bugSubtasks || [],
        settings,
        users: includeUsers ? (users || []) : undefined,
        userMap,
        counts: {
          tasks: tasks.length,
          bugs: bugs.length,
          subtasks: subtasks?.length || 0,
          bugSubtasks: bugSubtasks?.length || 0,
          users: includeUsers ? (users?.length || 0) : Object.keys(userMap).length
        }
      },
      source: 'database'
    }

    const res = NextResponse.json(payload)
    // The payload is this employee's own tasks and bugs; a shared cache would
    // serve it to whoever asked next.
    res.headers.set('Cache-Control', 'private, max-age=60')
    return res
  } catch (error: any) {
    console.error('Error in GET /api/dashboard-data:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load dashboard data' }, { status: 500 })
  }
}

