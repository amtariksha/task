import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/config'
import { requireRole } from '@/lib/auth-server'

/**
 * Database Connection Pool Status Endpoint
 * 
 * GET /api/db-status
 * 
 * Returns current connection pool statistics to help monitor
 * and diagnose connection issues.
 * 
 * IMPORTANT: This endpoint should be protected in production
 * or removed entirely. It exposes internal database metrics.
 */
export async function GET(request: NextRequest) {
  try {
    // Exposes internal DB metrics — restrict to admins.
    const auth = await requireRole(request, ['admin', 'top_management'])
    if (!auth.ok) return auth.response

    const pool = getPool()
    
    // Get pool statistics
    // Note: These are internal properties and may change in future pg versions
    const poolStats = {
      // Connection pool configuration
      config: {
        connectionLimit: (pool as any).options?.max || 'unknown',
        idleTimeout: (pool as any).options?.idleTimeoutMillis || 'unknown',
        connectTimeout: (pool as any).options?.connectionTimeoutMillis || 'unknown',
        statementTimeout: (pool as any).options?.statement_timeout || 'unknown'
      },

      // Current pool state
      state: {
        totalCount: (pool as any).totalCount || 0,
        idleCount: (pool as any).idleCount || 0,
        activeConnections: ((pool as any).totalCount || 0) - ((pool as any).idleCount || 0),
        waitingCount: (pool as any).waitingCount || 0
      },

      // Health indicators
      health: {
        status: 'healthy',
        warnings: [] as string[]
      },

      timestamp: new Date().toISOString()
    }

    // Add warnings based on pool state
    const utilizationPercent = poolStats.config.connectionLimit !== 'unknown'
      ? (poolStats.state.activeConnections / poolStats.config.connectionLimit) * 100
      : 0
    
    if (utilizationPercent > 80) {
      poolStats.health.status = 'warning'
      poolStats.health.warnings.push(`High connection utilization: ${utilizationPercent.toFixed(1)}%`)
    }
    
    if (poolStats.state.waitingCount > 0) {
      poolStats.health.status = 'warning'
      poolStats.health.warnings.push(`${poolStats.state.waitingCount} connection requests waiting`)
    }

    if (poolStats.config.connectionLimit !== 'unknown' &&
        poolStats.state.activeConnections >= poolStats.config.connectionLimit) {
      poolStats.health.status = 'critical'
      poolStats.health.warnings.push('Connection pool exhausted!')
    }
    
    // Test connection
    try {
      await pool.query('SELECT 1')
      poolStats.health.warnings.push('Database ping successful')
    } catch (error) {
      console.error('Database ping failed:', error)
      poolStats.health.status = 'critical'
      poolStats.health.warnings.push('Database ping failed')
    }
    
    return NextResponse.json({
      success: true,
      data: poolStats
    })
  } catch (error) {
    console.error('Failed to get database status:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get database status',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

