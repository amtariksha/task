/**
 * Settings API Routes
 * Handles CRUD operations for key-value JSON settings
 *
 * NEW STRUCTURE (Migration 015):
 * - One row per setting key
 * - JSON values for flexibility
 * - No ENUM restrictions
 */

import { getAuthUser, requireAuth } from '@/lib/auth-server'
import { canAdminCompany, isPlatformAdmin } from '@/lib/authz'
import {
  allSettingsKey,
  dropdownSettingsKey,
  groupedSettingsKey,
} from '@/lib/settings/cache-keys'
import { invalidateSettingsCaches } from '@/lib/settings/invalidate'
import { NextRequest, NextResponse } from 'next/server'
import {
  getAllSettings,
  getSettingByKey,
  getSettingsByKeys,
  getDropdownSettings,
  getSettingsByType, // Legacy compatibility
  createSetting,
  type CreateSettingData
} from '@/lib/db/settings'
import { cache } from '@/lib/cache'

/**
 * GET /api/settings
 * Get all settings or specific settings by key
 *
 * Query params:
 * - key: string (optional) - Get a specific setting by key
 * - keys: string (optional) - Comma-separated list of keys to fetch
 * - activeOnly: boolean (optional, default: true) - Only return active settings
 * - grouped: boolean (optional) - Return dropdown settings grouped by type (LEGACY)
 * - dropdowns: boolean (optional) - Return only array-type settings (for dropdowns)
 *
 * Examples:
 * - GET /api/settings - Get all settings
 * - GET /api/settings?key=departments - Get departments setting
 * - GET /api/settings?keys=departments,severities - Get multiple settings
 * - GET /api/settings?grouped=true - Get legacy grouped format
 * - GET /api/settings?dropdowns=true - Get all dropdown options
 */
export async function GET(request: NextRequest) {
  // Resolve which company's settings to serve. Migration 062 made settings
  // two-tier: a company's own row overrides the platform default, so the
  // session's company decides which departments / roles / bug types come back.
  const sessionUser = await getAuthUser(request)
  const companyId = sessionUser?.companyId ?? null
  // Every cache key below is suffixed with the company, and the responses are
  // marked private: the in-process cache and the CDN were both keyed globally
  // while the payload is company-specific, so the first tenant to warm the cache
  // served its departments, roles and bug types to every other tenant.
  const PRIVATE_CACHE = 'private, max-age=60, must-revalidate'
  try {
    const searchParams = request.nextUrl.searchParams
    const key = searchParams.get('key')
    const keys = searchParams.get('keys')
    const activeOnly = searchParams.get('activeOnly') !== 'false'
    const grouped = searchParams.get('grouped') === 'true'
    const dropdowns = searchParams.get('dropdowns') === 'true'

    // Legacy grouped format (for backward compatibility)
    if (grouped) {
      const cacheKey = groupedSettingsKey(companyId)
      if (await cache.has(cacheKey)) {
        const res = NextResponse.json({ success: true, data: await cache.get<any>(cacheKey), source: 'cache' })
        res.headers.set('Cache-Control', PRIVATE_CACHE)
        return res
      }
      const settingsByType = await getSettingsByType(companyId)
      await cache.set(cacheKey, settingsByType, 1440) // 24 hours
      const res = NextResponse.json({ success: true, data: settingsByType, source: 'database' })
      res.headers.set('Cache-Control', PRIVATE_CACHE)
      return res
    }

    // Get dropdown settings only
    if (dropdowns) {
      const cacheKey = dropdownSettingsKey(companyId)
      if (await cache.has(cacheKey)) {
        const res = NextResponse.json({ success: true, data: await cache.get<any>(cacheKey), source: 'cache' })
        res.headers.set('Cache-Control', PRIVATE_CACHE)
        return res
      }
      const dropdownSettings = await getDropdownSettings(companyId)
      await cache.set(cacheKey, dropdownSettings, 1440) // 24 hours
      return NextResponse.json({
        success: true,
        data: dropdownSettings,
        source: 'database'
      })
    }

    // Get specific setting by key
    if (key) {
      const setting = await getSettingByKey(key, companyId)
      if (!setting) {
        return NextResponse.json(
          {
            success: false,
            error: `Setting with key "${key}" not found`
          },
          { status: 404 }
        )
      }
      return NextResponse.json({
        success: true,
        data: setting
      })
    }

    // Get multiple settings by keys
    if (keys) {
      const keyArray = keys.split(',').map(k => k.trim())
      const settings = await getSettingsByKeys(keyArray, companyId)
      return NextResponse.json({
        success: true,
        data: settings
      })
    }

    // Get all settings
    const cacheKeyAll = allSettingsKey(companyId, activeOnly)
    if (await cache.has(cacheKeyAll)) {
      const cached = await cache.get<any[]>(cacheKeyAll) || []
      const res = NextResponse.json({ success: true, data: cached, count: cached.length, source: 'cache' })
      res.headers.set('Cache-Control', PRIVATE_CACHE)
      return res
    }

    const settings = await getAllSettings(activeOnly, companyId)

    await cache.set(cacheKeyAll, settings, 1440) // 24 hours

    const res = NextResponse.json({
      success: true,
      data: settings,
      count: settings.length,
      source: 'database'
    })
    res.headers.set('Cache-Control', PRIVATE_CACHE)
    return res
  } catch (error) {
    console.error('Settings API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch settings'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings
 * Create a new setting
 *
 * Body: CreateSettingData
 * {
 *   key: string,
 *   value: any (will be stored as JSON),
 *   description?: string,
 *   metadata?: any,
 *   createdBy: string
 * }
 *
 * Examples:
 * {
 *   "key": "departments",
 *   "value": ["Frontend - iOS", "Frontend - Android", "Backend - Node js"],
 *   "description": "Department options for user assignment",
 *   "createdBy": "AM-0001"
 * }
 *
 * {
 *   "key": "max_file_size_mb",
 *   "value": 10,
 *   "description": "Maximum file upload size in MB",
 *   "metadata": {"type": "number", "min": 1, "max": 100},
 *   "createdBy": "AM-0001"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // This route had NO authorization: any signed-in user could create a setting,
    // and `createdBy` came from the body. A setting drives the dropdowns every
    // screen reads, so it takes company-admin authority.
    const auth = await requireAuth(request)
    if (!auth.ok) return auth.response

    const body = await request.json()

    // A platform default (no company) is visible to every company that has no
    // override, so only a platform admin may create one.
    const targetCompanyId: string | null =
      typeof body.companyId === 'string' && body.companyId
        ? body.companyId
        : auth.user.companyId ?? null

    if (targetCompanyId === null) {
      if (!(await isPlatformAdmin(auth.user))) {
        return NextResponse.json(
          { success: false, error: 'Only a platform admin can create a platform-wide setting.' },
          { status: 403 }
        )
      }
    } else if (!(await canAdminCompany(auth.user, targetCompanyId))) {
      return NextResponse.json(
        { success: false, error: 'You do not administer this company.' },
        { status: 403 }
      )
    }

    // Validate required fields. `createdBy` now comes from the session.
    if (!body.key || body.value === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: key, value'
        },
        { status: 400 }
      )
    }

    // Validate key format (alphanumeric, underscores, hyphens only)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.key)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid key format. Use only alphanumeric characters, underscores, and hyphens.'
        },
        { status: 400 }
      )
    }

    const settingData: CreateSettingData = {
      key: body.key.trim(),
      value: body.value,
      description: body.description,
      metadata: body.metadata,
      createdBy: auth.user.employeeId,
      companyId: targetCompanyId
    }

    const newSetting = await createSetting(settingData)

    await invalidateSettingsCaches(targetCompanyId)

    return NextResponse.json({
      success: true,
      data: newSetting,
      message: 'Setting created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Settings API POST error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to create setting'
    const statusCode = errorMessage.includes('already exists') ? 409 : 500

    return NextResponse.json(
      {
        success: false,
        error: errorMessage
      },
      { status: statusCode }
    )
  }
}

