import { NextRequest, NextResponse } from 'next/server'
import { reorderBugSubTasks } from '@/lib/db/bugSubtasks'

/**
 * POST /api/bug-subtasks/reorder
 * Reorder bug subtasks (for drag-and-drop functionality)
 * Body: {
 *   parentBugId: string
 *   subtaskIds: number[]  // Array of subtask IDs in the new order
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { parentBugId, subtaskIds } = body

    // Validation
    if (!parentBugId || !Array.isArray(subtaskIds) || subtaskIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'parentBugId and subtaskIds array are required'
        },
        { status: 400 }
      )
    }

    await reorderBugSubTasks(parentBugId, subtaskIds)

    return NextResponse.json({
      success: true,
      message: 'Bug subtasks reordered successfully'
    })
  } catch (error) {
    console.error('Bug SubTasks reorder API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reorder bug subtasks'
      },
      { status: 500 }
    )
  }
}

