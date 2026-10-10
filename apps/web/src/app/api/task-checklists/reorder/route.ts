import { NextRequest, NextResponse } from 'next/server'
import { reorderSubTasks } from '@/lib/db/taskChecklists'

/**
 * POST /api/subtasks/reorder
 * Reorder subtasks (for drag-and-drop functionality)
 * Body: {
 *   parentTaskId: string
 *   subtaskIds: number[]  // Array of subtask IDs in the new order
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { parentTaskId, subtaskIds } = body

    // Validation
    if (!parentTaskId || !Array.isArray(subtaskIds) || subtaskIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'parentTaskId and subtaskIds array are required'
        },
        { status: 400 }
      )
    }

    await reorderSubTasks(parentTaskId, subtaskIds)

    return NextResponse.json({
      success: true,
      message: 'Subtasks reordered successfully'
    })
  } catch (error) {
    console.error('SubTasks reorder API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reorder subtasks'
      },
      { status: 500 }
    )
  }
}

