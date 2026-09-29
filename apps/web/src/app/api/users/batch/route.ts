import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUsersByEmployeeIds } from '@/lib/db/users'
import { withTimeout } from '@/lib/db/config'
import { cache, CACHE_KEYS } from '@/lib/cache'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const ids: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds : []

    if (!ids || ids.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // Build a deterministic cache key from the sorted IDs
    const key = `users_batch_${ids.slice().sort().join('_')}`

    if (await cache.has(key)) {
      return NextResponse.json({ success: true, data: await cache.get<any[]>(key), source: 'cache' })
    }

    const users = await withTimeout(
      getUsersByEmployeeIds(ids),
      10000,
      'Failed to fetch users (batch) - database timeout'
    )

    // Cache for 5 minutes
    await cache.set(key, users, 5)

    const res = NextResponse.json({ success: true, data: users, source: 'mysql' })
    // Per-user data behind a session: private, never a shared cache.
    res.headers.set('Cache-Control', 'private, max-age=60')
    return res
  } catch (error: any) {
    console.error('Error in POST /api/users/batch:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch users batch' },
      { status: 500 }
    )
  }
}

