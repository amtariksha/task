import { NextRequest, NextResponse } from 'next/server'
import { updateTask, deleteTask, getTaskById, getAllTasks } from '@/lib/db/tasks'
import { calculateTotalHours } from '@/lib/dailyHours'
import { logEntityChanges, createActivityLog } from '@/lib/db/activityLog'
import { verifyToken, getAuthUser } from '@/lib/auth-server'
import { getUserByEmployeeId } from '@/lib/db/users'
import { emailService } from '@/lib/email/service'
import { getUserProjectIds } from '@/lib/db/project-users'
import { createNotification } from '@/lib/notification-helper'
import { canEditWorkItem, isSameCompany } from '@/lib/authz'
// Modify rule shared with the GraphQL updateTask / deleteTask mutations.
import { canModifyTask } from '@/lib/tasks/task-access'

/**
 * Check whether an authenticated user can access a specific task.
 * Admin/top_management always allowed.
 * Others allowed if they're an assignee, the assigner, a supporter, or a project member.
 */
async function canAccessTask(
  authUser: { employeeId: string; role: string; companyId?: string | null; isPlatformAdmin?: boolean },
  task: any
): Promise<boolean> {
  // Tenant boundary BEFORE the role check — see the bugs route for why.
  if (!(await isSameCompany(authUser, task?.companyId))) return false
  if (['admin', 'top_management'].includes(authUser.role)) return true
  // assignedTo can be array (multi-assignee) or string (legacy)
  if (Array.isArray(task.assignedTo) && task.assignedTo.includes(authUser.employeeId)) return true
  if (typeof task.assignedTo === 'string' && task.assignedTo === authUser.employeeId) return true
  if (task.assignedBy === authUser.employeeId) return true
  if (Array.isArray(task.support) && task.support.includes(authUser.employeeId)) return true
  if (task.projectId) {
    const accessibleProjectIds = await getUserProjectIds(authUser.employeeId)
    if (accessibleProjectIds.includes(task.projectId)) return true
  }
  return false
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params

    // Get task from MySQL
    const task = await getTaskById(taskId)

    if (!task) {
      return NextResponse.json({
        success: false,
        error: 'Task not found'
      }, { status: 404 })
    }

    // Project-access gate (option F)
    const authUser = await getAuthUser(request)
    if (authUser && !(await canAccessTask(authUser, task))) {
      return NextResponse.json({
        success: false,
        error: 'You do not have access to this task'
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: task,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to fetch task from MySQL:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch task'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const updates = await request.json()

    // PUT previously had NO authorization check — it read the user only for the
    // activity log and fell back to 'system'. Any session could edit any task.
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const userId = authUser.employeeId

    // Basic validation for positive numbers
    if (updates.estimatedHours && updates.estimatedHours < 0) {
      return NextResponse.json({
        success: false,
        error: 'Estimated hours must be a positive number'
      }, { status: 400 })
    }

    // Basic validation for positive numbers
    if (updates.actualHours && updates.actualHours < 0) {
      return NextResponse.json({
        success: false,
        error: 'Actual hours must be a positive number'
      }, { status: 400 })
    }

    // Get current task state before updating (for activity logging)
    const currentTask = await getTaskById(taskId)

    if (!currentTask) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (!(await canModifyTask(authUser, currentTask, { canEditWorkItem }))) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit this task.' },
        { status: 403 }
      )
    }

    // Convert assignedTo from string to array if needed (for PostgreSQL JSONB array constraint)
    if (updates.assignedTo !== undefined && typeof updates.assignedTo === 'string') {
      updates.assignedTo = [updates.assignedTo]
    }

    // Convert support from string to array if needed (for PostgreSQL JSONB array constraint)
    if (updates.support !== undefined && typeof updates.support === 'string') {
      updates.support = updates.support ? [updates.support] : []
    }

    // Update task in MySQL
    const task = await updateTask(taskId, updates)

    // Log all changes to activity log
    if (currentTask) {
      try {
        await logEntityChanges('task', taskId, userId, currentTask, updates, {
          name: 'Task Name',
          status: 'Status',
          assignedTo: 'Assigned To',
          priority: 'Priority',
          estimatedHours: 'Estimated Hours',
          actualHours: 'Actual Hours',
          description: 'Description',
          startDate: 'Start Date',
          endDate: 'End Date',
          selectType: 'Task Type',
          recursiveType: 'Recursive Type'
        })
      } catch (activityError) {
        console.error('⚠️ Failed to log activity:', activityError)
        // Don't fail the update if activity logging fails
      }
    }

    // Fire-and-forget: In-app & Push notifications for status updates (non-blocking)
    if (updates.status && currentTask && currentTask.status !== updates.status) {
      (async () => {
        try {
          const editor = await getUserByEmployeeId(userId)
          const editorName = editor?.name || userId

          // Collect all unique user IDs connected to this task
          const connectedUserIds = new Set<string>()
          
          if (Array.isArray(currentTask.assignedTo)) {
            currentTask.assignedTo.forEach((id: string) => connectedUserIds.add(id))
          } else if (typeof currentTask.assignedTo === 'string' && currentTask.assignedTo) {
            connectedUserIds.add(currentTask.assignedTo)
          }

          if (Array.isArray(currentTask.support)) {
            currentTask.support.forEach((id: string) => connectedUserIds.add(id))
          } else if (typeof currentTask.support === 'string' && currentTask.support) {
            connectedUserIds.add(currentTask.support)
          }

          if (currentTask.assignedBy) connectedUserIds.add(currentTask.assignedBy)

          // Exclude the user who did the update, unless it is a self-assigned task
          const isSelfTask = Array.isArray(currentTask.assignedTo)
            ? currentTask.assignedTo.includes(userId)
            : currentTask.assignedTo === userId
          if (!isSelfTask) {
            connectedUserIds.delete(userId)
          }

          if (connectedUserIds.size > 0) {
            const title = 'Task Status Changed'
            const message = `${editorName} updated ${taskId} status to ${updates.status}`
            const notificationType = updates.status === 'Done' ? 'task_completed' : 'task_updated'
            const recipientsArray = Array.from(connectedUserIds)

            for (const recipientId of recipientsArray) {
              await createNotification({
                userId: recipientId,
                actorId: userId,
                notificationType,
                taskId,
                title,
                message,
                linkUrl: `/tasks/${taskId}`
              })
            }
          }
        } catch (notifError) {
          console.error('⚠️ Failed to create task status update notifications:', notifError)
        }
      })()
    }

    // Handle support task closure notifications
    if (updates.status && currentTask && currentTask.status !== updates.status) {
      try {
        // Check if this is a support task being closed
        const isSupportTask = currentTask.description?.startsWith('[SUPPORT]')
        const isClosedStatus = updates.status === 'Done' || updates.status === 'Cancel' || updates.status === 'Stop'


        if (isSupportTask && isClosedStatus) {
          // Extract main task ID from remarks
          const match = currentTask.remarks?.match(/Support task for main task: (.+)/)
          const mainTaskId = match ? match[1] : null

          if (mainTaskId) {
            const mainTask = await getTaskById(mainTaskId)
            if (mainTask) {
              // Get support member and main task assignee details
              // Handle both old (string) and new (array) assignedTo format
              const currentAssignee = Array.isArray(currentTask.assignedTo)
                ? currentTask.assignedTo[0]
                : currentTask.assignedTo
              const mainAssignee = Array.isArray(mainTask.assignedTo)
                ? mainTask.assignedTo[0]
                : mainTask.assignedTo

              const supportMember = await getUserByEmployeeId(currentAssignee)
              const mainTaskAssignee = await getUserByEmployeeId(mainAssignee)

              // Add activity log to main task
              await createActivityLog({
                entityType: 'task',
                entityId: mainTaskId,
                userId: currentAssignee,
                actionType: 'support_task_closed',
                description: `Support task ${currentTask.taskId} completed by ${supportMember?.name || currentAssignee}`,
                isComment: false
              })

              // Add comment to main task
              await createActivityLog({
                entityType: 'task',
                entityId: mainTaskId,
                userId: currentAssignee,
                actionType: 'comment',
                description: `Support task ${currentTask.taskId} has been ${updates.status.toLowerCase()}. ${supportMember?.name || currentAssignee} has completed their support work.`,
                isComment: true
              })

              // Send email notification to main task assignee
              if (emailService.isAvailable() && mainTaskAssignee) {
                try {
                  await emailService.sendEmail({
                    to: mainTaskAssignee.email,
                    subject: `✅ Support Task Completed: ${mainTask.description}`,
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #10b981;">Support Task Completed</h2>
                        <p>Hi ${mainTaskAssignee.name},</p>
                        <p><strong>${supportMember?.name || currentAssignee}</strong> has completed their support work on your task:</p>
                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                          <p style="margin: 5px 0;"><strong>Main Task:</strong> ${mainTask.description}</p>
                          <p style="margin: 5px 0;"><strong>Task ID:</strong> ${mainTaskId}</p>
                          <p style="margin: 5px 0;"><strong>Support Task ID:</strong> ${currentTask.taskId}</p>
                          <p style="margin: 5px 0;"><strong>Status:</strong> ${updates.status}</p>
                        </div>
                        <p>You can view the task details and activity log for more information.</p>
                        <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
                          This is an automated notification from JSR Task Management System.
                        </p>
                      </div>
                    `,
                    priority: 'normal',
                    type: 'task_created'
                  })
                  console.log(`✅ Support task closure notification sent to ${mainTaskAssignee.email}`)
                } catch (emailError) {
                  console.error('⚠️ Failed to send support task closure email:', emailError)
                }
              }
            }
          }
        }

        // Check if main task is being closed - auto-close all support tasks
        if (isClosedStatus && !isSupportTask) {
          const allTasks = await getAllTasks()
          const supportTasks = allTasks.filter((t: any) =>
            t.description?.startsWith('[SUPPORT]') &&
            t.remarks?.includes(`Support task for main task: ${taskId}`) &&
            t.status !== 'Done' &&
            t.status !== 'Cancel' &&
            t.status !== 'Stop'
          )

          for (const supportTask of supportTasks) {
            try {
              await updateTask(supportTask.taskId, { status: updates.status })
              await createActivityLog({
                entityType: 'task',
                entityId: supportTask.taskId,
                userId: 'system',
                actionType: 'status_changed',
                description: `Auto-closed because main task ${taskId} was ${updates.status.toLowerCase()}`,
                isComment: false
              })
              console.log(`✅ Auto-closed support task ${supportTask.taskId}`)
            } catch (error) {
              console.error(`⚠️ Failed to auto-close support task ${supportTask.taskId}:`, error)
            }
          }
        }
      } catch (supportError) {
        console.error('⚠️ Failed to handle support task logic:', supportError)
        // Don't fail the main update if support task logic fails
      }
    }

    return NextResponse.json({
      success: true,
      data: task,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to update task in MySQL:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update task'
    }, { status: 500 })
  }
}

// PATCH handler (alias for PUT to support both methods)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  return PUT(request, { params })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params

    // DELETE previously had NO authorization check either.
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const userId = user.employeeId

    const taskToDelete = await getTaskById(taskId)
    if (!taskToDelete) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (!(await canModifyTask(user, taskToDelete, { canEditWorkItem }))) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this task.' },
        { status: 403 }
      )
    }

    // Log deletion activity before deleting
    try {
      await createActivityLog({
        entityType: 'task',
        entityId: taskId,
        userId,
        actionType: 'deleted',
        description: 'Task deleted',
        isComment: false
      })
    } catch (activityError) {
      console.error('⚠️ Failed to log deletion activity:', activityError)
      // Continue with deletion even if logging fails
    }

    // Delete task from MySQL
    await deleteTask(taskId)
    return NextResponse.json({
      success: true,
      data: true,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to delete task from MySQL:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete task'
    }, { status: 500 })
  }
}
