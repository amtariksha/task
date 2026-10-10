import { NextRequest, NextResponse } from 'next/server'
import { getSubtasksByParentDevId } from '@/lib/db/bugs'

/**
 * GET /api/bugs/subtasks?parentDevId=BUG-0001
 * Get all subtasks for a parent bug
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parentDevId = searchParams.get('parentDevId')

    if (!parentDevId) {
      return NextResponse.json({
        success: false,
        error: 'parentDevId is required'
      }, { status: 400 })
    }

    const subtasks = await getSubtasksByParentDevId(parentDevId)

    return NextResponse.json({
      success: true,
      data: subtasks
    })
  } catch (error) {
    console.error('❌ [BUG-SUBTASKS-GET] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch bug subtasks'
    }, { status: 500 })
  }
}

