import { NextRequest, NextResponse } from 'next/server'
import { getAllBugs, createBug, getLatestBugId } from '@/lib/db/bugs'
import { Bug } from '@/lib/types'
import { generateSequentialBugId } from '@/lib/data'
import { emailService } from '@/lib/email/service'
import { getUserByEmployeeId } from '@/lib/db/users'
import { createActivityLog } from '@/lib/db/activityLog'
import { getAuthUser, requireAuth } from '@/lib/auth-server'
import { getUserProjectIds } from '@/lib/db/project-users'
import { createNotification } from '@/lib/notification-helper'
import { workItemNoun, type WorkItemType } from '@/lib/workItemType'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined

    // Helper to parse array params
    const getArrayParam = (key: string) => {
      const val = searchParams.get(key)
      return val ? val.split(',').filter(Boolean) : undefined
    }

    const filters = {
      limit,
      offset,
      status: getArrayParam('status'),
      severity: getArrayParam('severity'),
      category: getArrayParam('category'),
      type: getArrayParam('type'),
      assignedTo: getArrayParam('assignedTo'),
      reportedBy: getArrayParam('reportedBy'),
      projectId: searchParams.get('projectId') || undefined,
      projectIds: getArrayParam('projectIds'),
      subprojectId: searchParams.get('subprojectId') || undefined,
      search: searchParams.get('search') || undefined
    }

    console.log('Fetching bugs data from MySQL with params:', filters)

    // Scope the list to the caller's company (migration 063).
    let bugs = await getAllBugs({ ...filters, companyId: auth.user.companyId ?? null })

    // Optional project-access scoping (used by Reports — option B)
    if (searchParams.get('scopeByUserProjects') === 'true') {
      const authUser = await getAuthUser(request)
      if (authUser && !['admin', 'top_management'].includes(authUser.role)) {
        const accessibleProjectIds = await getUserProjectIds(authUser.employeeId)
        const accessibleSet = new Set(accessibleProjectIds)
        bugs = bugs.filter((b: any) => !b.projectId || accessibleSet.has(b.projectId))
      }
    }

    return NextResponse.json({
      success: true,
      data: bugs,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to get bugs:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to get bugs'
    }, { status: 500 })
  }
}

/**
 * POST /api/bugs - Create a new bug
 *
 * This endpoint handles bug creation by:
 * 1. Validating required fields (title, description, reportedBy)
 * 2. Generating a unique bug ID
 * 3. Setting default values for status and reopenedCount
 * 4. Inserting the bug into MySQL database
 *
 * @param {NextRequest} request - The incoming request with bug data in JSON body
 * @returns {NextResponse} JSON response with created bug data or error
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const bugData = await request.json()

    // Validate required fields
    if (!bugData.title || !bugData.description || !bugData.reportedBy) {
      return NextResponse.json({
        success: false,
        error: 'Title, description, and reportedBy are required'
      }, { status: 400 })
    }

    // Generate sequential bug ID on server side
    const latestBugId = await getLatestBugId()
    const bugId = generateSequentialBugId(latestBugId)

    // Prepare bug object with all required fields
    // Convert undefined to null for MySQL compatibility
    const bugToCreate = {
      bugId,
      title: bugData.title,
      description: bugData.description,
      severity: bugData.severity || null,
      priority: bugData.priority || null,
      status: bugData.status || 'New', // Default to 'New' if not provided
      category: bugData.category || null,
      platform: bugData.platform || null,
      assignedTo: bugData.assignedTo || null,
      assignedBy: bugData.assignedBy || null,
      reportedBy: bugData.reportedBy,
      environment: bugData.environment || null,
      browserInfo: bugData.browserInfo || null,
      deviceInfo: bugData.deviceInfo || null,
      serverLogs: bugData.serverLogs || null,
      frontendLogs: bugData.frontendLogs || null,
      expectedBehavior: bugData.expectedBehavior || null,
      actualBehavior: bugData.actualBehavior || null,
      attachments: bugData.attachments || null,
      estimatedHours: bugData.estimatedHours || null,
      actualHours: bugData.actualHours || null,
      resolvedDate: bugData.resolvedDate || null,
      closedDate: bugData.closedDate || null,
      reopenedCount: bugData.reopenedCount || 0, // Default to 0 if not provided
      tags: bugData.tags || null,
      relatedBugs: bugData.relatedBugs || null,
      projectId: bugData.projectId || null,
      subprojectId: bugData.subprojectId || null,
      feature: bugData.feature || null,
      type: bugData.type || null,
      startDate: bugData.startDate || null,
      releaseState: bugData.releaseState || null
    }

    // Add bug to MySQL
    const bug = await createBug(bugToCreate)

    // Log bug creation activity
    try {
      await createActivityLog({
        entityType: 'bug',
        entityId: bug.bugId,
        userId: bug.reportedBy,
        actionType: 'created',
        description: `Bug created by ${bug.reportedBy}`,
        isComment: false
      })
    } catch (activityError) {
      console.error('⚠️ Failed to log bug creation activity:', activityError)
      // Don't fail bug creation if activity logging fails
    }

    // Fire-and-forget: In-app & Push notification (non-blocking) for bug assignment
    if (bug.assignedTo) {
      (async () => {
        try {
          const creator = await getUserByEmployeeId(bug.assignedBy || bug.reportedBy || 'system')
          // Features, bugs and releases share the bugs table; the in-app title
          // said "Bug" for all three while the emails already used the real noun.
          const noun = workItemNoun(bug.type as WorkItemType)
          const title = `New ${noun} Assigned`
          const message = `${creator?.name || bug.assignedBy || 'Someone'} assigned you ${noun.toLowerCase()}: ${bug.title}`
          
          await createNotification({
            userId: bug.assignedTo as string,
            actorId: bug.assignedBy || bug.reportedBy || 'system',
            notificationType: 'bug_assigned',
            bugId: bug.bugId,
            title,
            message,
            linkUrl: `/bugs/${bug.bugId}`
          })
        } catch (notifError) {
          console.error('⚠️ Failed to create bug assignment notification:', notifError)
        }
      })()
    }

    // Send email notification for bug creation
    // Don't fail bug creation if email fails
    try {
      if (emailService.isAvailable()) {
        // Get reporter details
        const reporter = await getUserByEmployeeId(bug.reportedBy)

        if (reporter) {
          await emailService.sendBugCreatedEmail({
            reporterEmail: reporter.email,
            reporterName: reporter.name,
            assigneeEmail: undefined, // Assignee receives their own assignment email via createNotification
            bugId: bug.bugId,
            bugTitle: bug.title,
            bugDescription: bug.description,
            status: bug.status,
            severity: bug.severity,
            priority: bug.priority,
            category: bug.category,
            platform: bug.platform,
            environment: bug.environment,
            // Without this a feature request was announced as a "Bug Report".
            type: bug.type,
          })

          console.log(`✅ Work item creation email sent to ${reporter.email}`)
        }
      }
    } catch (emailError) {
      console.error('⚠️ Failed to send bug creation email:', emailError)
      // Continue - don't fail bug creation if email fails
    }

    return NextResponse.json({
      success: true,
      data: bug,
      message: 'Bug created successfully'
    })
  } catch (error) {
    console.error('Failed to create bug:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create bug'
    }, { status: 500 })
  }
}
