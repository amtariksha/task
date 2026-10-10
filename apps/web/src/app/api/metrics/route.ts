import { NextRequest, NextResponse } from 'next/server'
import { metricsCollector } from '@/lib/metrics'

/**
 * GET /api/metrics
 * Returns API performance metrics
 * Query params:
 * - timeWindow: number of minutes to include (default: 60)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timeWindow = parseInt(searchParams.get('timeWindow') || '60')

    const summary = metricsCollector.getSummary(timeWindow)

    return NextResponse.json({
      success: true,
      data: summary,
      timeWindow,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Failed to get metrics:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get metrics'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/metrics
 * Clears all metrics (admin only)
 */
export async function DELETE() {
  try {
    metricsCollector.clear()
    
    return NextResponse.json({
      success: true,
      message: 'Metrics cleared successfully'
    })
  } catch (error: any) {
    console.error('Failed to clear metrics:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to clear metrics'
    }, { status: 500 })
  }
}

