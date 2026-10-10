import { NextRequest, NextResponse } from 'next/server'
import {
  getSubTasksByParentTaskId,
  getSubTasksByAssignedTo,
  createSubTask,
  getSubTaskCount,
  getAllDeletedSubTasks
} from '@/lib/db/taskChecklists'
import { withTimeout } from '@/lib/db/config'

/**
 * GET /api/subtasks
 * Get subtasks by parent task ID, assigned user, or get all deleted subtasks
 * Query params:
 * - parentTaskId: string (optional, for subtasks of a specific task)
 * - assignedTo: string (optional, for subtasks assigned to a specific user)
 * - includeDeleted: boolean (optional, for admin)
 */
export async function GET(request: NextRequest) {
  console.log('🔵 [SUBTASKS-GET] API called')

  try {
    const searchParams = request.nextUrl.searchParams
    const parentTaskId = searchParams.get('parentTaskId')
    const assignedTo = searchParams.get('assignedTo')
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    console.log('🔵 [SUBTASKS-GET] Params:', { parentTaskId, assignedTo, includeDeleted })

    // Get all deleted subtasks (for admin "Deleted Items" page)
    if (includeDeleted && !parentTaskId) {
      console.log('🔵 [SUBTASKS-GET] Fetching deleted subtasks...')
      const deletedSubTasks = await getAllDeletedSubTasks()
      console.log(`✅ [SUBTASKS-GET] Found ${deletedSubTasks.length} deleted subtasks`)
      return NextResponse.json({
        success: true,
        data: deletedSubTasks,
        count: deletedSubTasks.length
      })
    }

    // Get subtasks assigned to a specific user
    if (assignedTo) {
      console.log('🔵 [SUBTASKS-GET] Fetching subtasks by assignedTo...')
      const subtasks = await withTimeout(
        getSubTasksByAssignedTo(assignedTo),
        10000,
        'Failed to fetch subtasks by assignedTo - database timeout'
      )
      console.log(`✅ [SUBTASKS-GET] Found ${subtasks.length} subtasks assigned to ${assignedTo}`)
      return NextResponse.json({
        success: true,
        data: subtasks,
        count: subtasks.length
      })
    }

    // Get subtasks for a specific parent task
    if (!parentTaskId) {
      console.log('❌ [SUBTASKS-GET] Missing parentTaskId or assignedTo')
      return NextResponse.json(
        {
          success: false,
          error: 'Either parentTaskId or assignedTo is required'
        },
        { status: 400 }
      )
    }

    // Fetch subtasks and stats in parallel with timeout to prevent hanging
    console.log('🔵 [SUBTASKS-GET] Fetching subtasks and counts...')
    const [subtasks, counts] = await Promise.all([
      withTimeout(
        getSubTasksByParentTaskId(parentTaskId),
        10000,
        'Failed to fetch subtasks - database timeout'
      ),
      withTimeout(
        getSubTaskCount(parentTaskId),
        10000,
        'Failed to fetch subtask counts - database timeout'
      )
    ])

    console.log(`✅ [SUBTASKS-GET] Found ${subtasks.length} subtasks for parent ${parentTaskId}`)

    return NextResponse.json({
      success: true,
      data: subtasks,
      count: subtasks.length,
      stats: counts
    })
  } catch (error) {
    console.error('❌ [SUBTASKS-GET] SubTasks API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch subtasks'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/subtasks
 * Create a new subtask
 * Body: {
 *   parentTaskId: string
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
    const { parentTaskId, description, assignedTo, status, isCompleted, displayOrder, createdBy } = body

    // Validation
    if (!parentTaskId || !description || !assignedTo || !createdBy) {
      return NextResponse.json(
        {
          success: false,
          error: 'parentTaskId, description, assignedTo, and createdBy are required'
        },
        { status: 400 }
      )
    }

    const newSubTask = await createSubTask({
      parentTaskId,
      description,
      assignedTo,
      status,
      isCompleted,
      displayOrder,
      createdBy
    })

    return NextResponse.json({
      success: true,
      data: newSubTask,
      message: 'Subtask created successfully'
    })
  } catch (error) {
    console.error('SubTasks API POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create subtask'
      },
      { status: 500 }
    )
  }
}

