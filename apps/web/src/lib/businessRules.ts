// Business Rules Service for JSR System
// Handles all business logic including task warnings, work hours, holidays, etc.

import { Task, User } from './types'
import { DateUtils } from './dateUtils'
import { getAllTasks, updateTask, getTasksByStatus } from './db/tasks'
import { getAllUsers } from './db/users'
import { getAllLeaves } from './db/leaves'
import { getAllWFH } from './db/wfh'

/**
 * Business Rules Configuration
 */
export const BUSINESS_RULES = {
  WORK_HOURS: {
    FULL_DAY: 8.5, // 8.5 hours for full day
    HALF_DAY: 4.5, // 4.5 hours for half day
  },
  HOLIDAYS: {
    // 2nd and 4th Saturday + all Sundays
    NON_WORKING_DAYS: ['sunday'],
    SATURDAY_WEEKS: [2, 4], // 2nd and 4th Saturday of month
  },
  WARNINGS: {
    MAX_COUNT: 5, // Maximum warning count before escalation
  }
}



/**
 * Task Status Management System
 */
export class TaskStatusService {
  /**
   * Check and update delayed tasks automatically
   */
  static async updateDelayedTasks(): Promise<{ updated: number; tasks: any[] }> {
    try {
      // Use MySQL database directly to avoid circular API calls
      const tasks = await getAllTasks()
      const today = DateUtils.getTodayString()
      const updatedTasks: any[] = []

      for (const task of tasks) {
        // Check if task should be marked as delayed
        if (this.shouldMarkAsDelayed(task, today)) {
          try {
            await updateTask(task.taskId, { status: 'Delayed' })
            updatedTasks.push({
              ...task,
              status: 'Delayed',
              previousStatus: task.status
            })
            console.log(`Task ${task.taskId} marked as delayed (was ${task.status})`)
          } catch (error) {
            console.error(`Failed to update task ${task.taskId} to delayed:`, error)
          }
        }
      }

      return {
        updated: updatedTasks.length,
        tasks: updatedTasks
      }
    } catch (error) {
      console.error('Error updating delayed tasks:', error)
      return { updated: 0, tasks: [] }
    }
  }

  /**
   * Check if a task should be marked as delayed
   */
  static shouldMarkAsDelayed(task: any, today: string): boolean {
    // Don't change status if already completed, cancelled, stopped, or already delayed
    if (['Done', 'Cancel', 'Stop', 'Delayed'].includes(task.status)) {
      return false
    }

    // Check if end date has passed (task is overdue only AFTER the end date)
    const endDate = new Date(task.endDate)
    const todayDate = new Date(today)

    // Task is only overdue when today is AFTER the end date, not on the end date
    return todayDate > endDate
  }

  /**
   * Get delayed tasks summary
   */
  static async getDelayedTasksSummary(): Promise<{
    totalDelayed: number
    newlyDelayed: number
    delayedTasks: any[]
  }> {
    try {
      const tasks = await getAllTasks()
      const today = DateUtils.getTodayString()

      const delayedTasks = tasks.filter(task => task.status === 'Delayed')
      const shouldBeDelayed = tasks.filter(task => this.shouldMarkAsDelayed(task, today))

      return {
        totalDelayed: delayedTasks.length,
        newlyDelayed: shouldBeDelayed.length,
        delayedTasks: delayedTasks
      }
    } catch (error) {
      console.error('Error getting delayed tasks summary:', error)
      return { totalDelayed: 0, newlyDelayed: 0, delayedTasks: [] }
    }
  }
}

/**
 * Task Warning System
 */
export class TaskWarningService {
  /**
   * Check if user has active tasks for today (Client-side version using API)
   */
  static async checkUserHasTasks(employeeId: string): Promise<boolean> {
    try {
      // Use API call for client-side compatibility
      const response = await fetch(`/api/tasks/user/${employeeId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch tasks')
      }

      const result = await response.json()
      const tasks = result.data || []
      const today = DateUtils.getTodayString()

      // Check for active tasks (not completed, cancelled, or stopped)
      const activeTasks = tasks.filter((task: Task) => {
        const isActive = !['Done', 'Cancel', 'Stop'].includes(task.status)
        const isToday = task.startDate <= today && task.endDate >= today
        return isActive && isToday
      })

      return activeTasks.length > 0
    } catch (error) {
      console.error('Error checking user tasks:', error)
      return false
    }
  }

  /**
   * Process task warning for user
   */
  static async processTaskWarning(employeeId: string): Promise<{
    hasWarning: boolean
    warningCount: number
    message?: string
  }> {
    try {
      // Skip warning check on holidays
      if (!DateUtils.isTodayWorkingDay()) {
        return { hasWarning: false, warningCount: 0 }
      }

      const hasTasks = await this.checkUserHasTasks(employeeId)

      if (!hasTasks) {
        // First increment the warning count
        const incrementResponse = await fetch(`/api/users/${employeeId}/warning/increment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (incrementResponse.ok) {
          // Get updated user data after incrementing
          const userResponse = await fetch(`/api/users/${employeeId}`)
          if (userResponse.ok) {
            const result = await userResponse.json()
            const user = result.data

            if (user) {
              const message = `⚠️ Warning: You don't have any active tasks for today. Current warning count: ${user.warningCount || 0}.`
              return {
                hasWarning: true,
                warningCount: user.warningCount || 0,
                message
              }
            }
          }
        } else {
          // If increment fails, get current user data and show warning with current count + 1
          const userResponse = await fetch(`/api/users/${employeeId}`)
          if (userResponse.ok) {
            const result = await userResponse.json()
            const user = result.data

            if (user) {
              const newCount = (user.warningCount || 0) + 1
              const message = `⚠️ Warning: You don't have any active tasks for today. Current warning count: ${newCount}.`
              return {
                hasWarning: true,
                warningCount: newCount,
                message
              }
            }
          }
        }

        // Fallback if API calls fail
        return {
          hasWarning: true,
          warningCount: 1,
          message: '⚠️ Warning: You don\'t have any active tasks for today. Current warning count: 1.'
        }
      }
      
      return { hasWarning: false, warningCount: 0 }
    } catch (error) {
      console.error('Error processing task warning:', error)
      return { hasWarning: false, warningCount: 0 }
    }
  }
}

/**
 * Half-Day Application Service
 */
export class HalfDayService {
  /**
   * Validate half-day application dates
   */
  static validateHalfDayDates(fromDate: string, toDate: string, type: 'leave' | 'wfh'): {
    isValid: boolean
    error?: string
  } {
    // For half-day applications, from and to date should be the same
    if (fromDate !== toDate) {
      return {
        isValid: false,
        error: 'Half-day applications must be for a single date only. From date and to date should be the same.'
      }
    }

    // Check if the date is not a holiday
    const date = new Date(fromDate)
    if (DateUtils.isHoliday(date)) {
      return {
        isValid: false,
        error: 'Cannot apply for half-day on holidays (Sundays or 2nd/4th Saturdays).'
      }
    }

    // Check if date is not in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    date.setHours(0, 0, 0, 0)

    if (date < today) {
      return {
        isValid: false,
        error: 'Cannot apply for half-day on past dates.'
      }
    }

    return { isValid: true }
  }

  /**
   * Check if user already has application for the date
   */
  static async checkExistingApplication(employeeId: string, date: string): Promise<{
    hasConflict: boolean
    conflictType?: 'leave' | 'wfh'
    conflictDetails?: string
  }> {
    try {
      // This method is now handled by the API endpoint
      // to avoid client-side imports of Google Sheets libraries
      throw new Error('This method should be called via API endpoint /api/half-day?action=conflict')

      return { hasConflict: false }
    } catch (error) {
      console.error('Error checking existing applications:', error)
      return { hasConflict: false }
    }
  }
}

/**
 * Work Hours Validation Service
 */
export class WorkHoursService {
  /**
   * Get required work hours for a date (considering half-day applications)
   */
  static async getRequiredWorkHours(employeeId: string, date: string): Promise<number> {
    try {
      // Check if it's a holiday
      const dateObj = new Date(date)
      if (DateUtils.isHoliday(dateObj)) {
        return 0
      }

      // Check for half-day applications
      const isHalfDay = await this.checkHalfDayApplication(employeeId, date)

      return isHalfDay ? BUSINESS_RULES.WORK_HOURS.HALF_DAY : BUSINESS_RULES.WORK_HOURS.FULL_DAY
    } catch (error) {
      console.error('Error getting required work hours:', error)
      return BUSINESS_RULES.WORK_HOURS.FULL_DAY
    }
  }

  /**
   * Check if user has half-day application for a date
   */
  static async checkHalfDayApplication(employeeId: string, date: string): Promise<boolean> {
    try {
      // Normalize dates to YYYY-MM-DD: fromDate/toDate may be pg Date objects or
      // ISO datetime strings, which never === a plain 'YYYY-MM-DD' string.
      const toDay = (v: unknown): string => {
        if (!v) return ''
        if (v instanceof Date) return v.toISOString().split('T')[0]
        return String(v).split('T')[0]
      }

      // Check WFH applications for half-day
      const { getWFHByEmployeeId } = await import('./db/wfh')
      const wfhApplications = await getWFHByEmployeeId(employeeId)
      const halfDayWFH = wfhApplications.some(wfh => {
        const from = toDay(wfh.fromDate)
        const to = toDay(wfh.toDate)
        return from <= date && to >= date &&
          wfh.status.toLowerCase() === 'approved' &&
          wfh.wfhType.toLowerCase() === 'half day'
      })

      // Check leave applications for half-day
      const { getLeavesByEmployeeId } = await import('./db/leaves')
      const leaveApplications = await getLeavesByEmployeeId(employeeId)
      const halfDayLeave = leaveApplications.some(leave => {
        const from = toDay(leave.fromDate)
        const to = toDay(leave.toDate)
        return from === date && to === date &&
          leave.status.toLowerCase() === 'approved' &&
          leave.leaveType.toLowerCase().includes('half')
      })

      return halfDayWFH || halfDayLeave
    } catch (error) {
      console.error('Error checking half-day application:', error)
      return false
    }
  }

  /**
   * Validate work hours for a user on a specific date
   */
  static async validateWorkHours(employeeId: string, date: string): Promise<{
    isValid: boolean
    requiredHours: number
    actualHours: number
    deficit: number
  }> {
    try {
      const requiredHours = await this.getRequiredWorkHours(employeeId, date)

      // Get user's hours log
      const { getUserByEmployeeId } = await import('./db/users')
      const user = await getUserByEmployeeId(employeeId)
      const actualHours = user?.hoursLog ? DateUtils.parseHoursFromLog(user.hoursLog, date) : 0

      const deficit = Math.max(0, requiredHours - actualHours)
      const isValid = deficit === 0

      return {
        isValid,
        requiredHours,
        actualHours,
        deficit
      }
    } catch (error) {
      console.error('Error validating work hours:', error)
      return {
        isValid: false,
        requiredHours: BUSINESS_RULES.WORK_HOURS.FULL_DAY,
        actualHours: 0,
        deficit: BUSINESS_RULES.WORK_HOURS.FULL_DAY
      }
    }
  }

  /**
   * Get work hours report for management
   */
  /**
   * @param employeeIds - when given, only these employees appear in the report.
   *   Callers pass the set the requester is allowed to see.
   */
  static async getWorkHoursReport(date: string, employeeIds?: string[]): Promise<Array<{
    employeeId: string
    employeeName: string
    requiredHours: number
    actualHours: number
    deficit: number
    status: 'compliant' | 'deficit' | 'holiday'
  }>> {
    try {
      const allUsers = await getAllUsers()
      const users = employeeIds
        ? allUsers.filter((user) => employeeIds.includes(user.employeeId))
        : allUsers
      const report = []

      for (const user of users) {
        if (user.role === 'amtarikshian' || user.role === 'top_management') {
          const validation = await this.validateWorkHours(user.employeeId, date)

          let status: 'compliant' | 'deficit' | 'holiday' = 'compliant'
          if (validation.requiredHours === 0) {
            status = 'holiday'
          } else if (validation.deficit > 0) {
            status = 'deficit'
          }

          report.push({
            employeeId: user.employeeId,
            employeeName: user.name,
            requiredHours: validation.requiredHours,
            actualHours: validation.actualHours,
            deficit: validation.deficit,
            status
          })
        }
      }

      return report
    } catch (error) {
      console.error('Error generating work hours report:', error)
      return []
    }
  }
}
