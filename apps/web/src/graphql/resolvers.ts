import DataLoader from 'dataloader'
import { getPool } from '@/lib/db'
import {
  logResolverStart,
  logResolverSuccess,
  logResolverError,
  logDatabaseQuery,
  logDatabaseResult,
  logDatabaseError
} from '@/lib/graphql-logger'
import { mentionQueries, mentionMutations, mentionFieldResolvers } from './mention-resolvers'
import { notificationQueries, notificationMutations, FeedNotificationFieldResolvers, createNotificationLoader } from './notification-resolvers'
import { pushTokenMutations } from './push-token-resolvers'
import { requirementQueries, requirementMutations, requirementFieldResolvers } from './requirement-resolvers'
import { founderQueries, founderMutations, founderFieldResolvers } from './founder-resolvers'
import { isFounderEmployee } from '@/lib/founder/founder-auth'
import { parseMentions, storeMentions } from '@/lib/mention-parser'
import { createCommentNotification, createReactionNotification, createPostStatusNotification } from '@/lib/notification-helper'
import { format, differenceInMinutes, startOfMonth, endOfMonth, startOfDay, endOfDay, addMinutes } from 'date-fns'
import { getCurrentDateTime } from '@/lib/datetime-utils'

// Helper to get current IST time as Date object (for logic comparisons)
const getISTDate = (date: Date = new Date()) => addMinutes(date, 330) // UTC + 5:30

// Helper to get start/end of day in IST, converted back to UTC for DB query
const getISTDayRangeInUTC = (date: Date) => {
    const utcTime = date.getTime()
    const istTime = utcTime + (330 * 60 * 1000)
    const istDate = new Date(istTime)
    
    const y = istDate.getUTCFullYear()
    const m = istDate.getUTCMonth()
    const d = istDate.getUTCDate()
    
    const istStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
    const istEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999))
    
    return {
      start: new Date(istStart.getTime() - (330 * 60 * 1000)),
      end: new Date(istEnd.getTime() - (330 * 60 * 1000))
    }
}

// Lazy-load pool to avoid database connection during build time
const getPoolInstance = () => getPool()

// DataLoader for batching user queries
const createUserLoader = () => new DataLoader(async (employeeIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM users WHERE employee_id = ANY($1)',
    [employeeIds]
  )

  const userMap = new Map(result.rows.map((user: any) => [user.employee_id, user]))
  return employeeIds.map(id => userMap.get(id) || null)
})

// DataLoader for batching task queries
const createTaskLoader = () => new DataLoader(async (taskIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM tasks WHERE task_id = ANY($1) AND deleted_at IS NULL',
    [taskIds]
  )

  const taskMap = new Map(result.rows.map((task: any) => [task.task_id, task]))
  return taskIds.map(id => taskMap.get(id) || null)
})

// DataLoader for batching bug queries
const createBugLoader = () => new DataLoader(async (bugIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM bugs WHERE bug_id = ANY($1) AND deleted_at IS NULL',
    [bugIds]
  )

  const bugMap = new Map(result.rows.map((bug: any) => [bug.bug_id, bug]))
  return bugIds.map(id => bugMap.get(id) || null)
})

// DataLoader for batching project queries
const createProjectLoader = () => new DataLoader(async (projectIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM projects WHERE project_id = ANY($1) AND deleted_at IS NULL',
    [projectIds]
  )

  const projectMap = new Map(result.rows.map((project: any) => [project.project_id, project]))
  return projectIds.map(id => projectMap.get(id) || null)
})

// DataLoader for batching subtask queries
// Note: The subtasks table was renamed to task_checklists in migration 020
const createSubtaskLoader = () => new DataLoader(async (parentTaskIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM task_checklists WHERE parent_task_id = ANY($1) AND deleted_at IS NULL',
    [parentTaskIds]
  )

  const subtaskMap = new Map<string, any[]>()
  result.rows.forEach((subtask: any) => {
    if (!subtaskMap.has(subtask.parent_task_id)) {
      subtaskMap.set(subtask.parent_task_id, [])
    }
    subtaskMap.get(subtask.parent_task_id)!.push(subtask)
  })

  return parentTaskIds.map(id => subtaskMap.get(id) || [])
})

// DataLoader for batching bug subtask queries
// Note: The bug_subtasks table was renamed to development_checklists in migration 020
const createBugSubtaskLoader = () => new DataLoader(async (parentBugIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM development_checklists WHERE parent_bug_id = ANY($1) AND deleted_at IS NULL',
    [parentBugIds]
  )

  const subtaskMap = new Map<string, any[]>()
  result.rows.forEach((subtask: any) => {
    if (!subtaskMap.has(subtask.parent_bug_id)) {
      subtaskMap.set(subtask.parent_bug_id, [])
    }
    subtaskMap.get(subtask.parent_bug_id)!.push(subtask)
  })

  return parentBugIds.map(id => subtaskMap.get(id) || [])
})

// DataLoader for batching feed post queries
const createFeedPostLoader = () => new DataLoader(async (postIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM feed_posts WHERE post_id = ANY($1) AND deleted_at IS NULL',
    [postIds]
  )

  const postMap = new Map(result.rows.map((post: any) => [post.post_id, post]))
  return postIds.map(id => postMap.get(id) || null)
})

// DataLoader for batching feed topic queries
const createFeedTopicLoader = () => new DataLoader(async (topicIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM feed_topics WHERE id = ANY($1) AND deleted_at IS NULL',
    [topicIds]
  )

  const topicMap = new Map(result.rows.map((topic: any) => [topic.id, topic]))
  return topicIds.map(id => topicMap.get(id) || null)
})

// DataLoader for batching feed comments by post ID
const createFeedCommentsLoader = () => new DataLoader(async (postIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM feed_comments WHERE post_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC',
    [postIds]
  )

  const commentMap = new Map<string, any[]>()
  result.rows.forEach((comment: any) => {
    if (!commentMap.has(comment.post_id)) {
      commentMap.set(comment.post_id, [])
    }
    commentMap.get(comment.post_id)!.push(comment)
  })

  return postIds.map(id => commentMap.get(id) || [])
})

// DataLoader for batching feed reactions by post ID
const createFeedReactionsLoader = () => new DataLoader(async (postIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    'SELECT * FROM feed_reactions WHERE post_id = ANY($1) AND deleted_at IS NULL',
    [postIds]
  )

  const reactionMap = new Map<string, any[]>()
  result.rows.forEach((reaction: any) => {
    if (!reactionMap.has(reaction.post_id)) {
      reactionMap.set(reaction.post_id, [])
    }
    reactionMap.get(reaction.post_id)!.push(reaction)
  })

  return postIds.map(id => reactionMap.get(id) || [])
})

// DataLoader for batching feed post topics
const createFeedPostTopicsLoader = () => new DataLoader(async (postIds: readonly string[]) => {
  const result = await getPoolInstance().query(
    `SELECT fpt.post_id, ft.*
     FROM feed_post_topics fpt
     JOIN feed_topics ft ON fpt.topic_id = ft.id
     WHERE fpt.post_id = ANY($1) AND ft.deleted_at IS NULL`,
    [postIds]
  )

  const topicMap = new Map<string, any[]>()
  result.rows.forEach((row: any) => {
    if (!topicMap.has(row.post_id)) {
      topicMap.set(row.post_id, [])
    }
    topicMap.get(row.post_id)!.push(row)
  })

  return postIds.map(id => topicMap.get(id) || [])
})

export const createContext = () => {
  const userLoaderInstance = createUserLoader()
  return {
    loaders: {
      user: userLoaderInstance,
      userLoader: userLoaderInstance,
      task: createTaskLoader(),
      bug: createBugLoader(),
      projectLoader: createProjectLoader(),
      subtasks: createSubtaskLoader(),
      bugSubtasks: createBugSubtaskLoader(),
      feedPost: createFeedPostLoader(),
      feedTopic: createFeedTopicLoader(),
      feedComments: createFeedCommentsLoader(),
      feedReactions: createFeedReactionsLoader(),
      feedPostTopics: createFeedPostTopicsLoader(),
      notificationLoader: createNotificationLoader()
    }
  }
}


// ── Auth guards ────────────────────────────────────────────────────────────
// context.user is populated from the JWT by the GraphQL route. These enforce
// that a caller is authenticated / authorized before a resolver runs.
function requireUser(context: any): { employeeId: string; role: string; name: string } {
  if (!context || !context.user || !context.user.employeeId) {
    throw new Error('UNAUTHENTICATED: You must be signed in.')
  }
  return context.user
}

function requireRole(context: any, roles: string[]): { employeeId: string; role: string; name: string } {
  const user = requireUser(context)
  if (!roles.includes(user.role)) {
    throw new Error('FORBIDDEN: You do not have permission to perform this action.')
  }
  return user
}

export const resolvers = {
  Query: {

    // Tasks
    // These list resolvers previously took only (_, filters) — they never
    // received context, so they were reachable without a session and returned
    // every row in the deployment. GraphQL is exempt from the middleware auth
    // gate (it carries the public `login` mutation), so authorization has to be
    // enforced here.
    tasks: async (_: any, filters: any, context: any) => {
      requireUser(context)
      const { startTime } = logResolverStart('tasks', filters)

      try {
        // ✅ FIXED: Removed DISTINCT as it conflicts with custom ORDER BY and isn't needed (no joins)
        let query = 'SELECT * FROM tasks WHERE deleted_at IS NULL'
        const params: any[] = []
        let paramIndex = 1

        if (filters.assignedTo && filters.assignedTo.length > 0) {
          // assigned_to and support are JSONB arrays
          query += ` AND (
            assigned_to::jsonb ?| $${paramIndex} OR
            (CASE WHEN support IS NULL OR support::text = 'null' OR support::text = '' THEN '[]'::jsonb ELSE support::jsonb END) ?| $${paramIndex}
          )`
          params.push(filters.assignedTo)
          paramIndex++
        }
        if (filters.assignedBy && filters.assignedBy.length > 0) {
          query += ` AND assigned_by = ANY($${paramIndex++})`
          params.push(filters.assignedBy)
        }
        if (filters.status && filters.status.length > 0) {
          query += ` AND status = ANY($${paramIndex++})`
          params.push(filters.status)
        }
        if (filters.priority && filters.priority.length > 0) {
          query += ` AND priority = ANY($${paramIndex++})`
          params.push(filters.priority)
        }
        if (filters.projectId) {
          query += ` AND project_id = $${paramIndex++}`
          params.push(filters.projectId)
        }
        if (filters.projectIds && filters.projectIds.length > 0) {
          query += ` AND project_id = ANY($${paramIndex++})`
          params.push(filters.projectIds)
        }
        if (filters.subprojectId) {
          query += ` AND subproject_id = $${paramIndex++}`
          params.push(filters.subprojectId)
        }

        // ✅ FIXED: Custom sorting - completed/cancelled items at bottom
        query += ` ORDER BY 
          CASE 
            WHEN status IN ('Done', 'Completed', 'Cancelled', 'Cancel') THEN 1 
            ELSE 0 
          END,
          updated_at DESC, task_id DESC`

        // Add pagination
        if (filters.limit) {
          query += ` LIMIT $${paramIndex++}`
          params.push(filters.limit)
        }
        if (filters.offset) {
          query += ` OFFSET $${paramIndex++}`
          params.push(filters.offset)
        }

        const dbStart = logDatabaseQuery(query, params, 'tasks')
        const result = await getPoolInstance().query(query, params)
        logDatabaseResult(result.rows.length, dbStart.startTime, 'tasks')

        logResolverSuccess('tasks', result.rows, startTime)
        return result.rows
      } catch (error) {
        logResolverError('tasks', error, startTime)
        // Return empty array on error to prevent crash
        return []
      }
    },

    task: async (_: any, { taskId }: any, { loaders, user }: any) => {
      const { startTime } = logResolverStart('task', { taskId })

      try {
        const result = await loaders.task.load(taskId)

        // Project-access gate (option F)
        if (user && result && !['admin', 'top_management'].includes(user.role)) {
          const employeeId = user.employeeId
          const isAssignee = Array.isArray(result.assigned_to)
            ? result.assigned_to.includes(employeeId)
            : result.assigned_to === employeeId
          const isAssigner = result.assigned_by === employeeId
          const isSupporter = Array.isArray(result.support) && result.support.includes(employeeId)
          let isProjectMember = false
          if (result.project_id) {
            const projRes = await getPoolInstance().query(
              'SELECT 1 FROM project_users WHERE employee_id = $1 AND project_id = $2 LIMIT 1',
              [employeeId, result.project_id]
            )
            isProjectMember = (projRes.rowCount || 0) > 0
          }
          if (!isAssignee && !isAssigner && !isSupporter && !isProjectMember) {
            throw new Error('FORBIDDEN: no access to this task')
          }
        }

        logResolverSuccess('task', result, startTime)
        return result
      } catch (error) {
        logResolverError('task', error, startTime)
        throw error
      }
    },

    // Bugs
    bugs: async (_: any, filters: any, context: any) => {
      requireUser(context)
      const { startTime } = logResolverStart('bugs', filters)
      try {
        let query = 'SELECT * FROM bugs WHERE deleted_at IS NULL'
        const params: any[] = []
        let paramIndex = 1

        if (filters.assignedTo && filters.assignedTo.length > 0) {
          query += ` AND assigned_to = ANY($${paramIndex++})`
          params.push(filters.assignedTo)
        }
        if (filters.reportedBy && filters.reportedBy.length > 0) {
          query += ` AND reported_by = ANY($${paramIndex++})`
          params.push(filters.reportedBy)
        }
        if (filters.status && filters.status.length > 0) {
          query += ` AND status = ANY($${paramIndex++})`
          params.push(filters.status)
        }
        if (filters.severity && filters.severity.length > 0) {
          query += ` AND severity = ANY($${paramIndex++})`
          params.push(filters.severity)
        }
        if (filters.category && filters.category.length > 0) {
          query += ` AND category = ANY($${paramIndex++})`
          params.push(filters.category)
        }
        if (filters.type && filters.type.length > 0) {
          query += ` AND type = ANY($${paramIndex++})`
          params.push(filters.type)
        }
        if (filters.projectId) {
          query += ` AND project_id = $${paramIndex++}`
          params.push(filters.projectId)
        }
        if (filters.projectIds && filters.projectIds.length > 0) {
          query += ` AND project_id = ANY($${paramIndex++})`
          params.push(filters.projectIds)
        }
        if (filters.subprojectId) {
          query += ` AND subproject_id = $${paramIndex++}`
          params.push(filters.subprojectId)
        }

        // ✅ Custom sorting - resolved/closed items at bottom
        query += ` ORDER BY 
          CASE 
            WHEN status IN ('Resolved', 'Closed') THEN 1 
            ELSE 0 
          END,
          updated_at DESC`

        if (filters.limit) {
          query += ` LIMIT $${paramIndex++}`
          params.push(filters.limit)
        }
        if (filters.offset) {
          query += ` OFFSET $${paramIndex++}`
          params.push(filters.offset)
        }

        const dbStart = logDatabaseQuery(query, params, 'bugs')
        const result = await getPoolInstance().query(query, params)
        logDatabaseResult(result.rows.length, dbStart.startTime, 'bugs')

        logResolverSuccess('bugs', result.rows, startTime)
        return result.rows
      } catch (error) {
        logResolverError('bugs', error, startTime)
        return [] // Return empty array on error
      }
    },

    bug: async (_: any, { bugId }: any, { loaders, user }: any) => {
      const { startTime } = logResolverStart('bug', { bugId })
      try {
        const result = await loaders.bug.load(bugId)

        // Project-access gate (option F)
        if (user && result && !['admin', 'top_management'].includes(user.role)) {
          const employeeId = user.employeeId
          const isReporter = result.reported_by === employeeId
          const isAssignee = result.assigned_to === employeeId
          let isProjectMember = false
          if (result.project_id) {
            const projRes = await getPoolInstance().query(
              'SELECT 1 FROM project_users WHERE employee_id = $1 AND project_id = $2 LIMIT 1',
              [employeeId, result.project_id]
            )
            isProjectMember = (projRes.rowCount || 0) > 0
          }
          if (!isReporter && !isAssignee && !isProjectMember) {
            throw new Error('FORBIDDEN: no access to this bug')
          }
        }

        logResolverSuccess('bug', result, startTime)
        return result
      } catch (error) {
        logResolverError('bug', error, startTime)
        return null
      }
    },



    users: async (_: any, __: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      const result = await getPoolInstance().query(
        "SELECT * FROM users ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, name ASC"
      )
      return result.rows || []
    },

    projects: async (_: any, __: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      const result = await getPoolInstance().query('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY project_name ASC')
      let projects = result.rows || []

      // Filter by user assignment for non-admin/non-top_management users (Commented out to expose all projects)
      /*
      if (user.role !== 'admin' && user.role !== 'top_management') {
        const assignedResult = await getPoolInstance().query(
          'SELECT project_id FROM project_users WHERE employee_id = $1',
          [user.employeeId]
        )
        const assignedSet = new Set(assignedResult.rows.map((r: any) => r.project_id))
        projects = projects.filter((p: any) =>
          assignedSet.has(p.project_id) ||
          (p.parent_project_id && assignedSet.has(p.parent_project_id))
        )
      }
      */

      return projects
    },

    projectUsers: async (_: any, { projectId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      const result = await getPoolInstance().query(
        'SELECT * FROM project_users WHERE project_id = $1 ORDER BY assigned_at ASC',
        [projectId]
      )
      return result.rows || []
    },

    user: async (_: any, { employeeId }: any) => {
      // The schema arg is `employeeId` and the users PK is `employee_id`
      // (there is no `id` column) — the previous version always errored.
      const result = await getPoolInstance().query('SELECT * FROM users WHERE employee_id = $1', [employeeId])
      return result.rows[0] || null
    },

    me: async (_: any, __: any, { user }: any) => {
      if (!user || !user.employeeId) return null
      const result = await getPoolInstance().query('SELECT * FROM users WHERE employee_id = $1', [user.employeeId])
      return result.rows[0] || null
    },

    // Attendance & Leaves
    attendance: async (_: any, { date, userId }: any, { user }: any) => {
        if (!user) throw new Error('Unauthorized')
  
        const targetUserId = userId || user.employeeId
        const now = new Date()
        const { start, end } = getISTDayRangeInUTC(now)
        const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
        let targetDate = date || todayIST
        const isToday = targetDate === todayIST

        let record: any = undefined

        // 1. Only for TODAY, find an active session by sign_in_time. This handles
        // the UTC/IST date mismatch, but must NOT be used when a past date is
        // requested (it would return today's record mislabelled with that date).
        if (isToday) {
          const activeResult = await getPoolInstance().query(
            `SELECT * FROM attendance_logs
             WHERE employee_id = $1
             AND sign_in_time >= $2
             AND sign_in_time <= $3
             LIMIT 1`,
            [targetUserId, start, end]
          )
          record = activeResult.rows[0]
        }

        // 2. Fallback to exact date matching if no active session found
        if (!record) {
          const recordResult = await getPoolInstance().query(
            'SELECT * FROM attendance_logs WHERE employee_id = $1 AND date = $2',
            [targetUserId, targetDate]
          )
          record = recordResult.rows[0]
        }

      // Return null if no attendance record exists (fixes the 05:30 AM placeholder issue)
      if (!record) return null

      let workingHours = 0
      if (record.sign_in_time && record.sign_out_time) {
        const start = new Date(record.sign_in_time).getTime()
        const end = new Date(record.sign_out_time).getTime()
        workingHours = (end - start) / (1000 * 60 * 60)
      }

      return {
        id: record.id,
        employeeId: record.employee_id || targetUserId,
        date: targetDate,
        signInTime: record.sign_in_time,
        signOutTime: record.sign_out_time,
        signInLocation: record.sign_in_location,
        signOutLocation: record.sign_out_location,
        status: record.status || 'ABSENT',
        workHours: workingHours,
        isManualEntry: record.is_manual_entry || false,
        approvalStatus: record.approval_status,
        signOutUndoneAt: record.sign_out_undone_at,
        signOutUndoneBy: record.sign_out_undone_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      }
    },

    monthlyAttendance: async (_: any, { year, month, userId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const targetUserId = userId || user.employeeId
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]

      const recordsResult = await getPoolInstance().query(
        'SELECT * FROM attendance_logs WHERE employee_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC',
        [targetUserId, startDate, endDate]
      )
      const records = recordsResult.rows

      const attendance = records.map((record: any) => {
        let workingHours = 0
        if (record.sign_in_time && record.sign_out_time) {
          const start = new Date(record.sign_in_time).getTime()
          const end = new Date(record.sign_out_time).getTime()
          workingHours = (end - start) / (1000 * 60 * 60)
        }
        return {
          id: record.id,
          employeeId: record.employee_id || targetUserId,
          date: record.date,
          signInTime: record.sign_in_time,
          signOutTime: record.sign_out_time,
          status: record.status || 'ABSENT',
          workHours: workingHours,
          isManualEntry: record.is_manual_entry || false,
          approvalStatus: record.approval_status,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        }
      })

      // Always return an array (empty if no records)
      return attendance
    },

    homeDashboardData: async (_: any, { date }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      const { startTime } = logResolverStart('homeDashboardData', { date })

      try {
        const queryDate = date || format(new Date(), 'yyyy-MM-dd')

        // Fetch members on leave for today
        const leaveResult = await getPoolInstance().query(`
          SELECT la.*, u.employee_id, u.name, u.email, u.phone, u.department, u.role, u.status, u.created_at, u.updated_at
          FROM leave_applications la
          JOIN users u ON la.employee_id = u.employee_id
          WHERE la.status = 'Approved'
          AND la.from_date <= $1
          AND la.to_date >= $1
        `, [queryDate])

        // Fetch members on WFH for today
        const wfhResult = await getPoolInstance().query(`
          SELECT wa.*, u.employee_id, u.name, u.email, u.phone, u.department, u.role, u.status, u.created_at, u.updated_at
          FROM wfh_applications wa
          JOIN users u ON wa.employee_id = u.employee_id
          WHERE wa.status = 'Approved'
          AND wa.from_date <= $1
          AND wa.to_date >= $1
        `, [queryDate])

        // Fetch attendance for current user
        const attendanceResult = await getPoolInstance().query(`
          SELECT * FROM attendance_logs
          WHERE employee_id = $1 AND date = $2
        `, [user.employeeId, queryDate])

        const result = {
          userWorkHours: attendanceResult.rows[0]?.work_hours?.toString() || '0',
          membersOnLeave: leaveResult.rows.map((row: any) => ({
            user: {
              employeeId: row.employee_id,
              name: row.name,
              email: row.email,
              phone: row.phone,
              department: row.department,
              role: row.role,
              status: row.status,
              createdAt: row.created_at,
              updatedAt: row.updated_at
            },
            leaveType: row.leave_type,
            startDate: row.from_date,
            endDate: row.to_date,
            isHalfDay: row.is_half_day || false
          })),
          membersOnWFH: wfhResult.rows.map((row: any) => ({
            user: {
              employeeId: row.employee_id,
              name: row.name,
              email: row.email,
              phone: row.phone,
              department: row.department,
              role: row.role,
              status: row.status,
              createdAt: row.created_at,
              updatedAt: row.updated_at
            },
            // UserWFHStatus schema requires a non-null `date` and has `contactNumber`.
            date: row.from_date,
            contactNumber: row.phone || row.contact_number || null,
            startDate: row.from_date,
            endDate: row.to_date,
            reason: row.reason || ''
          })),
          attendance: attendanceResult.rows[0] || null
        }

        logResolverSuccess('homeDashboardData', result, startTime)
        return result
      } catch (error) {
        logResolverError('homeDashboardData', error, startTime)
        throw error
      }
    },

    adminDashboardData: async (_: any, __: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const today = format(new Date(), 'yyyy-MM-dd')

      const [
        usersOnlineResult,
        usersPresentResult,
        usersOnLeaveResult,
        usersWFHResult,
        pendingLeaveResult,
        pendingWFHResult,
        liveAttendanceResult
      ] = await Promise.all([
        // Users Online (signed in, not signed out)
        getPoolInstance().query(
          'SELECT COUNT(*) FROM attendance_logs WHERE date = $1 AND sign_in_time IS NOT NULL AND sign_out_time IS NULL',
          [today]
        ),
        // Users Present (signed in at least once)
        getPoolInstance().query(
          'SELECT COUNT(*) FROM attendance_logs WHERE date = $1 AND sign_in_time IS NOT NULL',
          [today]
        ),
        // Users On Leave (approved leave for today)
        getPoolInstance().query(
          'SELECT COUNT(*) FROM leave_applications WHERE status = $1 AND from_date <= $2 AND to_date >= $2',
          ['Approved', today]
        ),
        // Users WFH (approved WFH for today)
        getPoolInstance().query(
          'SELECT COUNT(*) FROM wfh_applications WHERE status = $1 AND from_date <= $2 AND to_date >= $2',
          ['Approved', today]
        ),
        // Pending Leave Requests
        getPoolInstance().query('SELECT COUNT(*) FROM leave_applications WHERE status = $1', ['Pending']),
        // Pending WFH Requests
        getPoolInstance().query('SELECT COUNT(*) FROM wfh_applications WHERE status = $1', ['Pending']),
        // Live Attendance Table
        getPoolInstance().query(`
          SELECT 
            u.employee_id, u.name, u.department, u.role,
            al.sign_in_time, al.sign_out_time, al.status as attendance_status,
            la.status as leave_status,
            wa.status as wfh_status
          FROM users u
          LEFT JOIN attendance_logs al ON u.employee_id = al.employee_id AND al.date = $1
          LEFT JOIN leave_applications la ON u.employee_id = la.employee_id AND la.status = 'Approved' AND la.from_date <= $1 AND la.to_date >= $1
          LEFT JOIN wfh_applications wa ON u.employee_id = wa.employee_id AND wa.status = 'Approved' AND wa.from_date <= $1 AND wa.to_date >= $1
          WHERE u.status = 'active'
          ORDER BY u.name ASC
        `, [today])
      ])

      const usersOnline = parseInt(usersOnlineResult.rows[0].count)
      const usersPresent = parseInt(usersPresentResult.rows[0].count)
      const usersOnLeave = parseInt(usersOnLeaveResult.rows[0].count)
      const usersWFH = parseInt(usersWFHResult.rows[0].count)
      const pendingLeaveRequests = parseInt(pendingLeaveResult.rows[0].count)
      const pendingWFHRequests = parseInt(pendingWFHResult.rows[0].count)

      // Calculate absent: Total Active Users - (Present + On Leave + WFH)
      // Note: This is an approximation. Ideally we should count distinct users who are present OR on leave OR on WFH.
      // But for now, assuming no overlap (e.g. present AND on leave), this is fine.
      const totalUsersResult = await getPoolInstance().query("SELECT COUNT(*) FROM users WHERE status = 'active'")
      const totalUsers = parseInt(totalUsersResult.rows[0].count)
      const usersAbsent = totalUsers - (usersPresent + usersOnLeave + usersWFH)

      const liveAttendance = liveAttendanceResult.rows.map((row: any) => {
        let status = 'ABSENT'

        if (row.sign_in_time && !row.sign_out_time) {
          status = 'ONLINE'
        } else if (row.attendance_status) {
          status = row.attendance_status // e.g. 'full_day', 'half_day'
          // If signed out, maybe show 'OFFLINE' or 'PRESENT'? 
          // Usually 'full_day' implies present.
        } else if (row.leave_status === 'Approved') {
          status = 'ON_LEAVE'
        } else if (row.wfh_status === 'Approved') {
          status = 'WFH'
        }

        return {
          userId: row.employee_id,
          userName: row.name,
          department: row.department,
          role: row.role,
          status: status,
          signInTime: row.sign_in_time ? format(new Date(row.sign_in_time), 'yyyy-MM-dd HH:mm:ss') : null,
          signOutTime: row.sign_out_time ? format(new Date(row.sign_out_time), 'yyyy-MM-dd HH:mm:ss') : null,
          location: null
        }
      })

      return {
        usersOnline,
        usersPresent,
        usersAbsent: usersAbsent > 0 ? usersAbsent : 0,
        usersOnLeave,
        usersWFH,
        pendingLeaveRequests,
        pendingWFHRequests,
        liveAttendance
      }
    },

    pendingAttendanceRequests: async (_: any, __: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      // TODO: Add admin check

      const result = await getPoolInstance().query(
        `SELECT ar.*, u.name as user_name, u.department, u.role
         FROM attendance_requests ar
         JOIN users u ON ar.employee_id = u.employee_id
         WHERE ar.status = 'PENDING'
         ORDER BY ar.created_at DESC`
      )

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.employee_id,
        attendanceDate: format(new Date(row.attendance_date), 'yyyy-MM-dd'),
        requestType: row.request_type,
        originalTime: row.original_time ? format(new Date(row.original_time), 'yyyy-MM-dd HH:mm:ss') : null,
        newTime: format(new Date(row.new_time), 'yyyy-MM-dd HH:mm:ss'),
        reason: row.reason,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at ? format(new Date(row.reviewed_at), 'yyyy-MM-dd HH:mm:ss') : null,
        createdAt: format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss'),
        updatedAt: format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm:ss'),
        user: {
          employeeId: row.employee_id,
          name: row.user_name,
          department: row.department,
          role: row.role
        }
      }))
    },

    attendanceCalendar: async (_: any, args: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const {
        startDate,
        endDate,
        department,
        teamMembers,
        search,
        page = 1,
        limit = 20
      } = args

      const offset = (page - 1) * limit

      // Build employee filter query
      let employeeFilter = 'WHERE u.status = $1'
      const params: any[] = ['active']
      let paramIndex = 2

      if (department) {
        employeeFilter += ` AND u.department = $${paramIndex}`
        params.push(department)
        paramIndex++
      }

      if (teamMembers && teamMembers.length > 0) {
        employeeFilter += ` AND u.employee_id = ANY($${paramIndex}::text[])`
        params.push(teamMembers)
        paramIndex++
      }

      if (search) {
        employeeFilter += ` AND (u.name ILIKE $${paramIndex} OR u.employee_id ILIKE $${paramIndex})`
        params.push(`%${search}%`)
        paramIndex++
      }

      // Get total count
      const countResult = await getPoolInstance().query(
        `SELECT COUNT(*) as total FROM users u ${employeeFilter}`,
        params
      )
      const total = parseInt(countResult.rows[0].total)

      // Get employees with pagination
      const employeesResult = await getPoolInstance().query(
        `SELECT employee_id, name, department, role
         FROM users u
         ${employeeFilter}
         ORDER BY name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      )

      const employees = employeesResult.rows.map((row: any) => ({
        employeeId: row.employee_id,
        name: row.name,
        department: row.department,
        role: row.role
      }))

      // Get all attendance records for the date range and employees
      const employeeIds = employees.map((e: any) => e.employeeId)

      if (employeeIds.length === 0) {
        return {
          employees: [],
          records: [],
          pagination: {
            total: 0,
            page,
            limit,
            hasMore: false
          }
        }
      }

      // Generate date series
      const dateSeriesQuery = `
        SELECT generate_series(
          $1::date,
          $2::date,
          '1 day'::interval
        )::date as date
      `

      const datesResult = await getPoolInstance().query(dateSeriesQuery, [startDate, endDate])
      const dates = datesResult.rows.map((row: any) => format(new Date(row.date), 'yyyy-MM-dd'))

      // Fetch all attendance data in one query
      const attendanceQuery = `
        SELECT 
          u.employee_id,
          d.date,
          al.sign_in_time,
          al.sign_out_time,
          al.work_hours,
          al.sign_in_location,
          al.is_manual_entry,
          al.approval_status,
          la.leave_type,
          la.is_half_day,
          wfh.wfh_type,
          CASE
            WHEN al.sign_in_time IS NOT NULL AND al.sign_out_time IS NULL THEN 'ONLINE'
            WHEN al.sign_in_time IS NOT NULL AND al.sign_out_time IS NOT NULL THEN 
              CASE WHEN COALESCE(la.is_half_day, FALSE) = TRUE THEN 'HALF_DAY' ELSE 'PRESENT' END
            WHEN la.status = 'Approved' THEN 'ON_LEAVE'
            WHEN wfh.status = 'Approved' THEN 'WFH'
            WHEN d.date > CURRENT_DATE THEN NULL
            ELSE 'ABSENT'
          END as status,
          CASE 
            WHEN al.is_manual_entry = TRUE OR al.approval_status = 'approved' THEN TRUE
            ELSE FALSE
          END as has_correction
        FROM (SELECT unnest($3::text[]) as employee_id) u
        CROSS JOIN (${dateSeriesQuery}) d
        LEFT JOIN attendance_logs al ON al.employee_id = u.employee_id 
          AND al.date::date = d.date
        LEFT JOIN leave_applications la ON la.employee_id = u.employee_id
          AND d.date BETWEEN la.from_date::date AND la.to_date::date
          AND la.status = 'Approved'
        LEFT JOIN wfh_applications wfh ON wfh.employee_id = u.employee_id
          AND d.date BETWEEN wfh.from_date::date AND wfh.to_date::date
          AND wfh.status = 'Approved'
        ORDER BY u.employee_id, d.date
      `

      const recordsResult = await getPoolInstance().query(
        attendanceQuery,
        [startDate, endDate, employeeIds]
      )

      const records = recordsResult.rows.map((row: any) => ({
        employeeId: row.employee_id,
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        status: row.status,
        signInTime: row.sign_in_time ? format(new Date(row.sign_in_time), 'yyyy-MM-dd HH:mm:ss') : null,
        signOutTime: row.sign_out_time ? format(new Date(row.sign_out_time), 'yyyy-MM-dd HH:mm:ss') : null,
        workHours: row.work_hours || null,
        location: row.sign_in_location || null,
        leaveType: row.leave_type || null,
        wfhType: row.wfh_type || null,
        hasCorrection: row.has_correction || false
      }))

      return {
        employees,
        records,
        pagination: {
          total,
          page,
          limit,
          hasMore: offset + employees.length < total
        }
      }
    },

    settings: async (_: any, { activeOnly }: any) => {
      try {
        let query = 'SELECT * FROM settings'
        const params: any[] = []

        if (activeOnly) {
          query += ' WHERE is_active = $1'
          params.push(true)
        }

        query += ' ORDER BY key ASC'

        const result = await getPoolInstance().query(query, params)
        return result.rows
      } catch (error) {
        console.error('Error fetching settings:', error)
        return []
      }
    },

    setting: async (_: any, { key }: any) => {
      try {
        const result = await getPoolInstance().query(
          'SELECT * FROM settings WHERE key = $1',
          [key]
        )
        return result.rows[0] || null
      } catch (error) {
        console.error(`Error fetching setting ${key}:`, error)
        return null
      }
    },

    dashboard: async (_: any, { employeeId, role }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      // Default empty dashboard structure
      const defaultDashboard = {
        tasks: [],
        bugs: [],
        users: [],
        settings: []
      }

      try {
        // TODO: Implement specific dashboard logic based on role if needed
        // For now, returning default structure to satisfy non-nullable schema
        // You can expand this to fetch actual data based on employeeId and role

        return defaultDashboard
      } catch (error) {
        console.error('Error in dashboard resolver:', error)
        return defaultDashboard
      }
    },

    // Feed Queries
    feedPosts: async (_: any, { topicId, status, search, limit = 20, offset = 0 }: any, context: any) => {
      const { startTime } = logResolverStart('feedPosts', { topicId, status, search, limit, offset })
      const { user } = context

      try {
        // ✅ FIXED: Use EXISTS instead of DISTINCT + JOIN for better performance with ORDER BY
        let sql = `
          SELECT fp.*
          FROM feed_posts fp
          WHERE fp.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM feed_post_topics fpt
            JOIN feed_topics ft ON fpt.topic_id = ft.id
            WHERE fpt.post_id = fp.post_id
            AND ft.deleted_at IS NULL
            AND (ft.is_personal = false OR ft.owner_user_id = $1)
        `
        const params: any[] = [user?.employeeId || '']

        if (topicId) {
          sql += ` AND fpt.topic_id = $${params.length + 1}`
          params.push(topicId)
        }

        sql += `)` // Close EXISTS

        if (status) {
          sql += ` AND fp.status = $${params.length + 1}`
          params.push(status)
        }

        if (search) {
          sql += ` AND (fp.content ILIKE $${params.length + 1} OR fp.og_title ILIKE $${params.length + 2})`
          params.push(`%${search}%`, `%${search}%`)
        }

        sql += ` ORDER BY fp.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
        params.push(limit, offset)

        const dbStart = logDatabaseQuery(sql, params, 'feedPosts')
        const postsResult = await getPoolInstance().query(sql, params)
        logDatabaseResult(postsResult.rows.length, dbStart.startTime, 'feedPosts')

        // Count total matching posts (Apply same EXISTS logic and add missing filters!)
        let countSql = `
          SELECT COUNT(fp.post_id)
          FROM feed_posts fp
          WHERE fp.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM feed_post_topics fpt
            JOIN feed_topics ft ON fpt.topic_id = ft.id
            WHERE fpt.post_id = fp.post_id
            AND ft.deleted_at IS NULL
            AND (ft.is_personal = false OR ft.owner_user_id = $1)
        `
        const countParams: any[] = [user?.employeeId || '']

        if (topicId) {
          countSql += ` AND fpt.topic_id = $${countParams.length + 1}`
          countParams.push(topicId)
        }

        countSql += `)` // Close EXISTS

        if (status) {
          countSql += ` AND fp.status = $${countParams.length + 1}`
          countParams.push(status)
        }

        if (search) {
          countSql += ` AND (fp.content ILIKE $${countParams.length + 1} OR fp.og_title ILIKE $${countParams.length + 2})`
          countParams.push(`%${search}%`, `%${search}%`)
        }

        const totalResult = await getPoolInstance().query(countSql, countParams)
        const total = parseInt(totalResult.rows[0].count)

        const result = {
          posts: postsResult.rows,
          total,
          hasMore: offset + postsResult.rows.length < total
        }

        logResolverSuccess('feedPosts', result, startTime)
        return result
      } catch (error) {
        logResolverError('feedPosts', error, startTime)
        throw error
      }
    },

    feedPost: async (_: any, { postId }: any, { loaders }: any) => {
      const { startTime } = logResolverStart('feedPost', { postId })

      try {
        const post = await loaders.feedPost.load(postId)
        logResolverSuccess('feedPost', post, startTime)
        return post
      } catch (error) {
        logResolverError('feedPost', error, startTime)
        throw error
      }
    },

    feedTopics: async (_: any, { includePersonal = true }: any, context: any) => {
      const { startTime } = logResolverStart('feedTopics', { includePersonal })
      const { user } = context

      if (!user) {
        logResolverError('feedTopics', new Error('Unauthorized'), startTime)
        throw new Error('Unauthorized')
      }

      try {
        let sql = 'SELECT * FROM feed_topics WHERE deleted_at IS NULL'
        const params: any[] = []

        if (!includePersonal) {
          // Only public topics (not personal and not saved)
          sql += ' AND is_personal = false AND is_saved = false'
        } else {
          // Include:
          // 1. Public topics (is_personal = false AND is_saved = false)
          // 2. User's personal topics (is_personal = true AND owner_user_id = current user)
          // 3. User's saved posts (is_saved = true AND owner_user_id = current user)
          sql += ' AND ((is_personal = false AND is_saved = false) OR owner_user_id = $1)'
          params.push(user.employeeId)
        }

        sql += ' ORDER BY display_order ASC'

        const dbStart = logDatabaseQuery(sql, params, 'feedTopics')
        const result = await getPoolInstance().query(sql, params)
        logDatabaseResult(result.rows.length, dbStart.startTime, 'feedTopics')

        logResolverSuccess('feedTopics', result.rows, startTime)
        return result.rows
      } catch (error) {
        logResolverError('feedTopics', error, startTime)
        throw error
      }
    },

    feedTopic: async (_: any, { id }: any, { loaders }: any) => {
      const { startTime } = logResolverStart('feedTopic', { id })

      try {
        const topic = await loaders.feedTopic.load(id)
        logResolverSuccess('feedTopic', topic, startTime)
        return topic
      } catch (error) {
        logResolverError('feedTopic', error, startTime)
        throw error
      }
    },

    feedComments: async (_: any, { postId }: any, { loaders }: any) => {
      const { startTime } = logResolverStart('feedComments', { postId })

      try {
        const comments = await loaders.feedComments.load(postId)
        logResolverSuccess('feedComments', comments, startTime)
        return comments
      } catch (error) {
        logResolverError('feedComments', error, startTime)
        throw error
      }
    },

    feedReactions: async (_: any, { postId }: any, { loaders }: any) => {
      const { startTime } = logResolverStart('feedReactions', { postId })

      try {
        const reactions = await loaders.feedReactions.load(postId)

        // Group by emoji
        const grouped: Record<string, any> = {}
        reactions.forEach((r: any) => {
          if (!grouped[r.emoji]) {
            grouped[r.emoji] = { emoji: r.emoji, userIds: [], count: 0 }
          }
          grouped[r.emoji].userIds.push(r.user_id)
          grouped[r.emoji].count++
        })

        const result = Object.values(grouped)
        logResolverSuccess('feedReactions', result, startTime)
        return result
      } catch (error) {
        logResolverError('feedReactions', error, startTime)
        throw error
      }
    },

    // Mention Queries
    ...mentionQueries,

    // Notification Queries
    ...notificationQueries,

    // Requirement Queries
    ...requirementQueries,

    // Founder Start Queries
    ...founderQueries
  },

  // Field resolvers for User
  User: {
    // Map snake_case database columns to camelCase GraphQL fields
    // Also handle camelCase fields if the object was constructed manually (e.g. in homeDashboardData)
    // Provide fallback defaults for non-nullable fields to prevent null errors
    employeeId: (user: any) => user.employee_id || user.employeeId,
    // Only ever true for the requesting user, so it never reveals who the founder is.
    isFounder: async (user: any, _: any, context: any) => {
      const employeeId = user.employee_id || user.employeeId
      if (!employeeId || employeeId !== context?.user?.employeeId) return false
      return isFounderEmployee(employeeId)
    },
    name: (user: any) => user.name,
    email: (user: any) => user.email,
    phone: (user: any) => user.phone,
    department: (user: any) => user.department,
    role: (user: any) => user.role || 'employee', // Fallback to 'employee' if not provided
    status: (user: any) => user.status || 'active', // Fallback to 'active' if not provided
    managerEmail: (user: any) => user.manager_email || user.managerEmail,
    isTodayTask: (user: any) => user.is_today_task || user.isTodayTask,
    warningCount: (user: any) => user.warning_count || user.warningCount,
    createdAt: (user: any) => user.created_at || user.createdAt || getCurrentDateTime(), // Fallback to current time
    updatedAt: (user: any) => user.updated_at || user.updatedAt || getCurrentDateTime(), // Fallback to current time
    tabPermissions: (user: any) => user.tab_permissions || user.tabPermissions,

    leavesTakenYTD: async (user: any) => {
      const employeeId = user.employee_id || user.employeeId
      if (!employeeId) return 0
      const currentYear = new Date().getFullYear()
      const result = await getPoolInstance().query(
        `SELECT COALESCE(SUM((to_date - from_date) + 1), 0) as total_days
         FROM leave_applications
         WHERE employee_id = $1
         AND status = 'Approved'
         AND EXTRACT(YEAR FROM from_date) = $2`,
        [employeeId, currentYear]
      )
      return parseFloat(result.rows[0]?.total_days || 0)
    },

    totalWFHApproved: async (user: any) => {
      const employeeId = user.employee_id || user.employeeId
      if (!employeeId) return 0
      const currentYear = new Date().getFullYear()
      const result = await getPoolInstance().query(
        `SELECT COALESCE(SUM((to_date - from_date) + 1), 0) as total_days
         FROM wfh_applications
         WHERE employee_id = $1
         AND status = 'Approved'
         AND EXTRACT(YEAR FROM from_date) = $2`,
        [employeeId, currentYear]
      )
      return parseInt(result.rows[0]?.total_days || 0)
    },

    tasks: async (user: any, _: any, { loaders }: any) => {
      const employeeId = user.employee_id || user.employeeId
      if (!employeeId) return []
      // FIXED: assigned_to and support are JSONB arrays. Fetch if employeeId is in either.
      const result = await getPoolInstance().query(
        `SELECT * FROM tasks
         WHERE deleted_at IS NULL
         AND (EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(assigned_to) AS elem
           WHERE elem = $1
         ) OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(
             CASE WHEN support IS NULL OR support::text = 'null' OR support::text = '' THEN '[]'::jsonb ELSE support::jsonb END
           ) AS elem
           WHERE elem = $1
         ))`,
        [employeeId]
      )
      return result.rows
    },

    bugs: async (user: any, _: any, { loaders }: any) => {
      const employeeId = user.employee_id || user.employeeId
      if (!employeeId) return []
      const result = await getPoolInstance().query(
        'SELECT * FROM bugs WHERE assigned_to = $1 AND deleted_at IS NULL',
        [employeeId]
      )
      return result.rows
    }
  },

  Attendance: {
    id: (att: any) => att.id,
    employeeId: (att: any) => att.employeeId || att.employee_id,
    signInTime: (att: any) => {
      const t = att.signInTime || att.sign_in_time;
      return t ? new Date(t).getTime().toString() : null;
    },
    signOutTime: (att: any) => {
      const t = att.signOutTime || att.sign_out_time;
      return t ? new Date(t).getTime().toString() : null;
    },
    workHours: (att: any) => att.workHours || att.work_hours,
    date: (att: any) => {
      // Return date string YYYY-MM-DD
      if (att.date instanceof Date) return att.date.toISOString().split('T')[0]
      return att.date
    },
    status: (att: any) => att.status,
    isManualEntry: (att: any) => att.isManualEntry || att.is_manual_entry,
    approvalStatus: (att: any) => att.approvalStatus || att.approval_status,
    createdAt: (att: any) => att.createdAt || att.created_at,
    updatedAt: (att: any) => att.updatedAt || att.updated_at,
    user: async (att: any, _: any, { loaders }: any) => {
      return loaders.user.load(att.employeeId || att.employee_id)
    }
  },

  // Field resolvers for Task
  Task: {
    // Map snake_case database columns to camelCase GraphQL fields
    // Note: GraphQL queries request these fields, so we must provide resolvers
    id: (task: any) => task.internal_id,
    taskId: (task: any) => task.task_id,
    selectType: (task: any) => task.select_type,
    recursiveType: (task: any) => task.recursive_type,
    name: (task: any) => task.name,
    description: (task: any) => task.description,
    assignedTo: (task: any) => {
      // ✅ FIXED: assignedTo is stored as JSONB array in PostgreSQL
      if (!task.assigned_to) return []
      if (Array.isArray(task.assigned_to)) return task.assigned_to

      // Handle string case (legacy data or parsing issue)
      if (typeof task.assigned_to === 'string') {
        try {
          const trimmed = task.assigned_to.trim()
          if (trimmed === '' || trimmed === 'null') return []
          const parsed = JSON.parse(trimmed)
          return Array.isArray(parsed) ? parsed : [parsed] // If single value, wrap in array
        } catch (error) {
          console.warn('Failed to parse assignedTo field for task:', task.task_id, 'Value:', task.assigned_to)
          return []
        }
      }

      return []
    },
    assignedBy: (task: any) => task.assigned_by,
    support: (task: any) => {
      // Support is stored as JSONB array in PostgreSQL, but might be a string
      if (!task.support) return []
      if (Array.isArray(task.support)) return task.support

      // Handle string case (legacy data or parsing issue)
      if (typeof task.support === 'string') {
        try {
          const trimmed = task.support.trim()
          if (trimmed === '' || trimmed === 'null') return []
          // Try to parse as JSON
          const parsed = JSON.parse(trimmed)
          return Array.isArray(parsed) ? parsed : []
        } catch (error) {
          // If JSON parsing fails, might be comma-separated string
          console.warn('Failed to parse support field for task:', task.task_id, 'Value:', task.support)
          return []
        }
      }

      return []
    },
    startDate: (task: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!task.start_date) return null
      if (task.start_date instanceof Date) return task.start_date.toISOString()
      if (typeof task.start_date === 'number') return new Date(task.start_date).toISOString()
      return task.start_date
    },
    endDate: (task: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!task.end_date) return null
      if (task.end_date instanceof Date) return task.end_date.toISOString()
      if (typeof task.end_date === 'number') return new Date(task.end_date).toISOString()
      return task.end_date
    },
    priority: (task: any) => task.priority,
    estimatedHours: (task: any) => task.estimated_hours,
    actualHours: (task: any) => task.actual_hours,
    dailyHours: (task: any) => {
      // daily_hours is JSONB in database, convert to JSON string for GraphQL
      if (!task.daily_hours) return null
      if (typeof task.daily_hours === 'string') return task.daily_hours
      return JSON.stringify(task.daily_hours)
    },
    status: (task: any) => task.status,
    remarks: (task: any) => task.remarks,
    difficulties: (task: any) => task.difficulties,
    relatedTasks: (task: any) => task.related_tasks,
    projectId: (task: any) => task.project_id,
    subprojectId: (task: any) => task.subproject_id,
    parentTaskId: (task: any) => task.parent_task_id,
    department: (task: any) => task.department,
    timerState: (task: any) => task.timer_state,
    timerStartTime: (task: any) => task.timer_start_time,
    timerPausedTime: (task: any) => task.timer_paused_time,
    timerTotalTime: (task: any) => task.timer_total_time,
    timerSessions: (task: any) => task.timer_sessions,
    deletedAt: (task: any) => task.deleted_at,
    deletedBy: (task: any) => task.deleted_by,
    createdAt: (task: any) => {
      if (!task.created_at) return null
      if (task.created_at instanceof Date) return task.created_at.toISOString()
      if (typeof task.created_at === 'number') return new Date(task.created_at).toISOString()
      return task.created_at
    },
    updatedAt: (task: any) => {
      if (!task.updated_at) return null
      if (task.updated_at instanceof Date) return task.updated_at.toISOString()
      if (typeof task.updated_at === 'number') return new Date(task.updated_at).toISOString()
      return task.updated_at
    },
    meetingLink: (task: any) => task.meeting_link,
    meetingReminder: (task: any) => task.meeting_reminder,
    startTime: (task: any) => task.start_time,
    dueTime: (task: any) => task.due_time,

    assignedToUser: async (task: any, _: any, { loaders }: any) => {
      // ✅ FIXED: assignedTo is now an array, return first user for backward compatibility
      const assignedToArray = Array.isArray(task.assigned_to) ? task.assigned_to : []
      if (assignedToArray.length === 0) return null

      try {
        return await loaders.user.load(assignedToArray[0])
      } catch (error) {
        console.error(`[Task.assignedToUser] Failed to load user ${assignedToArray[0]}:`, error)
        return null
      }
    },

    assignedToUsers: async (task: any, _: any, { loaders }: any) => {
      // ✅ NEW: Return all assigned users
      const assignedToArray = Array.isArray(task.assigned_to) ? task.assigned_to : []
      if (assignedToArray.length === 0) return []

      try {
        // loadMany can return Error objects in the array, filter them out
        const results = await loaders.user.loadMany(assignedToArray)
        return results.filter((result: any) => !(result instanceof Error))
      } catch (error) {
        console.error(`[Task.assignedToUsers] Failed to load users:`, error)
        return []
      }
    },

    assignedByUser: async (task: any, _: any, { loaders }: any) => {
      if (!task.assigned_by) return null

      try {
        return await loaders.user.load(task.assigned_by)
      } catch (error) {
        console.error(`[Task.assignedByUser] Failed to load user ${task.assigned_by}:`, error)
        return null
      }
    },

    supportUsers: async (task: any, _: any, { loaders }: any) => {
      if (!task.support) return []
      // Support is stored as JSONB array in PostgreSQL
      const supportIds = Array.isArray(task.support) ? task.support : []

      try {
        const results = await Promise.all(
          supportIds.map(async (id: string) => {
            try {
              return await loaders.user.load(id)
            } catch (error) {
              console.error(`[Task.supportUsers] Failed to load user ${id}:`, error)
              return null
            }
          })
        )
        return results.filter((user: any) => user !== null)
      } catch (error) {
        console.error(`[Task.supportUsers] Failed to load support users:`, error)
        return []
      }
    },

    subtasks: (task: any, _: any, { loaders }: any) => {
      return loaders.subtasks.load(task.task_id)
    },

    project: async (task: any, _: any, { loaders }: any) => {
      if (!task.project_id) return null
      try {
        return await loaders.projectLoader.load(task.project_id)
      } catch (error) {
        console.error(`[Task.project] Failed to load project ${task.project_id}:`, error)
        return null
      }
    }
  },

  // Field resolvers for SubTask
  SubTask: {
    // Map snake_case database columns to camelCase GraphQL fields
    id: (subtask: any) => subtask.id,
    subTaskId: (subtask: any) => `SUBTASK-${subtask.id}`, // ✅ FIXED: Generate subTaskId from id (no sub_task_id column in PostgreSQL)
    parentTaskId: (subtask: any) => subtask.parent_task_id,
    description: (subtask: any) => subtask.description,
    assignedTo: (subtask: any) => subtask.assigned_to,
    assignedBy: (subtask: any) => subtask.assigned_by || subtask.created_by || null, // ✅ FIXED: Column doesn't exist, fallback to created_by
    startDate: (subtask: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!subtask.start_date) return null
      if (subtask.start_date instanceof Date) return subtask.start_date.toISOString()
      if (typeof subtask.start_date === 'number') return new Date(subtask.start_date).toISOString()
      return subtask.start_date
    },
    endDate: (subtask: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!subtask.end_date) return null
      if (subtask.end_date instanceof Date) return subtask.end_date.toISOString()
      if (typeof subtask.end_date === 'number') return new Date(subtask.end_date).toISOString()
      return subtask.end_date
    },
    priority: (subtask: any) => subtask.priority || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    estimatedHours: (subtask: any) => subtask.estimated_hours || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    actualHours: (subtask: any) => subtask.actual_hours || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    status: (subtask: any) => subtask.status || 'Not Started', // ✅ FIXED: Provide default value
    remarks: (subtask: any) => subtask.remarks || null,
    deletedAt: (subtask: any) => subtask.deleted_at,
    deletedBy: (subtask: any) => subtask.deleted_by,
    createdAt: (subtask: any) => {
      if (!subtask.created_at) return getCurrentDateTime()
      if (subtask.created_at instanceof Date) return subtask.created_at.toISOString()
      if (typeof subtask.created_at === 'number') return new Date(subtask.created_at).toISOString()
      return subtask.created_at
    },
    updatedAt: (subtask: any) => {
      if (!subtask.updated_at) return getCurrentDateTime()
      if (subtask.updated_at instanceof Date) return subtask.updated_at.toISOString()
      if (typeof subtask.updated_at === 'number') return new Date(subtask.updated_at).toISOString()
      return subtask.updated_at
    },

    assignedToUser: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.assigned_to) return null

      try {
        return await loaders.user.load(subtask.assigned_to)
      } catch (error) {
        console.error(`[SubTask.assignedToUser] Failed to load user ${subtask.assigned_to}:`, error)
        return null
      }
    },

    assignedByUser: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.assigned_by) return null

      try {
        return await loaders.user.load(subtask.assigned_by)
      } catch (error) {
        console.error(`[SubTask.assignedByUser] Failed to load user ${subtask.assigned_by}:`, error)
        return null
      }
    },

    parentTask: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.parent_task_id) return null

      try {
        return await loaders.task.load(subtask.parent_task_id)
      } catch (error) {
        console.error(`[SubTask.parentTask] Failed to load task ${subtask.parent_task_id}:`, error)
        return null
      }
    }
  },

  // Field resolvers for Bug
  Bug: {
    // Map snake_case database columns to camelCase GraphQL fields
    id: (bug: any) => bug.id,
    bugId: (bug: any) => bug.bug_id,
    title: (bug: any) => bug.title,
    description: (bug: any) => bug.description,
    category: (bug: any) => bug.category,
    severity: (bug: any) => bug.severity,
    priority: (bug: any) => bug.priority,
    status: (bug: any) => bug.status,
    platform: (bug: any) => bug.platform,
    type: (bug: any) => bug.type,
    feature: (bug: any) => bug.feature,
    assignedTo: (bug: any) => bug.assigned_to,
    assignedBy: (bug: any) => bug.assigned_by,
    reportedBy: (bug: any) => bug.reported_by,
    reportedDate: (bug: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!bug.reported_date) return null
      if (bug.reported_date instanceof Date) return bug.reported_date.toISOString()
      if (typeof bug.reported_date === 'number') return new Date(bug.reported_date).toISOString()
      return bug.reported_date
    },
    resolvedDate: (bug: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!bug.resolved_date) return null
      if (bug.resolved_date instanceof Date) return bug.resolved_date.toISOString()
      if (typeof bug.resolved_date === 'number') return new Date(bug.resolved_date).toISOString()
      return bug.resolved_date
    },
    startDate: (bug: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!bug.start_date) return null
      if (bug.start_date instanceof Date) return bug.start_date.toISOString()
      if (typeof bug.start_date === 'number') return new Date(bug.start_date).toISOString()
      return bug.start_date
    },
    endDate: (bug: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!bug.end_date) return null
      if (bug.end_date instanceof Date) return bug.end_date.toISOString()
      if (typeof bug.end_date === 'number') return new Date(bug.end_date).toISOString()
      return bug.end_date
    },
    estimatedHours: (bug: any) => bug.estimated_hours,
    actualHours: (bug: any) => bug.actual_hours,
    remarks: (bug: any) => bug.remarks,
    projectId: (bug: any) => bug.project_id,
    subprojectId: (bug: any) => bug.subproject_id,
    relatedBugs: (bug: any) => bug.related_bugs,
    environment: (bug: any) => bug.environment,
    expectedBehavior: (bug: any) => bug.expected_behavior,
    actualBehavior: (bug: any) => bug.actual_behavior,
    serverLogs: (bug: any) => bug.server_logs,
    frontendLogs: (bug: any) => bug.frontend_logs,
    browserInfo: (bug: any) => bug.browser_info,
    deviceInfo: (bug: any) => bug.device_info,
    device: (bug: any) => bug.device || bug.device_info,
    developmentPrompt: (bug: any) => bug.development_prompt,
    bugType: (bug: any) => bug.bug_type,
    criticality: (bug: any) => bug.criticality,
    parentDevId: (bug: any) => bug.parent_dev_id,
    timerState: (bug: any) => bug.timer_state,
    timerStartTime: (bug: any) => bug.timer_start_time,
    timerPausedTime: (bug: any) => bug.timer_paused_time,
    timerTotalTime: (bug: any) => bug.timer_total_time,
    timerSessions: (bug: any) => bug.timer_sessions,
    deletedAt: (bug: any) => bug.deleted_at,
    deletedBy: (bug: any) => bug.deleted_by,
    createdAt: (bug: any) => {
      if (!bug.created_at) return null
      if (bug.created_at instanceof Date) return bug.created_at.toISOString()
      if (typeof bug.created_at === 'number') return new Date(bug.created_at).toISOString()
      return bug.created_at
    },
    updatedAt: (bug: any) => {
      if (!bug.updated_at) return null
      if (bug.updated_at instanceof Date) return bug.updated_at.toISOString()
      if (typeof bug.updated_at === 'number') return new Date(bug.updated_at).toISOString()
      return bug.updated_at
    },

    assignedToUser: async (bug: any, _: any, { loaders }: any) => {
      if (!bug.assigned_to) return null
      try {
        return await loaders.user.load(bug.assigned_to)
      } catch (error) {
        console.error(`[Bug.assignedToUser] Failed to load user ${bug.assigned_to}:`, error)
        return null
      }
    },

    assignedByUser: async (bug: any, _: any, { loaders }: any) => {
      if (!bug.assigned_by) return null
      try {
        return await loaders.user.load(bug.assigned_by)
      } catch (error) {
        console.error(`[Bug.assignedByUser] Failed to load user ${bug.assigned_by}:`, error)
        return null
      }
    },

    reportedByUser: async (bug: any, _: any, { loaders }: any) => {
      if (!bug.reported_by) return null
      try {
        return await loaders.user.load(bug.reported_by)
      } catch (error) {
        console.error(`[Bug.reportedByUser] Failed to load user ${bug.reported_by}:`, error)
        return null
      }
    },

    subtasks: (bug: any, _: any, { loaders }: any) => {
      return loaders.bugSubtasks.load(bug.bug_id)
    },

    attachments: (bug: any) => {
      if (!bug.attachments) return []
      // Attachments is stored as JSONB in PostgreSQL
      return Array.isArray(bug.attachments) ? bug.attachments : []
    },

    project: async (bug: any, _: any, { loaders }: any) => {
      if (!bug.project_id) return null
      try {
        return await loaders.projectLoader.load(bug.project_id)
      } catch (error) {
        console.error(`[Bug.project] Failed to load project ${bug.project_id}:`, error)
        return null
      }
    }
  },

  // Field resolvers for BugSubTask
  BugSubTask: {
    // Map snake_case database columns to camelCase GraphQL fields
    id: (subtask: any) => subtask.id,
    subTaskId: (subtask: any) => `BUGSUBTASK-${subtask.id}`, // ✅ FIXED: Generate subTaskId from id (no sub_task_id column in PostgreSQL)
    parentBugId: (subtask: any) => subtask.parent_bug_id,
    description: (subtask: any) => subtask.description,
    assignedTo: (subtask: any) => subtask.assigned_to,
    assignedBy: (subtask: any) => subtask.assigned_by || subtask.created_by || null, // ✅ FIXED: Column doesn't exist, fallback to created_by
    startDate: (subtask: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!subtask.start_date) return null
      if (subtask.start_date instanceof Date) return subtask.start_date.toISOString()
      if (typeof subtask.start_date === 'number') return new Date(subtask.start_date).toISOString()
      return subtask.start_date
    },
    endDate: (subtask: any) => {
      // Convert MySQL DATE to ISO 8601 string
      if (!subtask.end_date) return null
      if (subtask.end_date instanceof Date) return subtask.end_date.toISOString()
      if (typeof subtask.end_date === 'number') return new Date(subtask.end_date).toISOString()
      return subtask.end_date
    },
    priority: (subtask: any) => subtask.priority || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    estimatedHours: (subtask: any) => subtask.estimated_hours || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    actualHours: (subtask: any) => subtask.actual_hours || null, // ✅ FIXED: Column doesn't exist in PostgreSQL
    status: (subtask: any) => subtask.status || 'Not Started', // ✅ FIXED: Provide default value
    remarks: (subtask: any) => subtask.remarks || null,
    isCompleted: (subtask: any) => subtask.is_completed || false,
    displayOrder: (subtask: any) => subtask.display_order || 0,
    deletedAt: (subtask: any) => subtask.deleted_at,
    deletedBy: (subtask: any) => subtask.deleted_by,
    createdAt: (subtask: any) => {
      if (!subtask.created_at) return getCurrentDateTime()
      if (subtask.created_at instanceof Date) return subtask.created_at.toISOString()
      if (typeof subtask.created_at === 'number') return new Date(subtask.created_at).toISOString()
      return subtask.created_at
    },
    updatedAt: (subtask: any) => {
      if (!subtask.updated_at) return getCurrentDateTime()
      if (subtask.updated_at instanceof Date) return subtask.updated_at.toISOString()
      if (typeof subtask.updated_at === 'number') return new Date(subtask.updated_at).toISOString()
      return subtask.updated_at
    },
    createdBy: (subtask: any) => subtask.created_by,

    assignedToUser: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.assigned_to) return null

      try {
        return await loaders.user.load(subtask.assigned_to)
      } catch (error) {
        console.error(`[BugSubTask.assignedToUser] Failed to load user ${subtask.assigned_to}:`, error)
        return null
      }
    },

    assignedByUser: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.assigned_by) return null

      try {
        return await loaders.user.load(subtask.assigned_by)
      } catch (error) {
        console.error(`[BugSubTask.assignedByUser] Failed to load user ${subtask.assigned_by}:`, error)
        return null
      }
    },

    parentBug: async (subtask: any, _: any, { loaders }: any) => {
      if (!subtask.parent_bug_id) return null

      try {
        return await loaders.bug.load(subtask.parent_bug_id)
      } catch (error) {
        console.error(`[BugSubTask.parentBug] Failed to load bug ${subtask.parent_bug_id}:`, error)
        return null
      }
    }
  },

  // Field resolvers for Project
  Project: {
    // Map snake_case database columns to camelCase GraphQL fields
    id: (project: any) => project.id,
    projectId: (project: any) => project.project_id,
    projectName: (project: any) => project.project_name,
    description: (project: any) => project.description,
    parentProjectId: (project: any) => project.parent_project_id,
    deletedAt: (project: any) => project.deleted_at,
    deletedBy: (project: any) => project.deleted_by,
    createdAt: (project: any) => project.created_at,
    updatedAt: (project: any) => project.updated_at,

    tasks: async (project: any) => {
      const result = await getPoolInstance().query(
        'SELECT * FROM tasks WHERE project_id = $1 AND deleted_at IS NULL',
        [project.project_id]
      )
      return result.rows
    },

    assignedUsers: async (project: any) => {
      const result = await getPoolInstance().query(
        'SELECT * FROM project_users WHERE project_id = $1 ORDER BY assigned_at ASC',
        [project.project_id]
      )
      return result.rows || []
    }
  },

  ProjectUser: {
    projectId: (pu: any) => pu.project_id,
    employeeId: (pu: any) => pu.employee_id,
    assignedBy: (pu: any) => pu.assigned_by,
    assignedAt: (pu: any) => pu.assigned_at,
    user: async (pu: any) => {
      const result = await getPoolInstance().query(
        'SELECT * FROM users WHERE employee_id = $1',
        [pu.employee_id]
      )
      return result.rows[0] || null
    }
  },

  // Field resolvers for Setting
  Setting: {
    // Map snake_case database columns to camelCase GraphQL fields
    id: (setting: any) => setting.id,
    key: (setting: any) => setting.key,
    value: (setting: any) => {
      // value can be a JSON array in database, convert to JSON string for GraphQL
      if (!setting.value) return null
      if (typeof setting.value === 'string') return setting.value
      // If it's an array or object, stringify it
      return JSON.stringify(setting.value)
    },
    type: (setting: any) => setting.type,
    isActive: (setting: any) => setting.is_active,
    createdAt: (setting: any) => setting.created_at,
    updatedAt: (setting: any) => setting.updated_at,
  },

  // Field resolvers for FeedPost
  FeedPost: {
    postId: (post: any) => post.post_id,
    contentType: (post: any) => post.content_type,
    content: (post: any) => post.content,
    linkUrl: (post: any) => post.link_url,
    linkTitle: (post: any) => post.og_title,
    linkDescription: (post: any) => post.og_description,
    linkImage: (post: any) => post.og_image,
    mediaUrls: (post: any) => {
      if (!post.media_urls) return [];
      if (typeof post.media_urls === 'string') return JSON.parse(post.media_urls);
      return Array.isArray(post.media_urls) ? post.media_urls : [];
    },
    createdBy: (post: any) => post.created_by,
    createdAt: (post: any) => {
      if (!post.created_at) {
        console.warn(`[FeedPost] createdAt is null/undefined for post ${post.post_id}`)
        return null
      }
      // Validate the date and return ISO string
      const date = new Date(post.created_at)
      if (isNaN(date.getTime())) {
        console.error(`[FeedPost] Invalid createdAt date for post ${post.post_id}: ${post.created_at}`)
        return null
      }
      return date.toISOString()
    },
    updatedAt: (post: any) => {
      if (!post.updated_at) return null
      const date = new Date(post.updated_at)
      if (isNaN(date.getTime())) {
        console.error(`[FeedPost] Invalid updatedAt date for post ${post.post_id}: ${post.updated_at}`)
        return null
      }
      return date.toISOString()
    },
    status: (post: any) => post.status,

    author: async (post: any, _: any, { loaders }: any) => {
      if (!post.created_by) return null

      try {
        return await loaders.user.load(post.created_by)
      } catch (error) {
        console.error(`[FeedPost.author] Failed to load user ${post.created_by}:`, error)
        return null
      }
    },

    topics: async (post: any, _: any, { loaders }: any) => {
      if (!post.post_id) return []

      try {
        return await loaders.feedPostTopics.load(post.post_id)
      } catch (error) {
        console.error(`[FeedPost.topics] Failed to load topics for post ${post.post_id}:`, error)
        return []
      }
    },

    reactions: async (post: any, _: any, { loaders, user }: any) => {
      if (!post.post_id) return []

      try {
        const reactions = await loaders.feedReactions.load(post.post_id)

        // Group by emoji
        const grouped: Record<string, any> = {}
        reactions.forEach((r: any) => {
          if (!grouped[r.emoji]) {
            grouped[r.emoji] = { emoji: r.emoji, userIds: [], count: 0, hasUserReacted: false }
          }
          grouped[r.emoji].userIds.push(r.user_id)
          grouped[r.emoji].count++
          if (user && r.user_id === user.employeeId) {
            grouped[r.emoji].hasUserReacted = true
          }
        })

        return Object.values(grouped)
      } catch (error) {
        console.error(`[FeedPost.reactions] Failed to load reactions for post ${post.post_id}:`, error)
        return []
      }
    },

    comments: async (post: any, _: any, { loaders }: any) => {
      if (!post.post_id) return []

      try {
        return await loaders.feedComments.load(post.post_id)
      } catch (error) {
        console.error(`[FeedPost.comments] Failed to load comments for post ${post.post_id}:`, error)
        return []
      }
    },

    viewCount: async (post: any) => {
      if (!post.post_id) return 0

      try {
        const result = await getPoolInstance().query(
          'SELECT COUNT(*) FROM feed_views WHERE post_id = $1',
          [post.post_id]
        )
        return parseInt(result.rows[0].count)
      } catch (error) {
        console.error(`[FeedPost.viewCount] Failed to get view count for post ${post.post_id}:`, error)
        return 0
      }
    },

    commentCount: async (post: any) => {
      if (!post.post_id) return 0

      try {
        const result = await getPoolInstance().query(
          'SELECT COUNT(*) FROM feed_comments WHERE post_id = $1 AND deleted_at IS NULL',
          [post.post_id]
        )
        return parseInt(result.rows[0].count)
      } catch (error) {
        console.error(`[FeedPost.commentCount] Failed to get comment count for post ${post.post_id}:`, error)
        return 0
      }
    },

    isSaved: async (post: any, _: any, { user }: any) => {
      if (!user) return false
      if (!post.post_id) return false

      try {
        const result = await getPoolInstance().query(
          `SELECT fpt.topic_id
           FROM feed_post_topics fpt
           JOIN feed_topics ft ON fpt.topic_id = ft.id
           WHERE fpt.post_id = $1 AND ft.is_saved = true AND ft.owner_user_id = $2 AND ft.deleted_at IS NULL`,
          [post.post_id, user.employeeId]
        )
        return result.rows.length > 0
      } catch (error) {
        console.error(`[FeedPost.isSaved] Failed to check if post ${post.post_id} is saved:`, error)
        return false
      }
    },

    hasUserReacted: async (post: any, _: any, { user }: any) => {
      if (!user) return false
      if (!post.post_id) return false

      try {
        const result = await getPoolInstance().query(
          'SELECT * FROM feed_reactions WHERE post_id = $1 AND user_id = $2 AND deleted_at IS NULL',
          [post.post_id, user.employeeId]
        )
        return result.rows.length > 0
      } catch (error) {
        console.error(`[FeedPost.hasUserReacted] Failed to check if user reacted to post ${post.post_id}:`, error)
        return false
      }
    }
  },

  // Field resolvers for FeedTopic
  FeedTopic: {
    id: (topic: any) => topic.topic_id || topic.id,
    topicName: (topic: any) => topic.topic_name,
    description: (topic: any) => topic.description,
    icon: (topic: any) => topic.icon,
    displayOrder: (topic: any) => topic.display_order,
    isPersonal: (topic: any) => topic.is_personal || false,
    isSaved: (topic: any) => topic.is_saved || false,
    ownerUserId: (topic: any) => topic.owner_user_id,
    createdBy: (topic: any) => topic.created_by,
    createdAt: (topic: any) => topic.created_at,
    postCount: async (topic: any) => {
      try {
        const topicId = topic.topic_id || topic.id
        const result = await getPoolInstance().query(
          `SELECT COUNT(DISTINCT fp.post_id) as count
           FROM feed_post_topics fpt
           JOIN feed_posts fp ON fpt.post_id = fp.post_id
           WHERE fpt.topic_id = $1
           AND fp.deleted_at IS NULL
           AND fp.status = 'published'`,
          [topicId]
        )
        return parseInt(result.rows[0]?.count || '0')
      } catch (error) {
        console.error(`[FeedTopic.postCount] Failed to get post count for topic ${topic.topic_id || topic.id}:`, error)
        return 0
      }
    }
  },

  // Field resolvers for FeedComment
  FeedComment: {
    commentId: (comment: any) => comment.comment_id,
    postId: (comment: any) => comment.post_id,
    parentCommentId: (comment: any) => comment.parent_comment_id,
    content: (comment: any) => comment.content,
    createdBy: (comment: any) => comment.created_by,
    createdAt: (comment: any) => {
      if (!comment.created_at) {
        console.warn(`[FeedComment] createdAt is null/undefined for comment ${comment.comment_id}`)
        return null
      }
      const date = new Date(comment.created_at)
      if (isNaN(date.getTime())) {
        console.error(`[FeedComment] Invalid createdAt date for comment ${comment.comment_id}: ${comment.created_at}`)
        return null
      }
      return comment.created_at
    },
    updatedAt: (comment: any) => {
      if (!comment.updated_at) return null
      const date = new Date(comment.updated_at)
      if (isNaN(date.getTime())) {
        console.error(`[FeedComment] Invalid updatedAt date for comment ${comment.comment_id}: ${comment.updated_at}`)
        return null
      }
      return comment.updated_at
    },

    author: async (comment: any, _: any, { loaders }: any) => {
      return loaders.user.load(comment.created_by)
    },

    replies: async (comment: any) => {
      const result = await getPoolInstance().query(
        'SELECT * FROM feed_comments WHERE parent_comment_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
        [comment.comment_id]
      )
      return result.rows
    }
  },

  // Field resolvers for FeedReaction
  FeedReaction: {
    emoji: (reaction: any) => reaction.emoji,
    count: (reaction: any) => reaction.count,
    hasUserReacted: (reaction: any) => reaction.hasUserReacted || false,

    users: async (reaction: any, _: any, { loaders }: any) => {
      const userIds = reaction.userIds || []
      const users = await Promise.all(userIds.map((id: string) => loaders.user.load(id)))
      return users.filter((u: any) => u !== null)
    }
  },

  // Mutations
  Mutation: {
    // Authentication mutations
    login: async (_: any, { employeeId, password }: any) => {
      const { startTime } = logResolverStart('login', { employeeId })

      try {
        // The `employeeId` GraphQL arg accepts either an employee ID (e.g., "AM-0001")
        // or an email address. Email matching is case-insensitive.
        const identifier = (employeeId || '').trim()

        // Query user from database
        const dbStart = logDatabaseQuery(
          'SELECT * FROM users WHERE (employee_id = $1 OR LOWER(email) = LOWER($1)) AND status = $2',
          [identifier, 'active'],
          'login'
        )

        const result = await getPoolInstance().query(
          'SELECT * FROM users WHERE (employee_id = $1 OR LOWER(email) = LOWER($1)) AND status = $2',
          [identifier, 'active']
        )

        logDatabaseResult(result.rows.length, dbStart.startTime, 'login')

        if (result.rows.length === 0) {
          logResolverError('login', new Error('User not found or inactive'), startTime)
          throw new Error('Invalid credentials')
        }

        const user = result.rows[0]

        // Verify password. Support bcrypt hashes, and upgrade legacy plaintext
        // passwords to a hash on successful login (safe backfill — existing
        // accounts keep working and stop living in plaintext).
        const bcrypt = require('bcryptjs')
        const storedPassword = user.password || ''
        let passwordValid = false
        if (/^\$2[aby]\$/.test(storedPassword)) {
          passwordValid = await bcrypt.compare(password, storedPassword)
        } else {
          passwordValid = storedPassword.length > 0 && storedPassword === password
          if (passwordValid) {
            try {
              const hash = await bcrypt.hash(password, 10)
              await getPoolInstance().query(
                'UPDATE users SET password = $1 WHERE employee_id = $2',
                [hash, user.employee_id]
              )
            } catch (e) {
              console.error('Failed to backfill password hash (graphql login):', e)
            }
          }
        }
        if (!passwordValid) {
          logResolverError('login', new Error('Invalid password'), startTime)
          throw new Error('Invalid credentials')
        }

        // Password login is a break-glass fallback for admin/service accounts only.
        // Everyone else must sign in with OTP (/api/auth/otp/*).
        const isAdminAccount = user.role === 'admin' || Boolean(user.is_system_admin)
        if (!isAdminAccount) {
          logResolverError('login', new Error('Password login disabled for non-admin'), startTime)
          throw new Error('Password login is disabled for this account. Please sign in with OTP.')
        }

        // Generate JWT token (JWT_SECRET is required — no hardcoded fallback)
        const jwtSecret = process.env.JWT_SECRET
        if (!jwtSecret || jwtSecret.length < 16) {
          throw new Error('JWT_SECRET is not configured')
        }
        const jwt = require('jsonwebtoken')
        const token = jwt.sign(
          {
            employeeId: user.employee_id,
            role: user.role,
            name: user.name
          },
          jwtSecret,
          { expiresIn: '7d' }
        )

        const response = {
          token,
          user: user
        }

        logResolverSuccess('login', response, startTime)
        return response
      } catch (error) {
        logResolverError('login', error, startTime)
        throw error
      }
    },

    // Task mutations
    createTask: async (_: any, { input }: any, context: any) => {
      requireUser(context)
      const taskId = `TSK-${Date.now()}`
      const support = input.support ? JSON.stringify(input.support) : '[]'

      // ✅ FIXED: Use snake_case column names for PostgreSQL
      await getPoolInstance().query(
        `INSERT INTO tasks (task_id, description, assigned_to, assigned_by, support, start_date, end_date,
         priority, estimated_hours, select_type, recursive_type, project_id, status, created_at, updated_at,
         meeting_link, meeting_reminder, start_time, due_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pending', NOW(), NOW(), $13, $14, $15, $16)`,
        [taskId, input.description, JSON.stringify([input.assignedTo]), input.assignedBy, support, input.startDate,
          input.endDate, input.priority, input.estimatedHours, input.selectType, input.recursiveType, input.projectId,
          input.meetingLink, input.meetingReminder || false, input.startTime || null, input.dueTime || null]
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM tasks WHERE task_id = $1',
        [taskId]
      )
      return result.rows[0]
    },

    updateTask: async (_: any, { taskId, input }: any, context: any) => {
      requireUser(context)
      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      // ✅ FIXED: Map camelCase to snake_case and use PostgreSQL parameterized queries
      const fieldMap: Record<string, string> = {
        description: 'description',
        assignedTo: 'assigned_to',
        support: 'support',
        startDate: 'start_date',
        endDate: 'end_date',
        priority: 'priority',
        estimatedHours: 'estimated_hours',
        actualHours: 'actual_hours',
        status: 'status',
        remarks: 'remarks',
        difficulties: 'difficulties',
        meetingLink: 'meeting_link',
        meetingReminder: 'meeting_reminder',
        startTime: 'start_time',
        dueTime: 'due_time'
      }

      Object.keys(input).forEach(key => {
        if (input[key] !== undefined && fieldMap[key]) {
          const dbColumn = fieldMap[key]

          if (key === 'support' && Array.isArray(input[key])) {
            updates.push(`${dbColumn} = $${paramIndex++}`)
            params.push(JSON.stringify(input[key]))
          } else if (key === 'assignedTo') {
            updates.push(`${dbColumn} = $${paramIndex++}`)
            params.push(JSON.stringify([input[key]]))
          } else {
            updates.push(`${dbColumn} = $${paramIndex++}`)
            params.push(input[key])
          }
        }
      })

      if (updates.length === 0) {
        throw new Error('No fields to update')
      }

      updates.push(`updated_at = NOW()`)
      params.push(taskId)

      await getPoolInstance().query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = $${paramIndex}`,
        params
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM tasks WHERE task_id = $1',
        [taskId]
      )
      return result.rows[0]
    },

    deleteTask: async (_: any, { taskId }: any, context: any) => {
      requireUser(context)
      await getPoolInstance().query(
        'UPDATE tasks SET deleted_at = NOW() WHERE task_id = $1',
        [taskId]
      )
      return true
    },

    // Bug mutations
    createBug: async (_: any, { input }: any, context: any) => {
      requireUser(context)
      // ✅ UPDATED: Generate sequential bug ID with DEV- prefix
      // Get latest bug ID from database to continue numbering
      const latestBugResult = await getPoolInstance().query(
        `SELECT bug_id FROM bugs
         WHERE deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`
      )
      const latestBugId = latestBugResult.rows[0]?.bug_id

      // Import generateSequentialBugId function
      const { generateSequentialBugId } = await import('@/lib/data')
      const bugId = generateSequentialBugId(latestBugId)

      // ✅ FIXED: Use snake_case column names for PostgreSQL
      await getPoolInstance().query(
        `INSERT INTO bugs (bug_id, description, category, severity, status, assigned_to, assigned_by,
         reported_by, reported_date, estimated_hours, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Open', $5, $6, $7, $8, $9, NOW(), NOW())`,
        [bugId, input.description, input.category, input.severity, input.assignedTo, input.assignedBy,
          input.reportedBy, input.reportedDate, input.estimatedHours]
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM bugs WHERE bug_id = $1',
        [bugId]
      )
      return result.rows[0]
    },

    updateBug: async (_: any, { bugId, input }: any, context: any) => {
      requireUser(context)
      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      // ✅ FIXED: Map camelCase to snake_case and use PostgreSQL parameterized queries
      const fieldMap: Record<string, string> = {
        description: 'description',
        category: 'category',
        severity: 'severity',
        priority: 'priority',
        status: 'status',
        assignedTo: 'assigned_to',
        estimatedHours: 'estimated_hours',
        actualHours: 'actual_hours',
        remarks: 'remarks',
        resolvedDate: 'resolved_date',
        startDate: 'start_date',
        endDate: 'end_date'
      }

      Object.keys(input).forEach(key => {
        if (input[key] !== undefined && fieldMap[key]) {
          const dbColumn = fieldMap[key]
          updates.push(`${dbColumn} = $${paramIndex++}`)
          params.push(input[key])
        }
      })

      if (updates.length === 0) {
        throw new Error('No fields to update')
      }

      updates.push(`updated_at = NOW()`)
      params.push(bugId)

      await getPoolInstance().query(
        `UPDATE bugs SET ${updates.join(', ')} WHERE bug_id = $${paramIndex}`,
        params
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM bugs WHERE bug_id = $1',
        [bugId]
      )
      return result.rows[0]
    },

    deleteBug: async (_: any, { bugId }: any, context: any) => {
      requireUser(context)
      await getPoolInstance().query(
        'UPDATE bugs SET deleted_at = NOW() WHERE bug_id = $1',
        [bugId]
      )
      return true
    },

    // User mutations
    createUser: async (_: any, { input }: any, context: any) => {
      requireRole(context, ['admin', 'top_management'])
      const bcrypt = require('bcryptjs')
      const hashedPassword = await bcrypt.hash(input.password, 10)

      // ✅ FIXED: Use snake_case column names for PostgreSQL
      await getPoolInstance().query(
        `INSERT INTO users (employee_id, name, email, phone, department, role, password, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())`,
        [input.employeeId, input.name, input.email, input.phone, input.department, input.role, hashedPassword]
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM users WHERE employee_id = $1',
        [input.employeeId]
      )
      return result.rows[0]
    },

    updateUser: async (_: any, { employeeId, input }: any, context: any) => {
      requireRole(context, ['admin', 'top_management'])
      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      // ✅ FIXED: Map camelCase to snake_case and use PostgreSQL parameterized queries
      const fieldMap: Record<string, string> = {
        name: 'name',
        email: 'email',
        phone: 'phone',
        department: 'department',
        role: 'role',
        status: 'status',
        isTodayTask: 'is_today_task',
        // tabPermissions was missing, so the bulk permissions screen
        // (app/users/permissions) matched zero fields and always threw
        // 'No fields to update' — it could never save.
        tabPermissions: 'tab_permissions',
        managerId: 'manager_id',
        managerEmail: 'manager_email'
      }

      Object.keys(input).forEach(key => {
        if (input[key] !== undefined && fieldMap[key]) {
          const dbColumn = fieldMap[key]
          updates.push(`${dbColumn} = $${paramIndex++}`)
          // tab_permissions is JSONB; the driver needs it serialized.
          params.push(key === 'tabPermissions' ? JSON.stringify(input[key]) : input[key])
        }
      })

      if (updates.length === 0) {
        throw new Error('No fields to update')
      }

      updates.push(`updated_at = NOW()`)
      params.push(employeeId)

      await getPoolInstance().query(
        `UPDATE users SET ${updates.join(', ')} WHERE employee_id = $${paramIndex}`,
        params
      )

      const result = await getPoolInstance().query(
        'SELECT * FROM users WHERE employee_id = $1',
        [employeeId]
      )
      return result.rows[0]
    },

    // Project User Mutations
    assignUserToProject: async (_: any, { projectId, employeeId, assignedBy }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      if (user.role !== 'admin' && user.role !== 'top_management') {
        throw new Error('Only admin or top_management can assign users to projects')
      }

      await getPoolInstance().query(
        `INSERT INTO project_users (project_id, employee_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, employee_id) DO UPDATE SET updated_at = NOW()`,
        [projectId, employeeId, assignedBy]
      )
      return true
    },

    removeUserFromProject: async (_: any, { projectId, employeeId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')
      if (user.role !== 'admin' && user.role !== 'top_management') {
        throw new Error('Only admin or top_management can remove users from projects')
      }

      await getPoolInstance().query(
        'DELETE FROM project_users WHERE project_id = $1 AND employee_id = $2',
        [projectId, employeeId]
      )
      return true
    },

    // Feed Mutations
    createFeedPost: async (_: any, { input }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Always auto-publish so they appear in feed immediately
      const status = 'published'

      const mediaUrls = input.mediaUrls ? JSON.stringify(input.mediaUrls) : null

      await getPoolInstance().query(
        `INSERT INTO feed_posts (post_id, content_type, content, link_url, og_title, og_description, og_image, media_urls, created_by, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [postId, input.contentType, input.content, input.linkUrl, input.linkTitle, input.linkDescription, input.linkImage, mediaUrls, user.employeeId, status]
      )

      // Link to topics
      for (const topicId of input.topicIds) {
        await getPoolInstance().query(
          'INSERT INTO feed_post_topics (post_id, topic_id) VALUES ($1, $2)',
          [postId, topicId]
        )
      }

      // Parse and store mentions
      try {
        const mentions = await parseMentions(input.content)
        if (mentions.length > 0) {
          await storeMentions(mentions, postId, null, user.employeeId)
          console.log(`✅ [createFeedPost] Stored ${mentions.length} mentions for post ${postId}`)
        }
      } catch (error) {
        console.error('[createFeedPost] Error parsing/storing mentions:', error)
        // Don't fail the post creation if mention parsing fails
      }

      const result = await getPoolInstance().query(
        'SELECT * FROM feed_posts WHERE post_id = $1',
        [postId]
      )
      return result.rows[0]
    },

    updateFeedPost: async (_: any, { postId, input }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      // Get the current post to check for status changes
      const currentPostResult = await getPoolInstance().query(
        'SELECT status, created_by FROM feed_posts WHERE post_id = $1',
        [postId]
      )
      const currentPost = currentPostResult.rows[0]
      const oldStatus = currentPost?.status
      const postAuthorId = currentPost?.created_by

      const updates: string[] = []
      const params: any[] = []
      let paramIndex = 1

      const fieldMap: Record<string, string> = {
        content: 'content',
        linkUrl: 'link_url',
        linkTitle: 'og_title',
        linkDescription: 'og_description',
        linkImage: 'og_image',
        mediaUrls: 'media_urls',
        status: 'status'
      }

      Object.keys(input).forEach(key => {
        if (input[key] !== undefined && fieldMap[key]) {
          const dbColumn = fieldMap[key]

          if (key === 'mediaUrls' && Array.isArray(input[key])) {
            updates.push(`${dbColumn} = $${paramIndex++}`)
            params.push(JSON.stringify(input[key]))
          } else if (key !== 'topicIds') {
            updates.push(`${dbColumn} = $${paramIndex++}`)
            params.push(input[key])
          }
        }
      })

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`)
        params.push(postId)

        await getPoolInstance().query(
          `UPDATE feed_posts SET ${updates.join(', ')} WHERE post_id = $${paramIndex}`,
          params
        )
      }

      // Update topics if provided
      if (input.topicIds) {
        await getPoolInstance().query('DELETE FROM feed_post_topics WHERE post_id = $1', [postId])
        for (const topicId of input.topicIds) {
          await getPoolInstance().query(
            'INSERT INTO feed_post_topics (post_id, topic_id) VALUES ($1, $2)',
            [postId, topicId]
          )
        }
      }

      // Create notification if status changed to published or rejected
      if (input.status && input.status !== oldStatus && postAuthorId) {
        try {
          if (input.status === 'published' && oldStatus === 'pending') {
            await createPostStatusNotification(
              postAuthorId,
              user.employeeId,
              postId,
              'approved',
              user.name
            )
            console.log(`✅ [updateFeedPost] Created approval notification for post author ${postAuthorId}`)
          } else if (input.status === 'rejected') {
            await createPostStatusNotification(
              postAuthorId,
              user.employeeId,
              postId,
              'rejected',
              user.name
            )
            console.log(`✅ [updateFeedPost] Created rejection notification for post author ${postAuthorId}`)
          }
        } catch (notifError) {
          console.error('[updateFeedPost] Error creating notification:', notifError)
          // Don't fail the update if notification fails
        }
      }

      const result = await getPoolInstance().query(
        'SELECT * FROM feed_posts WHERE post_id = $1',
        [postId]
      )
      return result.rows[0]
    },

    deleteFeedPost: async (_: any, { postId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      await getPoolInstance().query(
        'UPDATE feed_posts SET deleted_at = NOW(), deleted_by = $1 WHERE post_id = $2',
        [user.employeeId, postId]
      )
      return true
    },

    createFeedComment: async (_: any, { postId, content, parentCommentId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      await getPoolInstance().query(
        `INSERT INTO feed_comments (comment_id, post_id, parent_comment_id, content, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [commentId, postId, parentCommentId, content, user.employeeId]
      )

      // Parse and store mentions
      try {
        const mentions = await parseMentions(content)
        if (mentions.length > 0) {
          await storeMentions(mentions, null, commentId, user.employeeId)
          console.log(`✅ [createFeedComment] Stored ${mentions.length} mentions for comment ${commentId}`)
        }
      } catch (error) {
        console.error('[createFeedComment] Error parsing/storing mentions:', error)
        // Don't fail the comment creation if mention parsing fails
      }

      // Create notification for post author (if not commenting on own post)
      try {
        const postResult = await getPoolInstance().query(
          'SELECT created_by FROM feed_posts WHERE post_id = $1',
          [postId]
        )
        const postAuthorId = postResult.rows[0]?.created_by

        if (postAuthorId && postAuthorId !== user.employeeId) {
          await createCommentNotification(
            postAuthorId,
            user.employeeId,
            postId,
            commentId,
            user.name
          )
          console.log(`✅ [createFeedComment] Created notification for post author ${postAuthorId}`)
        }
      } catch (notifError) {
        console.error('[createFeedComment] Error creating notification:', notifError)
        // Don't fail the comment creation if notification fails
      }

      const result = await getPoolInstance().query(
        'SELECT * FROM feed_comments WHERE comment_id = $1',
        [commentId]
      )
      return result.rows[0]
    },

    deleteFeedComment: async (_: any, { commentId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      await getPoolInstance().query(
        'UPDATE feed_comments SET deleted_at = NOW(), deleted_by = $1 WHERE comment_id = $2',
        [user.employeeId, commentId]
      )
      return true
    },

    toggleFeedReaction: async (_: any, { postId, emoji }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const existing = await getPoolInstance().query(
        'SELECT * FROM feed_reactions WHERE post_id = $1 AND user_id = $2 AND emoji = $3 AND deleted_at IS NULL',
        [postId, user.employeeId, emoji]
      )

      if (existing.rows.length > 0) {
        await getPoolInstance().query(
          'UPDATE feed_reactions SET deleted_at = NOW() WHERE post_id = $1 AND user_id = $2 AND emoji = $3',
          [postId, user.employeeId, emoji]
        )
        return { action: 'removed', message: 'Reaction removed' }
      } else {
        await getPoolInstance().query(
          'INSERT INTO feed_reactions (post_id, user_id, emoji, created_at) VALUES ($1, $2, $3, NOW())',
          [postId, user.employeeId, emoji]
        )

        // Create notification for post author (if not reacting to own post)
        try {
          const postResult = await getPoolInstance().query(
            'SELECT created_by FROM feed_posts WHERE post_id = $1',
            [postId]
          )
          const postAuthorId = postResult.rows[0]?.created_by

          if (postAuthorId && postAuthorId !== user.employeeId) {
            await createReactionNotification(
              postAuthorId,
              user.employeeId,
              postId,
              emoji,
              user.name
            )
            console.log(`✅ [toggleFeedReaction] Created notification for post author ${postAuthorId}`)
          }
        } catch (notifError) {
          console.error('[toggleFeedReaction] Error creating notification:', notifError)
          // Don't fail the reaction if notification fails
        }

        return { action: 'added', message: 'Reaction added' }
      }
    },

    trackFeedView: async (_: any, { postId }: any, { user }: any) => {
      if (!user) return false

      try {
        // Use ON CONFLICT to handle race conditions (idempotent)
        await getPoolInstance().query(
          'INSERT INTO feed_views (post_id, user_id, viewed_at) VALUES ($1, $2, NOW()) ON CONFLICT (post_id, user_id) DO NOTHING',
          [postId, user.employeeId]
        )
        return true
      } catch (error) {
        console.error('[trackFeedView] Error tracking view:', error)
        return false
      }
    },

    toggleFeedSave: async (_: any, { postId }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      // Get user's "Saved Posts" topic
      const savedTopic = await getPoolInstance().query(
        'SELECT id FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 AND deleted_at IS NULL',
        [user.employeeId]
      )

      if (savedTopic.rows.length === 0) {
        throw new Error('Saved Posts topic not found. Please initialize personal topics first.')
      }

      const savedTopicId = savedTopic.rows[0].id

      // Check if already saved
      const existing = await getPoolInstance().query(
        'SELECT * FROM feed_post_topics WHERE post_id = $1 AND topic_id = $2',
        [postId, savedTopicId]
      )

      if (existing.rows.length > 0) {
        await getPoolInstance().query(
          'DELETE FROM feed_post_topics WHERE post_id = $1 AND topic_id = $2',
          [postId, savedTopicId]
        )
        return { action: 'removed', message: 'Post removed from Saved Posts' }
      } else {
        await getPoolInstance().query(
          'INSERT INTO feed_post_topics (post_id, topic_id) VALUES ($1, $2)',
          [postId, savedTopicId]
        )
        return { action: 'saved', message: 'Post saved successfully' }
      }
    },

    createFeedTopic: async (_: any, { input }: any, { user }: any) => {
      if (!user) throw new Error('Unauthorized')

      const result = await getPoolInstance().query(
        `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, created_by, created_at)
         VALUES ($1, $2, $3, $4, false, $5, NOW())
         RETURNING *`,
        [input.topicName, input.description, input.icon, input.displayOrder || 999, user.employeeId]
      )

      return result.rows[0]
    },

    initPersonalTopics: async (_: any, __: any, { user }: any) => {
      if (!user) {
        console.error('[initPersonalTopics] Unauthorized - no user in context')
        throw new Error('Unauthorized')
      }

      try {
        console.log(`[initPersonalTopics] Initializing personal topics for user ${user.employeeId}`)

        // Check if personal topics already exist
        const existing = await getPoolInstance().query(
          'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 AND deleted_at IS NULL',
          [user.employeeId]
        )

        // Find existing topics by type
        let personalNotes = existing.rows.find((t: any) => !t.is_saved)
        let savedPosts = existing.rows.find((t: any) => t.is_saved)

        // If both exist, return them
        if (personalNotes && savedPosts) {
          console.log(`[initPersonalTopics] Both personal topics already exist for user ${user.employeeId}`)
          return {
            personalNotes,
            savedPosts
          }
        }

        console.log(`[initPersonalTopics] Creating missing personal topics for user ${user.employeeId}`, {
          hasPersonalNotes: !!personalNotes,
          hasSavedPosts: !!savedPosts
        })

        // Create Personal Notes topic if it doesn't exist
        if (!personalNotes) {
          try {
            const result = await getPoolInstance().query(
              `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
               VALUES ($1, $2, $3, $4, true, false, $5, $6, NOW())
               RETURNING *`,
              [`${user.name}'s Personal Notes`, 'Your private notes and thoughts', '📝', 1000, user.employeeId, user.employeeId]
            )
            personalNotes = result.rows[0]
            console.log(`[initPersonalTopics] Created Personal Notes topic for user ${user.employeeId}`)
          } catch (err: any) {
            // If duplicate key error, fetch the existing record
            // The unique constraint is on (owner_user_id, is_personal) WHERE is_personal = true
            if (err.code === '23505') {
              console.log(`[initPersonalTopics] Personal Notes topic already exists for user ${user.employeeId}, fetching it`)

              // Try multiple queries to find the record (race condition handling)
              let result = await getPoolInstance().query(
                'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 AND deleted_at IS NULL AND (is_saved = false OR is_saved IS NULL) LIMIT 1',
                [user.employeeId]
              )
              personalNotes = result.rows[0]

              // If not found, try without deleted_at filter (might be soft-deleted)
              if (!personalNotes) {
                console.log(`[initPersonalTopics] Trying to find soft-deleted Personal Notes topic for user ${user.employeeId}`)
                result = await getPoolInstance().query(
                  'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                  [user.employeeId]
                )
                personalNotes = result.rows[0]

                // If found but soft-deleted, restore it
                if (personalNotes && personalNotes.deleted_at) {
                  console.log(`[initPersonalTopics] Restoring soft-deleted Personal Notes topic for user ${user.employeeId}`)
                  result = await getPoolInstance().query(
                    'UPDATE feed_topics SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING *',
                    [personalNotes.id]
                  )
                  personalNotes = result.rows[0]
                }
              }

              // If still not found, wait a bit and retry (race condition with concurrent request)
              if (!personalNotes) {
                console.log(`[initPersonalTopics] Waiting 100ms and retrying for user ${user.employeeId} (possible race condition)`)
                await new Promise(resolve => setTimeout(resolve, 100))
                result = await getPoolInstance().query(
                  'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                  [user.employeeId]
                )
                personalNotes = result.rows[0]
              }

              // If STILL not found, use INSERT ... ON CONFLICT
              if (!personalNotes) {
                console.warn(`[initPersonalTopics] Could not find existing Personal Notes topic for user ${user.employeeId}, creating new one`)
                result = await getPoolInstance().query(
                  `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
                   VALUES ($1, $2, $3, $4, true, false, $5, $6, NOW())
                   ON CONFLICT DO NOTHING
                   RETURNING *`,
                  [`${user.name}'s Personal Notes`, 'Your private notes and thoughts', '📝', 1000, user.employeeId, user.employeeId]
                )
                personalNotes = result.rows[0]

                // If ON CONFLICT DO NOTHING returned nothing, fetch one more time
                if (!personalNotes) {
                  result = await getPoolInstance().query(
                    'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                    [user.employeeId]
                  )
                  personalNotes = result.rows[0]
                }
              }

              // Last resort: log error but don't throw
              if (!personalNotes) {
                console.error(`[initPersonalTopics] CRITICAL: Failed to fetch or create Personal Notes topic for user ${user.employeeId} after multiple attempts`)
                console.error(`[initPersonalTopics] This indicates a database constraint or data integrity issue`)
                // Don't throw - continue with Saved Posts
              }
            } else {
              throw err
            }
          }
        }

        // Create Saved Posts topic if it doesn't exist
        if (!savedPosts) {
          try {
            const result = await getPoolInstance().query(
              `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
               VALUES ($1, $2, $3, $4, true, true, $5, $6, NOW())
               RETURNING *`,
              [`${user.name}'s Saved Posts`, 'Posts you want to save for later', '🔖', 1001, user.employeeId, user.employeeId]
            )
            savedPosts = result.rows[0]
            console.log(`[initPersonalTopics] Created Saved Posts topic for user ${user.employeeId}`)
          } catch (err: any) {
            // If duplicate key error, fetch the existing record
            // The unique constraint is on (owner_user_id, is_saved) WHERE is_saved = true
            if (err.code === '23505') {
              console.log(`[initPersonalTopics] Saved Posts topic already exists for user ${user.employeeId}, fetching it`)

              // Try multiple queries to find the record (race condition handling)
              let result = await getPoolInstance().query(
                'SELECT * FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 AND deleted_at IS NULL LIMIT 1',
                [user.employeeId]
              )
              savedPosts = result.rows[0]

              // If not found, try without deleted_at filter (might be soft-deleted)
              if (!savedPosts) {
                console.log(`[initPersonalTopics] Trying to find soft-deleted Saved Posts topic for user ${user.employeeId}`)
                result = await getPoolInstance().query(
                  'SELECT * FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                  [user.employeeId]
                )
                savedPosts = result.rows[0]

                // If found but soft-deleted, restore it
                if (savedPosts && savedPosts.deleted_at) {
                  console.log(`[initPersonalTopics] Restoring soft-deleted Saved Posts topic for user ${user.employeeId}`)
                  result = await getPoolInstance().query(
                    'UPDATE feed_topics SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 RETURNING *',
                    [savedPosts.id]
                  )
                  savedPosts = result.rows[0]
                }
              }

              // If still not found, wait a bit and retry (race condition with concurrent request)
              if (!savedPosts) {
                console.log(`[initPersonalTopics] Waiting 100ms and retrying for user ${user.employeeId} (possible race condition)`)
                await new Promise(resolve => setTimeout(resolve, 100))
                result = await getPoolInstance().query(
                  'SELECT * FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                  [user.employeeId]
                )
                savedPosts = result.rows[0]
              }

              // If STILL not found, create it anyway (ignore the duplicate key error)
              if (!savedPosts) {
                console.warn(`[initPersonalTopics] Could not find existing Saved Posts topic for user ${user.employeeId}, creating new one`)
                // Use INSERT ... ON CONFLICT to handle race condition
                result = await getPoolInstance().query(
                  `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
                   VALUES ($1, $2, $3, $4, true, true, $5, $6, NOW())
                   ON CONFLICT DO NOTHING
                   RETURNING *`,
                  [`${user.name}'s Saved Posts`, 'Posts you want to save for later', '🔖', 1001, user.employeeId, user.employeeId]
                )
                savedPosts = result.rows[0]

                // If ON CONFLICT DO NOTHING returned nothing, fetch the existing record one more time
                if (!savedPosts) {
                  result = await getPoolInstance().query(
                    'SELECT * FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 ORDER BY created_at DESC LIMIT 1',
                    [user.employeeId]
                  )
                  savedPosts = result.rows[0]
                }
              }

              // Last resort: if we still don't have it, log detailed error but don't throw
              if (!savedPosts) {
                console.error(`[initPersonalTopics] CRITICAL: Failed to fetch or create Saved Posts topic for user ${user.employeeId} after multiple attempts`)
                console.error(`[initPersonalTopics] This indicates a database constraint or data integrity issue`)
                // Don't throw - return what we have (Personal Notes only)
              }
            } else {
              throw err
            }
          }
        }

        // Ensure we have both topics (create fallback if needed)
        if (!personalNotes) {
          console.error(`[initPersonalTopics] CRITICAL: Personal Notes topic is null for user ${user.employeeId}, creating fallback`)
          const fallbackResult = await getPoolInstance().query(
            `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
             VALUES ($1, $2, $3, $4, true, false, $5, $6, NOW())
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [`${user.name}'s Personal Notes`, 'Your private notes and thoughts', '📝', 1000, user.employeeId, user.employeeId]
          )
          personalNotes = fallbackResult.rows[0]

          // If still null, fetch any personal topic for this user
          if (!personalNotes) {
            const anyResult = await getPoolInstance().query(
              'SELECT * FROM feed_topics WHERE is_personal = true AND owner_user_id = $1 LIMIT 1',
              [user.employeeId]
            )
            personalNotes = anyResult.rows[0]
          }
        }

        if (!savedPosts) {
          console.error(`[initPersonalTopics] CRITICAL: Saved Posts topic is null for user ${user.employeeId}, creating fallback`)
          const fallbackResult = await getPoolInstance().query(
            `INSERT INTO feed_topics (topic_name, description, icon, display_order, is_personal, is_saved, owner_user_id, created_by, created_at)
             VALUES ($1, $2, $3, $4, true, true, $5, $6, NOW())
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [`${user.name}'s Saved Posts`, 'Posts you want to save for later', '🔖', 1001, user.employeeId, user.employeeId]
          )
          savedPosts = fallbackResult.rows[0]

          // If still null, fetch any saved topic for this user
          if (!savedPosts) {
            const anyResult = await getPoolInstance().query(
              'SELECT * FROM feed_topics WHERE is_saved = true AND owner_user_id = $1 LIMIT 1',
              [user.employeeId]
            )
            savedPosts = anyResult.rows[0]
          }
        }

        console.log(`[initPersonalTopics] Successfully initialized personal topics for user ${user.employeeId}`)

        return {
          personalNotes: personalNotes || null,
          savedPosts: savedPosts || null
        }
      } catch (error: any) {
        console.error(`[initPersonalTopics] Error for user ${user?.employeeId}:`, error)
        throw new Error(`Failed to initialize personal topics: ${error.message}`)
      }
    },

    // Mention Mutations
    ...mentionMutations,

    // Notification Mutations
    ...notificationMutations,

    // Push Token Mutations
    ...pushTokenMutations,

    // Requirement Mutations
    ...requirementMutations,

    // Founder Start Mutations
    ...founderMutations,

    // Attendance Mutations
    signIn: async (_: any, __: any, context: any) => {
      const { user, req } = context
      if (!user) throw new Error('Unauthorized')

      const now = new Date()
      const istDate = getISTDate(now)
      const { start, end } = getISTDayRangeInUTC(now)

      // Check if already signed in
      const existing = await getPoolInstance().query(
        `SELECT * FROM attendance_logs 
         WHERE employee_id = $1 
         AND sign_in_time >= $2 
         AND sign_in_time <= $3`,
        [user.employeeId, start, end]
      )

      if (existing.rows.length > 0) {
        throw new Error('You have already signed in today')
      }

      // Get location from IP
      const { getClientIP, getLocationFromIPServer } = await import('@/lib/location')
      const clientIP = req ? getClientIP(req) : 'unknown'
      const location = await getLocationFromIPServer(clientIP)

      // Determine Status (Full Day vs Half Day)
      const istHours = istDate.getUTCHours()
      const istMinutes = istDate.getUTCMinutes()

      let status = 'full_day'
      if (istHours > 10 || (istHours === 10 && istMinutes > 0)) {
        status = 'half_day'
      }

      // Insert with location
      const dateStr = istDate.toISOString().split('T')[0]

      const result = await getPoolInstance().query(
        `INSERT INTO attendance_logs 
         (employee_id, sign_in_time, sign_in_location, date, status) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [user.employeeId, now, location, dateStr, status]
      )

      return result.rows[0]
    },

    signOut: async (_: any, __: any, context: any) => {
      const { user, req } = context
      if (!user) throw new Error('Unauthorized')

      const now = new Date()
      const { start, end } = getISTDayRangeInUTC(now)

      // Find active attendance
      const existing = await getPoolInstance().query(
        `SELECT * FROM attendance_logs 
         WHERE employee_id = $1 
         AND sign_in_time >= $2 
         AND sign_in_time <= $3
         LIMIT 1`,
        [user.employeeId, start, end]
      )

      if (existing.rows.length === 0) {
        throw new Error('You have not signed in today')
      }

      const attendance = existing.rows[0]
      if (attendance.sign_out_time) {
        throw new Error('You have already signed out today')
      }

      // Get location from IP
      const { getClientIP, getLocationFromIPServer } = await import('@/lib/location')
      const clientIP = req ? getClientIP(req) : 'unknown'
      const location = await getLocationFromIPServer(clientIP)

      // Calculate work hours
      const signInTime = new Date(attendance.sign_in_time)
      const diffMinutes = differenceInMinutes(now, signInTime)
      const workHours = parseFloat((diffMinutes / 60).toFixed(2))

      const result = await getPoolInstance().query(
        `UPDATE attendance_logs 
         SET sign_out_time = $1, sign_out_location = $2, work_hours = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [now, location, workHours, attendance.id]
      )

      return result.rows[0]
    },

    undoSignOut: async (_: any, { date }: any, context: any) => {
      const { user } = context
      if (!user) throw new Error('Unauthorized')

      // Get timeout setting from database
      const settingResult = await getPoolInstance().query(
        `SELECT value FROM settings WHERE key = 'attendance_undo_timeout_hours' AND is_active = true`
      )
      const timeoutHours = settingResult.rows[0]?.value ? parseInt(settingResult.rows[0].value) : 2

      // Find attendance record for the specified date
      const targetDate = date || new Date().toISOString().split('T')[0]
      const recordResult = await getPoolInstance().query(
        `SELECT * FROM attendance_logs 
         WHERE employee_id = $1 
         AND date = $2`,
        [user.employeeId, targetDate]
      )

      if (recordResult.rows.length === 0) {
        throw new Error('No attendance record found for this date')
      }

      const attendance = recordResult.rows[0]

      // Check if sign-out exists
      if (!attendance.sign_out_time) {
        throw new Error('You have not signed out yet')
      }

      // Check if within timeout window
      const signOutTime = new Date(attendance.sign_out_time)
      const now = new Date()
      const hoursSinceSignOut = (now.getTime() - signOutTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceSignOut > timeoutHours) {
        throw new Error(`Undo is only available within ${timeoutHours} hours of sign-out`)
      }

      // Undo the sign-out
      const result = await getPoolInstance().query(
        `UPDATE attendance_logs 
         SET sign_out_time = NULL, 
             sign_out_location = NULL, 
             work_hours = NULL,
             sign_out_undone_at = NOW(),
             sign_out_undone_by = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [user.employeeId, attendance.id]
      )

      return result.rows[0]
    },

    requestManualAttendance: async (_: any, { input }: any, context: any) => {
      const { user } = context
      if (!user) throw new Error('Unauthorized')

      const { date, signInTime, signOutTime, reason } = input

      // Check if record exists
      const existing = await getPoolInstance().query(
        `SELECT * FROM attendance_logs 
         WHERE employee_id = $1 
         AND date = $2`,
        [user.employeeId, date]
      )

      if (existing.rows.length > 0) {
        throw new Error('Attendance record already exists for this date')
      }

      // Calculate work hours
      const start = new Date(signInTime)
      const end = new Date(signOutTime)
      const diffMinutes = differenceInMinutes(end, start)
      const workHours = parseFloat((diffMinutes / 60).toFixed(2))

      // Determine status
      const istDate = getISTDate(start)
      const istHours = istDate.getUTCHours()
      const istMinutes = istDate.getUTCMinutes()

      let status = 'full_day'
      if (istHours > 10 || (istHours === 10 && istMinutes > 0)) {
        status = 'half_day'
      }

      const result = await getPoolInstance().query(
        `INSERT INTO attendance_logs 
         (employee_id, sign_in_time, sign_out_time, work_hours, date, status, is_manual_entry, approval_status) 
         VALUES ($1, $2, $3, $4, $5, $6, true, 'pending') 
         RETURNING *`,
        [user.employeeId, start, end, workHours, date, status]
      )

      return result.rows[0]
    },

    requestAttendanceEdit: async (_: any, { input }: any, context: any) => {
      const { user } = context
      if (!user) throw new Error('Unauthorized')

      const { attendanceDate, requestType, originalTime, newTime, reason } = input

      // Insert into attendance_requests
      const result = await getPoolInstance().query(
        `INSERT INTO attendance_requests 
         (employee_id, attendance_date, request_type, original_time, new_time, reason, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW(), NOW())
         RETURNING *`,
        [user.employeeId, attendanceDate, requestType, originalTime, newTime, reason]
      )

      const row = result.rows[0]
      return {
        id: row.id,
        userId: row.employee_id,
        attendanceDate: format(new Date(row.attendance_date), 'yyyy-MM-dd'),
        requestType: row.request_type,
        originalTime: row.original_time ? format(new Date(row.original_time), 'yyyy-MM-dd HH:mm:ss') : null,
        newTime: format(new Date(row.new_time), 'yyyy-MM-dd HH:mm:ss'),
        reason: row.reason,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at ? format(new Date(row.reviewed_at), 'yyyy-MM-dd HH:mm:ss') : null,
        createdAt: format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss'),
        updatedAt: format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm:ss')
      }
    },

    approveAttendanceRequest: async (_: any, { requestId }: any, context: any) => {
      const { user } = context
      if (!user) throw new Error('Unauthorized')
      // TODO: Check if user is admin? For now assuming any authorized user can approve (or relying on frontend protection)
      // Ideally check user.role === 'ADMIN' or similar.

      const client = await getPoolInstance().connect()
      try {
        await client.query('BEGIN')

        // Fetch request
        const reqResult = await client.query(
          'SELECT * FROM attendance_requests WHERE id = $1 FOR UPDATE',
          [requestId]
        )
        if (reqResult.rows.length === 0) throw new Error('Request not found')
        const request = reqResult.rows[0]

        if (request.status !== 'PENDING') throw new Error('Request is not pending')

        // Update request status
        const updateResult = await client.query(
          `UPDATE attendance_requests 
           SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [user.employeeId, requestId]
        )

        // Apply changes to attendance_logs
        // Check if log exists
        const logResult = await client.query(
          'SELECT * FROM attendance_logs WHERE employee_id = $1 AND date = $2',
          [request.employee_id, request.attendance_date]
        )

        if (request.request_type === 'MISSING_ENTRY') {
          if (logResult.rows.length > 0) {
            // Update existing? Or error?
            // If missing entry request but log exists, maybe update it?
            // Let's assume update.
          } else {
            // Create new log
            // We need sign_in and sign_out. Request has new_time.
            // But MISSING_ENTRY usually implies full day or specific punch?
            // The schema has `new_time` (single timestamp).
            // If it's sign in edit, we update sign_in_time.
            // If it's sign out edit, we update sign_out_time.
            // If it's missing entry, maybe it provides both? But schema has one `new_time`.
            // Wait, `attendance_requests` table has `new_time` (TIMESTAMPTZ).
            // If request_type is SIGN_IN_EDIT, we update sign_in_time.
            // If SIGN_OUT_EDIT, sign_out_time.
            // If MISSING_ENTRY, maybe it means "I forgot to punch in" (Sign In) or "I forgot to punch out" (Sign Out)?
            // Or maybe it means "I was present but no record".
            // Let's assume MISSING_ENTRY is treated as a Sign In if no record, or we need more info.
            // For now, I'll handle SIGN_IN_EDIT and SIGN_OUT_EDIT explicitly.
          }
        }

        if (request.request_type === 'SIGN_IN_EDIT') {
          if (logResult.rows.length > 0) {
            await client.query(
              'UPDATE attendance_logs SET sign_in_time = $1, updated_at = NOW() WHERE id = $2',
              [request.new_time, logResult.rows[0].id]
            )
          } else {
            // Create new log with just sign in
            await client.query(
              `INSERT INTO attendance_logs (employee_id, date, sign_in_time, status, is_manual_entry, approval_status)
               VALUES ($1, $2, $3, 'present', true, 'approved')`,
              [request.employee_id, request.attendance_date, request.new_time]
            )
          }
        } else if (request.request_type === 'SIGN_OUT_EDIT') {
          if (logResult.rows.length > 0) {
            // Calculate work hours if sign in exists
            const signIn = logResult.rows[0].sign_in_time
            let workHours = null
            if (signIn) {
              const start = new Date(signIn)
              const end = new Date(request.new_time)
              const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
              workHours = parseFloat(diff.toFixed(2))
            }

            await client.query(
              'UPDATE attendance_logs SET sign_out_time = $1, work_hours = $2, updated_at = NOW() WHERE id = $3',
              [request.new_time, workHours, logResult.rows[0].id]
            )
          } else {
            // Create log with just sign out? Weird but possible.
            await client.query(
              `INSERT INTO attendance_logs (employee_id, date, sign_out_time, status, is_manual_entry, approval_status)
               VALUES ($1, $2, $3, 'present', true, 'approved')`,
              [request.employee_id, request.attendance_date, request.new_time]
            )
          }
        } else if (request.request_type === 'MISSING_ENTRY') {
          // Treat as Sign In for now if no record, or update sign in if record exists
          if (logResult.rows.length > 0) {
            await client.query(
              'UPDATE attendance_logs SET sign_in_time = $1, updated_at = NOW() WHERE id = $2',
              [request.new_time, logResult.rows[0].id]
            )
          } else {
            await client.query(
              `INSERT INTO attendance_logs (employee_id, date, sign_in_time, status, is_manual_entry, approval_status)
               VALUES ($1, $2, $3, 'present', true, 'approved')`,
              [request.employee_id, request.attendance_date, request.new_time]
            )
          }
        }

        await client.query('COMMIT')

        const row = updateResult.rows[0]
        return {
          id: row.id,
          userId: row.employee_id,
          attendanceDate: format(new Date(row.attendance_date), 'yyyy-MM-dd'),
          requestType: row.request_type,
          originalTime: row.original_time ? format(new Date(row.original_time), 'yyyy-MM-dd HH:mm:ss') : null,
          newTime: format(new Date(row.new_time), 'yyyy-MM-dd HH:mm:ss'),
          reason: row.reason,
          status: row.status,
          reviewedBy: row.reviewed_by,
          reviewedAt: row.reviewed_at ? format(new Date(row.reviewed_at), 'yyyy-MM-dd HH:mm:ss') : null,
          createdAt: format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss'),
          updatedAt: format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm:ss')
        }
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },

    rejectAttendanceRequest: async (_: any, { requestId }: any, context: any) => {
      const { user } = context
      if (!user) throw new Error('Unauthorized')

      const result = await getPoolInstance().query(
        `UPDATE attendance_requests 
         SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [user.employeeId, requestId]
      )

      if (result.rows.length === 0) throw new Error('Request not found')

      const row = result.rows[0]
      return {
        id: row.id,
        userId: row.employee_id,
        attendanceDate: format(new Date(row.attendance_date), 'yyyy-MM-dd'),
        requestType: row.request_type,
        originalTime: row.original_time ? format(new Date(row.original_time), 'yyyy-MM-dd HH:mm:ss') : null,
        newTime: format(new Date(row.new_time), 'yyyy-MM-dd HH:mm:ss'),
        reason: row.reason,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at ? format(new Date(row.reviewed_at), 'yyyy-MM-dd HH:mm:ss') : null,
        createdAt: format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss'),
        updatedAt: format(new Date(row.updated_at), 'yyyy-MM-dd HH:mm:ss')
      }
    }
  },

  // Field Resolvers
  ...mentionFieldResolvers,

  // Notification Field Resolvers
  FeedNotification: FeedNotificationFieldResolvers,

  // Requirement Field Resolvers
  ...requirementFieldResolvers,

  // Founder Start Field Resolvers
  ...founderFieldResolvers
}

