/**
 * Individual Setting API Routes
 * Handles update and delete operations for a specific setting
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { canAdminCompany, isPlatformAdmin } from '@/lib/authz'
import {
  getSettingById,
  updateSetting,
  deleteSetting,
  permanentlyDeleteSetting,
  type Setting,
  type UpdateSettingData
} from '@/lib/db/settings'
import { invalidateSettingsCaches } from '@/lib/settings/invalidate'
import type { NextResponse as NextResponseType } from 'next/server'

/**
 * Require authority over the company that owns this setting.
 *
 * `requireRole(['admin','top_management'])` used to guard these handlers, which
 * was wrong twice over: it shut out a company_admin who has no global role, and it
 * let a global admin of one company edit another company's row. A platform row
 * (company_id IS NULL) is every company's fallback, so only a platform admin may
 * touch it.
 */
async function requireSettingAdmin(
  request: NextRequest,
  settingId: number
): Promise<
  | { ok: true; setting: Setting; actor: { employeeId: string; role: string; companyId?: string | null; isPlatformAdmin?: boolean } }
  | { ok: false; response: NextResponseType }
> {
  const auth = await requireAuth(request)
  if (!auth.ok) return { ok: false, response: auth.response }

  const setting = await getSettingById(settingId)
  if (!setting) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Setting not found' }, { status: 404 }),
    }
  }

  const allowed = setting.companyId === null
    ? await isPlatformAdmin(auth.user)
    : await canAdminCompany(auth.user, setting.companyId)

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: setting.companyId === null
            ? 'Only a platform admin can change a platform-wide setting.'
            : 'You do not administer the company this setting belongs to.',
        },
        { status: 403 }
      ),
    }
  }

  return { ok: true, setting, actor: auth.user }
}

/**
 * GET /api/settings/[id]
 * Get a specific setting by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const settingId = parseInt(id)

    if (isNaN(settingId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setting ID'
        },
        { status: 400 }
      )
    }

    const setting = await getSettingById(settingId)

    if (!setting) {
      return NextResponse.json(
        {
          success: false,
          error: 'Setting not found'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: setting
    })
  } catch (error) {
    console.error('Setting API GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch setting'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/[id]
 * Update a specific setting
 *
 * Body: UpdateSettingData
 * {
 *   value?: any,
 *   description?: string,
 *   metadata?: any,
 *   isActive?: boolean
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const settingId = parseInt(id)

    if (isNaN(settingId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setting ID'
        },
        { status: 400 }
      )
    }

    const guard = await requireSettingAdmin(request, settingId)
    if (!guard.ok) return guard.response

    const body = await request.json()

    const updateData: UpdateSettingData = {}

    if (body.value !== undefined) {
      updateData.value = body.value
    }

    if (body.description !== undefined) {
      updateData.description = body.description
    }

    if (body.metadata !== undefined) {
      updateData.metadata = body.metadata
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No fields to update'
        },
        { status: 400 }
      )
    }

    const updatedSetting = await updateSetting(settingId, updateData)

    await invalidateSettingsCaches(guard.setting.companyId)

    return NextResponse.json({
      success: true,
      data: updatedSetting,
      message: 'Setting updated successfully'
    })
  } catch (error) {
    console.error('Setting API PATCH error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update setting'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/[id]
 * Delete a specific setting (soft delete by default)
 * Query params:
 * - permanent: boolean (optional) - Permanently delete the setting
 */
// PUT handler (alias for PATCH to support both methods)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const settingId = parseInt(id)

    if (isNaN(settingId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setting ID'
        },
        { status: 400 }
      )
    }

    const guard = await requireSettingAdmin(request, settingId)
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const permanent = searchParams.get('permanent') === 'true'

    if (permanent) {
      await permanentlyDeleteSetting(settingId)
    } else {
      await deleteSetting(settingId)
    }

    await invalidateSettingsCaches(guard.setting.companyId)

    return NextResponse.json({
      success: true,
      message: permanent ? 'Setting permanently deleted' : 'Setting deactivated successfully'
    })
  } catch (error) {
    console.error('Setting API DELETE error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete setting'
      },
      { status: 500 }
    )
  }
}

