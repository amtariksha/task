import { NextRequest, NextResponse } from 'next/server'
import { getSettingValue, updateSettingByKey } from '@/lib/db/settings'
import { getAuthUser } from '@/lib/auth-server'
import { syncAppConfigToFirestore, AppConfig } from '@/lib/firebase-admin'

const DEFAULT_CONFIG: AppConfig = {
  minAndroidVersion: '1.0.0',
  minIosVersion: '1.0.0'
}

/**
 * GET /api/settings/app-management
 * Fetches the current app version settings (Public endpoint used by mobile app)
 */
export async function GET() {
  try {
    const config = await getSettingValue<AppConfig>('app_version_management', DEFAULT_CONFIG)
    
    // Ensure we only return version information
    const filteredConfig = {
      minAndroidVersion: config.minAndroidVersion || '1.0.0',
      minIosVersion: config.minIosVersion || '1.0.0',
      updatedAt: config.updatedAt
    }
    
    return NextResponse.json({
      success: true,
      data: filteredConfig
    })
  } catch (error) {
    console.error('❌ Failed to fetch app version configuration:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch app version configuration'
    }, { status: 500 })
  }
}

/**
 * POST/PATCH /api/settings/app-management
 * Updates and syncs app version settings.
 * Secured via API Key header or standard Admin Session Cookie.
 */
async function handleUpdate(request: NextRequest) {
  try {
    // 1. Authorize via API Key or standard session cookie
    const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('Authorization')?.replace('Bearer ', '')
    const configuredApiKey = process.env.APP_MANAGEMENT_API_KEY

    let isAuthorized = false

    if (configuredApiKey && apiKeyHeader === configuredApiKey) {
      isAuthorized = true
    } else {
      const authUser = await getAuthUser(request)
      if (authUser) {
        isAuthorized = 
          (authUser as { isPlatformAdmin?: boolean }).isPlatformAdmin || 
          authUser.role === 'admin' || 
          authUser.role === 'top_management' ||
          authUser.role === 'management'
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: 'Access denied: Invalid API Key or Unauthorized user' }, { status: 403 })
    }

    const body = await request.json()
    const currentConfig = await getSettingValue<AppConfig>('app_version_management', DEFAULT_CONFIG)

    const minAndroidVersion = body.minAndroidVersion !== undefined ? String(body.minAndroidVersion).trim() : currentConfig.minAndroidVersion
    const minIosVersion = body.minIosVersion !== undefined ? String(body.minIosVersion).trim() : currentConfig.minIosVersion

    const updatedConfig: AppConfig = {
      minAndroidVersion,
      minIosVersion,
      updatedAt: new Date().toISOString()
    }

    // 2. Save to PostgreSQL settings table
    await updateSettingByKey('app_version_management', updatedConfig)

    // 3. Sync to Firebase Firestore
    const synced = await syncAppConfigToFirestore(updatedConfig)

    return NextResponse.json({
      success: true,
      data: updatedConfig,
      firestoreSynced: synced,
      message: 'App version configuration updated and synchronized successfully'
    })
  } catch (error) {
    console.error('❌ Failed to update app version configuration:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update app version configuration'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handleUpdate(request)
}

export async function PATCH(request: NextRequest) {
  return handleUpdate(request)
}
