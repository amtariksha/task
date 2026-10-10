import { NextRequest, NextResponse } from 'next/server'
import {
  getSubTaskById,
  updateSubTask,
  softDeleteSubTask,
  restoreSubTask
} from '@/lib/db/taskChecklists'

/**
 * GET /api/subtasks/[id]
 * Get a single subtask by ID
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
          error: 'Invalid subtask ID'
        },
        { status: 400 }
      )
    }

    const subtask = await getSubTaskById(subtaskId)

    if (!subtask) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subtask not found'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: subtask
    })
  } catch (error) {
    console.error('SubTask API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch subtask'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/subtasks/[id]
 * Update a subtask
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
          error: 'Invalid subtask ID'
        },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { description, assignedTo, status, isCompleted, displayOrder } = body

    const updatedSubTask = await updateSubTask(subtaskId, {
      description,
      assignedTo,
      status,
      isCompleted,
      displayOrder
    })

    return NextResponse.json({
      success: true,
      data: updatedSubTask,
      message: 'Subtask updated successfully'
    })
  } catch (error) {
    console.error('SubTask API PATCH error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update subtask'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/subtasks/[id]
 * Soft delete a subtask
 * Query params:
 * - deletedBy: string (required - employee ID)
 * - restore: boolean (optional - restore a deleted subtask)
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
          error: 'Invalid subtask ID'
        },
        { status: 400 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const deletedBy = searchParams.get('deletedBy')
    const restore = searchParams.get('restore') === 'true'

    // Restore subtask
    if (restore) {
      const restoredSubTask = await restoreSubTask(subtaskId)
      return NextResponse.json({
        success: true,
        data: restoredSubTask,
        message: 'Subtask restored successfully'
      })
    }

    // Soft delete subtask
    if (!deletedBy) {
      return NextResponse.json(
        {
          success: false,
          error: 'deletedBy is required'
        },
        { status: 400 }
      )
    }

    await softDeleteSubTask(subtaskId, deletedBy)

    return NextResponse.json({
      success: true,
      message: 'Subtask deleted successfully'
    })
  } catch (error) {
    console.error('SubTask API DELETE error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete subtask'
      },
      { status: 500 }
    )
  }
}

