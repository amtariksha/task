import { NextRequest, NextResponse } from 'next/server'
import { cache } from '@/lib/cache'
import { redisCache } from '@/lib/redis'

/**
 * POST /api/cache/clear
 * Clears all cache (admin only)
 * Query params:
 * - key: specific key to clear (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (key) {
      // Clear specific key
      await cache.delete(key)
      await redisCache.delete(key)
      
      return NextResponse.json({
        success: true,
        message: `Cache key '${key}' cleared successfully`
      })
    } else {
      // Clear all cache
      await cache.clear()
      await redisCache.clear()
      
      return NextResponse.json({
        success: true,
        message: 'All cache cleared successfully'
      })
    }
  } catch (error: any) {
    console.error('Failed to clear cache:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to clear cache'
    }, { status: 500 })
  }
}

