/**
 * API Route: /api/feed/topics/[topicId]
 * Purpose: Update or delete a specific feed topic (admin only)
 * Methods: PATCH, DELETE
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/config'
import { getAuthUser } from '@/lib/auth-server'

/**
 * PATCH /api/feed/topics/[topicId]
 * Update a topic (admin only)
 * Body: { topicName?, description?, icon?, displayOrder? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    // Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has feed_topics permission
    const userResult = await query(
      `SELECT tab_permissions FROM users WHERE employee_id = $1`,
      [user.employeeId]
    )

    const tabPermissions = userResult[0]?.tab_permissions || []
    if (!tabPermissions.includes('feed_topics')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Feed Topics permission required' },
        { status: 403 }
      )
    }

    const { topicId } = await params
    const body = await request.json()
    const { topicName, description, icon, displayOrder } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (topicName !== undefined) {
      updates.push(`topic_name = $${paramIndex++}`)
      values.push(topicName)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description)
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`)
      values.push(icon)
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`)
      values.push(displayOrder)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    values.push(topicId)
    const topicIdParam = values.length

    // The tab permission alone said nothing about WHICH company's topics, so
    // someone holding it could rename another tenant's topics by id. A
    // cross-company id now simply does not match, and the handler answers 404.
    let companyPredicate = ''
    if (user.companyId && !user.isPlatformAdmin) {
      values.push(user.companyId)
      companyPredicate = ` AND (company_id IS NULL OR company_id = $${values.length})`
    }

    const result = await query(
      `UPDATE feed_topics 
       SET ${updates.join(', ')}
       WHERE id = $${topicIdParam} AND deleted_at IS NULL${companyPredicate}
       RETURNING *`,
      values
    )

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result[0]
    })
  } catch (error: any) {
    console.error('Error updating feed topic:', error)

    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'Topic name already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update topic' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/feed/topics/[topicId]
 * Soft delete a topic (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    // Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user has feed_topics permission
    const userResult = await query(
      `SELECT tab_permissions FROM users WHERE employee_id = $1`,
      [user.employeeId]
    )

    const tabPermissions = userResult[0]?.tab_permissions || []
    if (!tabPermissions.includes('feed_topics')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Feed Topics permission required' },
        { status: 403 }
      )
    }

    const { topicId } = await params

    // Soft delete the topic. Same company predicate as PATCH: the tab permission
    // does not say which tenant's topics the caller may remove.
    const values: any[] = [user.employeeId, topicId]
    let companyPredicate = ''
    if (user.companyId && !user.isPlatformAdmin) {
      values.push(user.companyId)
      companyPredicate = ` AND (company_id IS NULL OR company_id = $${values.length})`
    }

    const result = await query(
      `UPDATE feed_topics 
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1
       WHERE id = $2 AND deleted_at IS NULL${companyPredicate}
       RETURNING *`,
      values
    )

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Topic not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Topic deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting feed topic:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete topic' },
      { status: 500 }
    )
  }
}

