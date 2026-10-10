import { NextRequest, NextResponse } from 'next/server'
import {
  getBugSubTaskById,
  updateBugSubTask,
  softDeleteBugSubTask,
  restoreBugSubTask
} from '@/lib/db/bugSubtasks'

/**
 * GET /api/bug-subtasks/[id]
 * Get a single bug subtask by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const subtaskId = parseInt(id)

    if (isNaN(subtaskId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid bug subtask ID'
        },
        { status: 400 }
      )
    }

    const subtask = await getBugSubTaskById(subtaskId)

    if (!subtask) {
      return NextResponse.json(
        {
          success: false,
          error: 'Bug subtask not found'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: subtask
    })
  } catch (error) {
    console.error('Bug SubTask API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch bug subtask'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/bug-subtasks/[id]
 * Update a bug subtask
 * Body: {
 *   description?: string
 *   assignedTo?: string
 *   status?: 'Not Started' | 'In Progress' | 'Completed'
 *   isCompleted?: boolean
 *   displayOrder?: number
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const subtaskId = parseInt(id)

    if (isNaN(subtaskId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid bug subtask ID'
        },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { description, assignedTo, status, isCompleted, displayOrder } = body

    const updatedBugSubTask = await updateBugSubTask(subtaskId, {
      description,
      assignedTo,
      status,
      isCompleted,
      displayOrder
    })

    return NextResponse.json({
      success: true,
      data: updatedBugSubTask,
      message: 'Bug subtask updated successfully'
    })
  } catch (error) {
    console.error('Bug SubTask API PATCH error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update bug subtask'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/bug-subtasks/[id]
 * Soft delete a bug subtask
 * Query params:
 * - deletedBy: string (required - employee ID)
 * - restore: boolean (optional - restore a deleted bug subtask)
 */
// PUT handler (alias for PATCH to support both methods)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const subtaskId = parseInt(id)

    if (isNaN(subtaskId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid bug subtask ID'
        },
        { status: 400 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const deletedBy = searchParams.get('deletedBy')
    const restore = searchParams.get('restore') === 'true'

    // Restore bug subtask
    if (restore) {
      const restoredBugSubTask = await restoreBugSubTask(subtaskId)
      return NextResponse.json({
        success: true,
        data: restoredBugSubTask,
        message: 'Bug subtask restored successfully'
      })
    }

    // Soft delete bug subtask
    if (!deletedBy) {
      return NextResponse.json(
        {
          success: false,
          error: 'deletedBy is required'
        },
        { status: 400 }
      )
    }

    await softDeleteBugSubTask(subtaskId, deletedBy)

    return NextResponse.json({
      success: true,
      message: 'Bug subtask deleted successfully'
    })
  } catch (error) {
    console.error('Bug SubTask API DELETE error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete bug subtask'
      },
      { status: 500 }
    )
  }
}

