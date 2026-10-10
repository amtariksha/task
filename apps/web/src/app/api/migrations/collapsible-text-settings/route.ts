/**
 * Migration API: Add Collapsible Text Settings
 * Run this once (admin only) to seed the collapsible text configuration settings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole } from '@/lib/auth-server'

// Postgres upsert helper for a single settings row.
async function upsertSetting(key: string, value: unknown, description: string) {
  await query(
    `INSERT INTO settings (key, value, description, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, TRUE, NOW(), NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value), description]
  )
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'top_management'])
    if (!auth.ok) return auth.response

    const defaultThresholds = {
      bug_description: { maxCharacters: 300, maxLines: 5 },
      task_description: { maxCharacters: 300, maxLines: 5 },
      activity_description: { maxCharacters: 300, maxLines: 5 },
      comment_description: { maxCharacters: 300, maxLines: 5 },
      prompt_description: { maxCharacters: 300, maxLines: 5 },
      default: { maxCharacters: 300, maxLines: 5 }
    }

    await upsertSetting(
      'collapsible_text_thresholds',
      defaultThresholds,
      'Collapse thresholds for different text components. Each component can have custom maxCharacters and maxLines values.'
    )

    await upsertSetting(
      'collapsible_text_persist_state',
      {
        bug_description: false,
        task_description: false,
        activity_description: false,
        comment_description: false,
        prompt_description: false,
        default: false
      },
      'Controls whether expanded/collapsed state should persist in localStorage for different components.'
    )

    await upsertSetting(
      'collapsible_text_ui_options',
      {
        showGradient: true,
        gradientColor: 'white',
        buttonPosition: 'right',
        showLineCount: true
      },
      'UI customization options for collapsible text components (gradient overlay, button position, line count display).'
    )

    return NextResponse.json({
      success: true,
      message: 'Collapsible text settings added successfully',
      settings: [
        'collapsible_text_thresholds',
        'collapsible_text_persist_state',
        'collapsible_text_ui_options'
      ]
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to add settings'
    }, { status: 500 })
  }
}
