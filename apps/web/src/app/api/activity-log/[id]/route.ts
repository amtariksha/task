// Activity Log API Routes - Single Entry Operations
// Handles DELETE (delete comment)

import { NextRequest, NextResponse } from 'next/server'
import { isApplicationError } from '@/lib/api/client-error'
import { deleteActivityLog, getActivityLogById } from '@/lib/db/activityLog'
import { verifyToken } from '@/lib/auth-server'

/**
 * DELETE /api/activity-log/[id]
 * Delete a comment (only comments can be deleted, not system activities)
 * Only the comment author can delete their own comments
 * 
 * @param id - Activity log entry ID
 * 
 * @example
 * DELETE /api/activity-log/123
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const user = verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    // Unwrap params Promise
    const { id: idParam } = await params

    // Parse ID
    const id = parseInt(idParam)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid activity log ID' },
        { status: 400 }
      )
    }

    // Delete the comment
    const deleted = await deleteActivityLog(id, user.employeeId)

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete comment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully'
    })

  } catch (error) {
    console.error('❌ Error deleting activity log:', error)
    // Only the data layer's own refusals are matched by their wording.
    const errorMessage = isApplicationError(error) ? error.message : ''

    // Handle specific error messages
    if (errorMessage.includes('not found')) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 }
      )
    }
    
    if (errorMessage.includes('Cannot delete system-generated')) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete system-generated activities' },
        { status: 403 }
      )
    }
    
    if (errorMessage.includes('only delete your own')) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own comments' },
        { status: 403 }
      )
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to delete comment' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/activity-log/[id]
 * Get a single activity log entry by ID
 * 
 * @param id - Activity log entry ID
 * 
 * @example
 * GET /api/activity-log/123
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const user = verifyToken(token)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    // Unwrap params Promise
    const { id: idParam } = await params

    // Parse ID
    const id = parseInt(idParam)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid activity log ID' },
        { status: 400 }
      )
    }

    // Fetch the activity log entry
    const activity = await getActivityLogById(id)

    if (!activity) {
      return NextResponse.json(
        { success: false, error: 'Activity log entry not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: activity
    })

  } catch (error) {
    console.error('❌ Error fetching activity log:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity log' },
      { status: 500 }
    )
  }
}

