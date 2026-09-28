import { NextRequest, NextResponse } from 'next/server'
import { getBugById, updateBug, deleteBug } from '@/lib/db/bugs'
import { emailService } from '@/lib/email/service'
import { getUserByEmployeeId } from '@/lib/db/users'
import { logEntityChanges, createActivityLog } from '@/lib/db/activityLog'
import { verifyToken, getAuthUser } from '@/lib/auth-server'
import { getUserProjectIds } from '@/lib/db/project-users'
import { createNotification } from '@/lib/notification-helper'
import { workItemNoun, type WorkItemType } from '@/lib/workItemType'
import { canEditWorkItem, isSameCompany } from '@/lib/authz'

/**
 * Check whether an authenticated user can access a specific bug.
 * Admin/top_management always allowed.
 * Others allowed if they're the reporter, an assignee, or a project member.
 */
async function canAccessBug(
  authUser: { employeeId: string; role: string; companyId?: string | null; isPlatformAdmin?: boolean },
  bug: any
): Promise<boolean> {
  // Tenant boundary BEFORE the role check. Without this an admin of one company
  // could read another company's bugs, because the role test never looked at
  // which company owned the record.
  if (!(await isSameCompany(authUser, bug?.companyId))) return false
  if (['admin', 'top_management'].includes(authUser.role)) return true
  if (bug.reportedBy === authUser.employeeId) return true
  if (bug.assignedTo === authUser.employeeId) return true
  if (bug.projectId) {
    const accessibleProjectIds = await getUserProjectIds(authUser.employeeId)
    if (accessibleProjectIds.includes(bug.projectId)) return true
  }
  return false
}

/**
 * May this user MODIFY the bug? Stricter than canAccessBug, which only governs
 * reading: being a project member is enough to view a bug but not to change it.
 *
 * Delegates to lib/authz.canEditWorkItem, so a project manager or team leader,
 * or anyone above the owner in the reporting chain (at any depth), qualifies —
 * this is what makes "managers can edit their reports' work" real.
 */
async function canModifyBug(
  authUser: { employeeId: string; role: string; companyId?: string | null; isPlatformAdmin?: boolean },
  bug: any
): Promise<boolean> {
  return canEditWorkItem(authUser, {
    projectId: bug?.projectId ?? null,
    ownerEmployeeId: bug?.assignedTo || bug?.reportedBy || null,
    companyId: bug?.companyId ?? null,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bugId: string }> }
) {
  try {
    const { bugId } = await params

    if (!bugId) {
      return NextResponse.json({
        success: false,
        error: 'Bug ID is required'
      }, { status: 400 })
    }

    const bug = await getBugById(bugId)

    if (!bug) {
      return NextResponse.json({
        success: false,
        error: 'Bug not found'
      }, { status: 404 })
    }

    // Project-access gate (option F)
    const authUser = await getAuthUser(request)
    if (authUser && !(await canAccessBug(authUser, bug))) {
      return NextResponse.json({
        success: false,
        error: 'You do not have access to this bug'
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: bug
    })
  } catch (error) {
    console.error(`Failed to get bug ${(await params).bugId}:`, error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get bug'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ bugId: string }> }
) {
  try {
    const { bugId } = await params
    const updates = await request.json()

    if (!bugId) {
      return NextResponse.json({
        success: false,
        error: 'Bug ID is required'
      }, { status: 400 })
    }

    // PUT previously had NO authorization check — it read the user only for the
    // activity log and fell back to 'system'. Any session could edit any bug.
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const userId = authUser.employeeId

    // Get the current bug state before updating
    const currentBug = await getBugById(bugId)

    if (!currentBug) {
      return NextResponse.json({ success: false, error: 'Bug not found' }, { status: 404 })
    }
    if (!(await canModifyBug(authUser, currentBug))) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit this item.' },
        { status: 403 }
      )
    }

    // Check if assignedTo field is changing (bug is being assigned/reassigned)
    const isAssignmentChange = updates.assignedTo && updates.assignedTo !== currentBug?.assignedTo
    const isStatusChange = updates.status && updates.status !== currentBug?.status
    const isSeverityChange = updates.severity && updates.severity !== currentBug?.severity

    // Update the bug
    const bug = await updateBug(bugId, updates)

    // Log all changes to activity log
    // Skip actualHours if it's being updated (handled manually in frontend with mode info)
    if (currentBug) {
      try {
        // Create a copy of updates without actualHours (it's logged manually with mode info)
        const updatesForLogging = { ...updates }
        if ('actualHours' in updatesForLogging) {
          delete updatesForLogging.actualHours
        }

        await logEntityChanges('bug', bugId, userId, currentBug, updatesForLogging, {
          status: 'Status',
          assignedTo: 'Assigned To',
          priority: 'Priority',
          severity: 'Severity',
          estimatedHours: 'Estimated Hours',
          actualHours: 'Actual Hours',
          title: 'Title',
          description: 'Description',
          category: 'Category',
          platform: 'Platform',
          environment: 'Environment'
        })
      } catch (activityError) {
        console.error('⚠️ Failed to log activity:', activityError)
        // Don't fail the update if activity logging fails
      }
    }

    // Send email notification is now handled automatically in createNotification below

    // Fire-and-forget: In-app & Push notification (non-blocking) for updates
    (async () => {
      try {
        const actor = await getUserByEmployeeId(userId)
        const actorName = actor?.name || userId || 'Someone'
        // Features, bugs and releases share the bugs table; these titles said
        // "Bug" for all three while the emails already used the real noun.
        const noun = workItemNoun(bug.type as WorkItemType)

        // 1. Assignment Change
        if (isAssignmentChange && bug.assignedTo) {
          const title = `New ${noun} Assigned`
          const message = `${actorName} assigned you ${noun.toLowerCase()}: ${bug.title}`
          await createNotification({
            userId: bug.assignedTo as string,
            actorId: userId,
            notificationType: 'bug_assigned',
            bugId: bug.bugId,
            title,
            message,
            linkUrl: `/bugs/${bug.bugId}`
          })
        }

        // 2. Status Change (Notify assignee and reporter)
        if (isStatusChange) {
          const title = `${noun} Status Changed`
          const message = `${actorName} updated ${bug.bugId} status to: ${bug.status}`
          const recipients = new Set<string>()
          if (bug.assignedTo) recipients.add(bug.assignedTo)
          if (bug.reportedBy) recipients.add(bug.reportedBy)
          
          // DO NOT notify the person who made the change
          recipients.delete(userId)

          for (const recipientId of Array.from(recipients)) {
            await createNotification({
              userId: recipientId,
              actorId: userId,
              notificationType: 'bug_status_changed',
              bugId: bug.bugId,
              title,
              message,
              linkUrl: `/bugs/${bug.bugId}`
            })
          }
        }

        // 3. Severity Change (Notify assignee and reporter)
        if (isSeverityChange) {
          const title = `${noun} Severity Changed`
          const message = `${actorName} updated ${bug.bugId} severity to: ${bug.severity}`
          const recipients = new Set<string>()
          if (bug.assignedTo) recipients.add(bug.assignedTo)
          if (bug.reportedBy) recipients.add(bug.reportedBy)
          
          // DO NOT notify the person who made the change
          recipients.delete(userId)

          for (const recipientId of Array.from(recipients)) {
            await createNotification({
              userId: recipientId,
              actorId: userId,
              notificationType: 'bug_severity_changed',
              bugId: bug.bugId,
              title,
              message,
              linkUrl: `/bugs/${bug.bugId}`
            })
          }
        }
      } catch (notifError) {
        console.error('⚠️ Failed to process bug update notifications:', notifError)
      }
    })()

    return NextResponse.json({
      success: true,
      data: bug,
      message: 'Bug updated successfully'
    })
  } catch (error) {
    console.error(`Failed to update bug ${(await params).bugId}:`, error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update bug'
    }, { status: 500 })
  }
}

// PATCH handler (alias for PUT to support both methods)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bugId: string }> }
) {
  return PUT(request, { params })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bugId: string }> }
) {
  try {
    const { bugId } = await params

    if (!bugId) {
      return NextResponse.json({
        success: false,
        error: 'Bug ID is required'
      }, { status: 400 })
    }

    // DELETE previously had NO authorization check either.
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const userId = user.employeeId

    const bugToDelete = await getBugById(bugId)
    if (!bugToDelete) {
      return NextResponse.json({ success: false, error: 'Bug not found' }, { status: 404 })
    }
    if (!(await canModifyBug(user, bugToDelete))) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this item.' },
        { status: 403 }
      )
    }

    // Log deletion activity before deleting
    try {
      await createActivityLog({
        entityType: 'bug',
        entityId: bugId,
        userId,
        actionType: 'deleted',
        description: 'Bug deleted',
        isComment: false
      })
    } catch (activityError) {
      console.error('⚠️ Failed to log deletion activity:', activityError)
      // Continue with deletion even if logging fails
    }

    await deleteBug(bugId)

    return NextResponse.json({
      success: true,
      message: 'Bug deleted successfully'
    })
  } catch (error) {
    console.error(`Failed to delete bug ${(await params).bugId}:`, error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete bug'
    }, { status: 500 })
  }
}
