/**
 * API Route: /api/feed/topics
 * Purpose: Manage feed topics (public topics + user-specific Personal Notes and Saved Posts)
 * Methods: GET, POST, PATCH, DELETE
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/config'
import { getAuthUser } from '@/lib/auth-server'

/**
 * GET /api/feed/topics
 * Query params:
 * - includePersonal: boolean (default: true) - Include user's Personal Notes and Saved Posts topics
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const includePersonal = searchParams.get('includePersonal') !== 'false' // Default true

    // Build query to fetch topics
    let sql = `
      SELECT 
        id,
        topic_name,
        description,
        icon,
        display_order,
        is_personal,
        is_saved,
        owner_user_id,
        created_at,
        created_by
      FROM feed_topics
      WHERE deleted_at IS NULL
    `

    const params: any[] = []

    if (includePersonal) {
      // Include public topics + user's personal/saved topics
      sql += ` AND (owner_user_id IS NULL OR owner_user_id = $1)`
      params.push(user.employeeId)
    } else {
      // Only public topics - explicitly exclude personal topics
      sql += ` AND owner_user_id IS NULL AND is_personal = false`
    }

    // Topics have belonged to a company since migration 062, but this query
    // ignored the column, so every tenant saw every other tenant's topic names.
    // Rows with a NULL company are pre-062 leftovers and stay visible to all.
    //
    // Fails OPEN for a session with no companyId — a token issued before 062 —
    // the same deliberate fallback authz.isSameCompany makes, so nobody loses
    // access to their own feed mid-rollout. Those tokens expire within 7 days.
    if (user.companyId && !user.isPlatformAdmin) {
      params.push(user.companyId)
      sql += ` AND (company_id IS NULL OR company_id = $${params.length})`
    }

    sql += ` ORDER BY display_order ASC, created_at ASC`

    const topics = await query(sql, params)

    // Get post counts for each topic
    const topicsWithCounts = await Promise.all(
      topics.map(async (topic: any) => {
        const countResult = await query(
          `SELECT COUNT(DISTINCT fp.post_id) as count
           FROM feed_post_topics fpt
           JOIN feed_posts fp ON fpt.post_id = fp.post_id
           WHERE fpt.topic_id = $1 
           AND fp.deleted_at IS NULL
           AND (fp.status = 'published' OR fp.status = 'approved')`,
          [topic.id]
        )

        return {
          ...topic,
          postCount: parseInt(countResult[0]?.count || '0')
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: topicsWithCounts
    })
  } catch (error) {
    console.error('Error fetching feed topics:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topics' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/feed/topics
 * Create a new topic (admin only)
 * Body: { topicName, description?, icon?, displayOrder? }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { topicName, description, icon, displayOrder } = body

    if (!topicName) {
      return NextResponse.json(
        { success: false, error: 'Topic name is required' },
        { status: 400 }
      )
    }

    // Stamp the creator's company, or the topic would be invisible to the
    // company filter above for everyone including its author.
    const result = await query(
      `INSERT INTO feed_topics (topic_name, description, icon, display_order, created_by, company_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [topicName, description || null, icon || null, displayOrder || 0, user.employeeId, user.companyId ?? null]
    )

    return NextResponse.json({
      success: true,
      data: result[0]
    })
  } catch (error: any) {
    console.error('Error creating feed topic:', error)

    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'Topic name already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create topic' },
      { status: 500 }
    )
  }
}

