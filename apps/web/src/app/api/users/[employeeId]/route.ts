import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmployeeId, updateUser } from '@/lib/db/users'
import { withTimeout } from '@/lib/db/config'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { requireAuth } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params

    // Serve from cache if present
    const cacheKey = CACHE_KEYS.USER_DETAIL(employeeId)
    if (await cache.has(cacheKey)) {
      return NextResponse.json({ success: true, data: await cache.get<any>(cacheKey), source: 'cache' })
    }

    // Get user from database with timeout
    const user = await withTimeout(
      getUserByEmployeeId(employeeId),
      10000,
      'Failed to fetch user - database timeout'
    )

    // Cache for 5 minutes
    await cache.set(cacheKey, user, 5)

    return NextResponse.json({
      success: true,
      data: user,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to get user from MySQL:', error)
    return NextResponse.json({
      success: false,
      error: 'User not found or unavailable'
    }, { status: 404 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const { employeeId } = await params
    const userData = await request.json()

    // Cannot update admin user
    if (employeeId.toLowerCase() === 'admin-001') {
      return NextResponse.json({
        success: false,
        error: 'Cannot update admin user'
      }, { status: 403 })
    }

    // Non-privileged users may only edit their OWN profile, and may not change
    // role / status / permissions (prevents self privilege-escalation).
    const isPrivileged = auth.user.role === 'admin' || auth.user.role === 'top_management'
    if (!isPrivileged) {
      if (auth.user.employeeId !== employeeId) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      delete userData.role
      delete userData.status
      delete userData.isSystemAdmin
      delete userData.tabPermissions
    }

    // Update user in MySQL with timeout
    const user = await withTimeout(
      updateUser(employeeId, userData),
      15000,
      'Failed to update user - database timeout'
    )

    // Invalidate caches
    await cache.delete(CACHE_KEYS.USER_DETAIL(employeeId))
    await cache.delete(CACHE_KEYS.USERS)

    return NextResponse.json({
      success: true,
      data: user,
      source: 'mysql'
    })
  } catch (error) {
    console.error('Failed to update user in MySQL:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update user'
    }, { status: 500 })
  }
}

// PATCH handler (alias for PUT to support both methods)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  return PUT(request, { params })
}
