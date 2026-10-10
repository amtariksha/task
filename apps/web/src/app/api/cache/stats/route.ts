import { NextResponse } from 'next/server'
import { cache } from '@/lib/cache'
import { redisCache } from '@/lib/redis'

/**
 * GET /api/cache/stats
 * Returns cache statistics for monitoring
 */
export async function GET() {
  try {
    const stats = await cache.getStats()
    const redisStats = await redisCache.getStats()

    return NextResponse.json({
      success: true,
      data: {
        cache: stats,
        redis: redisStats,
        timestamp: new Date().toISOString(),
      }
    })
  } catch (error: any) {
    console.error('Failed to get cache stats:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get cache stats'
    }, { status: 500 })
  }
}

