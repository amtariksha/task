import { NextRequest, NextResponse } from 'next/server'
import { getSubtasksByParentId } from '@/lib/db/tasks'

/**
 * GET /api/tasks/subtasks?parentTaskId=JSR-0001
 * Get all subtasks for a parent task
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parentTaskId = searchParams.get('parentTaskId')

    if (!parentTaskId) {
      return NextResponse.json({
        success: false,
        error: 'parentTaskId is required'
      }, { status: 400 })
    }

    const subtasks = await getSubtasksByParentId(parentTaskId)

    return NextResponse.json({
      success: true,
      data: subtasks
    })
  } catch (error) {
    console.error('❌ [SUBTASKS-GET] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch subtasks'
    }, { status: 500 })
  }
}

