import { NextRequest, NextResponse } from 'next/server'
import {
  getBugSubTasksByParentBugId,
  getBugSubTasksByAssignedTo,
  createBugSubTask,
  getBugSubTaskCount,
  getAllDeletedBugSubTasks
} from '@/lib/db/bugSubtasks'
import { withTimeout } from '@/lib/db/config'

/**
 * GET /api/bug-subtasks
 * Get bug subtasks by parent bug ID, assigned user, or get all deleted bug subtasks
 * Query params:
 * - parentBugId: string (optional, for subtasks of a specific bug)
 * - assignedTo: string (optional, for subtasks assigned to a specific user)
 * - includeDeleted: boolean (optional, for admin)
 */
export async function GET(request: NextRequest) {
  console.log('🔵 [BUG-SUBTASKS-GET] API called')

  try {
    const searchParams = request.nextUrl.searchParams
    const parentBugId = searchParams.get('parentBugId')
    const assignedTo = searchParams.get('assignedTo')
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    console.log('🔵 [BUG-SUBTASKS-GET] Params:', { parentBugId, assignedTo, includeDeleted })

    // Get all deleted bug subtasks (for admin "Deleted Items" page)
    if (includeDeleted && !parentBugId) {
      console.log('🔵 [BUG-SUBTASKS-GET] Fetching deleted bug subtasks...')
      const deletedBugSubTasks = await getAllDeletedBugSubTasks()
      console.log(`✅ [BUG-SUBTASKS-GET] Found ${deletedBugSubTasks.length} deleted bug subtasks`)
      return NextResponse.json({
        success: true,
        data: deletedBugSubTasks,
        count: deletedBugSubTasks.length
      })
    }

    // Get bug subtasks assigned to a specific user
    if (assignedTo) {
      console.log('🔵 [BUG-SUBTASKS-GET] Fetching bug subtasks by assignedTo...')
      const subtasks = await withTimeout(
        getBugSubTasksByAssignedTo(assignedTo),
        10000,
        'Failed to fetch bug subtasks by assignedTo - database timeout'
      )
      console.log(`✅ [BUG-SUBTASKS-GET] Found ${subtasks.length} bug subtasks assigned to ${assignedTo}`)
      return NextResponse.json({
        success: true,
        data: subtasks,
        count: subtasks.length
      })
    }

    // Get subtasks for a specific parent bug
    if (!parentBugId) {
      console.log('❌ [BUG-SUBTASKS-GET] Missing parentBugId or assignedTo')
      return NextResponse.json(
        {
          success: false,
          error: 'Either parentBugId or assignedTo is required'
        },
        { status: 400 }
      )
    }

    // Fetch subtasks and stats in parallel with timeout to prevent hanging
    console.log('🔵 [BUG-SUBTASKS-GET] Fetching bug subtasks and counts...')
    const [subtasks, counts] = await Promise.all([
      withTimeout(
        getBugSubTasksByParentBugId(parentBugId),
        10000,
        'Failed to fetch bug subtasks - database timeout'
      ),
      withTimeout(
        getBugSubTaskCount(parentBugId),
        10000,
        'Failed to fetch bug subtask counts - database timeout'
      )
    ])

    console.log(`✅ [BUG-SUBTASKS-GET] Found ${subtasks.length} subtasks for parent bug ${parentBugId}`)

    return NextResponse.json({
      success: true,
      data: subtasks,
      count: subtasks.length,
      stats: counts
    })
  } catch (error) {
    console.error('❌ [BUG-SUBTASKS-GET] Bug SubTasks API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch bug subtasks'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/bug-subtasks
 * Create a new bug subtask
 * Body: {
 *   parentBugId: string
 *   description: string
 *   assignedTo: string
 *   status?: 'Not Started' | 'In Progress' | 'Completed'
 *   isCompleted?: boolean
 *   displayOrder?: number
 *   createdBy: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { parentBugId, description, assignedTo, status, isCompleted, displayOrder, createdBy } = body

    // Validation
    if (!parentBugId || !description || !assignedTo || !createdBy) {
      return NextResponse.json(
        {
          success: false,
          error: 'parentBugId, description, assignedTo, and createdBy are required'
        },
        { status: 400 }
      )
    }

    const newBugSubTask = await createBugSubTask({
      parentBugId,
      description,
      assignedTo,
      status,
      isCompleted,
      displayOrder,
      createdBy
    })

    return NextResponse.json({
      success: true,
      data: newBugSubTask,
      message: 'Bug subtask created successfully'
    })
  } catch (error) {
    console.error('Bug SubTasks API POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create bug subtask'
      },
      { status: 500 }
    )
  }
}

