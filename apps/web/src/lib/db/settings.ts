/**
 * Settings Database Service
 * Handles CRUD operations for key-value JSON settings
 *
 * NEW STRUCTURE (Migration 015):
 * - One row per setting key
 * - JSON values for flexibility (arrays, objects, primitives)
 * - No ENUM restrictions on keys
 *
 * Example:
 * {
 *   key: 'departments',
 *   value: ["Frontend - iOS", "Frontend - Android", "Backend - Node js"],
 *   description: 'Department options for user assignment'
 * }
 */

import { query } from './index'
/**
 * Setting interface for the new key-value JSON structure
 */
export interface Setting {
  id: number
  key: string
  value: any // JSON value (can be array, object, string, number, boolean)
  description: string | null
  metadata: any | null // JSON metadata (validation rules, UI hints, etc.)
  isActive: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * Data for creating a new setting
 */
export interface CreateSettingData {
  key: string
  value: any // Will be JSON stringified
  description?: string
  metadata?: any // Will be JSON stringified
  createdBy: string
}

/**
 * Data for updating an existing setting
 */
export interface UpdateSettingData {
  value?: any // Will be JSON stringified
  description?: string
  metadata?: any // Will be JSON stringified
  isActive?: boolean
}

// ============================================================================
// LEGACY TYPES (for backward compatibility during migration)
// ============================================================================

export type SettingType = 'department' | 'severity' | 'priority' | 'category' | 'platform' | 'task_priority' | 'task_status' | 'bug_status' | 'bug_type'

/**
 * Legacy setting interface (OLD structure)
 * @deprecated Use Setting interface instead
 */
export interface LegacySetting {
  id: number
  settingType: SettingType
  settingValue: string
  displayOrder: number
  isActive: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// NEW API (Key-Value JSON Structure)
// ============================================================================

/**
 * Get a single setting by ID
 */
export async function getSettingById(id: number): Promise<Setting | null> {
  try {
    const sql = `
      SELECT
        id,
        key,
        value,
        description,
        metadata,
        is_active as is_active,
        created_by as createdBy,
        created_at as created_at,
        updated_at as updatedAt
      FROM settings
      WHERE id = $1
    `

    const results = await query<any[]>(sql, [id])

    if (results.length === 0) {
      return null
    }

    const row = results[0]

    // Parse value - handle both JSON strings and native MySQL JSON type
    let parsedValue = row.value
    if (typeof row.value === 'string') {
      try {
        parsedValue = JSON.parse(row.value)
      } catch (e) {
        // If parsing fails, it's a plain string value - keep it as is
        parsedValue = row.value
      }
    }

    // Parse metadata - handle both JSON strings and native MySQL JSON type
    let parsedMetadata = null
    if (row.metadata) {
      if (typeof row.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(row.metadata)
        } catch (e) {
          // If parsing fails, keep as string
          parsedMetadata = row.metadata
        }
      } else {
        parsedMetadata = row.metadata
      }
    }

    return {
      id: row.id,
      key: row.key,
      value: parsedValue,
      description: row.description,
      metadata: parsedMetadata,
      isActive: Boolean(row.is_active),
      createdBy: row.createdBy,
      createdAt: row.created_at,
      updatedAt: row.updatedAt
    }
  } catch (error) {
    console.error('Error fetching setting by ID:', error)
    throw new Error('Failed to fetch setting')
  }
}

/**
 * Get a single setting by key
 */
/**
 * Company-aware setting lookup.
 *
 * Migration 062 made settings two-tier: a row with company_id IS NULL is the
 * platform default, and a row with a company_id overrides it for that company.
 * Resolution prefers the company's own row and falls back to the default, so a
 * deployment that has configured nothing behaves exactly as before.
 *
 * Passing no companyId returns the platform default only.
 */
export async function getSettingByKey(key: string, companyId?: string | null): Promise<Setting | null> {
  try {
    const sql = `
      SELECT
        id,
        key,
        value,
        description,
        metadata,
        is_active as is_active,
        created_by as createdBy,
        created_at as created_at,
        updated_at as updatedAt
      FROM settings
      WHERE key = $1 AND is_active = TRUE
        AND (company_id IS NULL OR company_id = $2)
      ORDER BY (company_id IS NULL)
      LIMIT 1
    `

    const results = await query<any[]>(sql, [key, companyId ?? null])

    if (results.length === 0) {
      return null
    }

    const row = results[0]

    // Parse value - handle both JSON strings and native MySQL JSON type
    let parsedValue = row.value
    if (typeof row.value === 'string') {
      try {
        parsedValue = JSON.parse(row.value)
      } catch (e) {
        // If parsing fails, it's a plain string value - keep it as is
        parsedValue = row.value
      }
    }

    // Parse metadata - handle both JSON strings and native MySQL JSON type
    let parsedMetadata = null
    if (row.metadata) {
      if (typeof row.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(row.metadata)
        } catch (e) {
          // If parsing fails, keep as string
          parsedMetadata = row.metadata
        }
      } else {
        parsedMetadata = row.metadata
      }
    }

    return {
      id: row.id,
      key: row.key,
      value: parsedValue,
      description: row.description,
      metadata: parsedMetadata,
      isActive: Boolean(row.is_active),
      createdBy: row.createdBy,
      createdAt: row.created_at,
      updatedAt: row.updatedAt
    }
  } catch (error) {
    console.error('Error fetching setting by key:', error)
    throw new Error('Failed to fetch setting')
  }
}

/**
 * Get setting value by key (returns just the value, not the full setting object)
 */
export async function getSettingValue<T = any>(key: string, defaultValue?: T, companyId?: string | null): Promise<T> {
  try {
    const setting = await getSettingByKey(key, companyId)
    return setting ? setting.value as T : (defaultValue as T)
  } catch (error) {
    console.error(`Error fetching setting value for key "${key}":`, error)
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Failed to fetch setting value for key "${key}"`)
  }
}

/**
 * Get all settings, optionally filtered by active status
 */
export async function getAllSettings(
  activeOnly: boolean = true,
  companyId?: string | null
): Promise<Setting[]> {
  try {
    // DISTINCT ON collapses each key to one row, preferring the company's own
    // override over the platform default — the same rule getDropdownSettings
    // uses. Without the company filter this returned every company's rows, so a
    // tenant saw other tenants' departments and roles.
    let sql = `
      SELECT DISTINCT ON (key)
        id,
        key,
        value,
        description,
        metadata,
        is_active as is_active,
        created_by as createdBy,
        created_at as created_at,
        updated_at as updatedAt
      FROM settings
      WHERE (company_id IS NULL OR company_id = $1)
    `
    const params: any[] = [companyId ?? null]

    if (activeOnly) {
      sql += ' AND is_active = TRUE'
    }

    sql += ' ORDER BY key, (company_id IS NULL)'

    const results = await query<any[]>(sql, params)

    return results.map(row => {
      // Parse value - handle both JSON strings and native MySQL JSON type
      let parsedValue = row.value
      if (typeof row.value === 'string') {
        try {
          parsedValue = JSON.parse(row.value)
        } catch (e) {
          // If parsing fails, it's a plain string value - keep it as is
          parsedValue = row.value
        }
      }

      // Parse metadata - handle both JSON strings and native MySQL JSON type
      let parsedMetadata = null
      if (row.metadata) {
        if (typeof row.metadata === 'string') {
          try {
            parsedMetadata = JSON.parse(row.metadata)
          } catch (e) {
            // If parsing fails, keep as string
            parsedMetadata = row.metadata
          }
        } else {
          parsedMetadata = row.metadata
        }
      }

      return {
        id: row.id,
        key: row.key,
        value: parsedValue,
        description: row.description,
        metadata: parsedMetadata,
        isActive: Boolean(row.is_active),
        createdBy: row.createdBy,
        createdAt: row.created_at,
        updatedAt: row.updatedAt
      }
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    throw new Error('Failed to fetch settings')
  }
}

/**
 * Get multiple settings by keys
 */
export async function getSettingsByKeys(
  keys: string[],
  companyId?: string | null
): Promise<Record<string, any>> {
  try {
    if (keys.length === 0) {
      return {}
    }

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',')
    // Company override wins over the platform default, as in getSettingByKey.
    const sql = `
      SELECT DISTINCT ON (key)
        key,
        value
      FROM settings
      WHERE key IN (${placeholders})
        AND is_active = TRUE
        AND (company_id IS NULL OR company_id = $${keys.length + 1})
      ORDER BY key, (company_id IS NULL)
    `

    const results = await query<any[]>(sql, [...keys, companyId ?? null])

    const settings: Record<string, any> = {}
    results.forEach(row => {
      settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    })

    return settings
  } catch (error) {
    console.error('Error fetching settings by keys:', error)
    throw new Error('Failed to fetch settings by keys')
  }
}

/**
 * Get settings for dropdowns (backward compatibility helper)
 * Returns settings that are arrays (typically used for dropdowns)
 */
export async function getDropdownSettings(companyId?: string | null): Promise<Record<string, string[]>> {
  try {
    // DISTINCT ON collapses each key to a single row, preferring the company's
    // own override (company_id IS NULL sorts last) over the platform default.
    // This is what makes departments, roles and bug types configurable per
    // company instead of shared across every tenant.
    const sql = `
      SELECT DISTINCT ON (key)
        key,
        value
      FROM settings
      WHERE is_active = TRUE
        AND jsonb_typeof(value) = 'array'
        AND (company_id IS NULL OR company_id = $1)
      ORDER BY key, (company_id IS NULL)
    `

    const results = await query<any[]>(sql, [companyId ?? null])

    const dropdowns: Record<string, string[]> = {}
    results.forEach(row => {
      const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
      if (Array.isArray(value)) {
        dropdowns[row.key] = value
      }
    })

    return dropdowns
  } catch (error) {
    console.error('Error fetching dropdown settings:', error)
    throw new Error('Failed to fetch dropdown settings')
  }
}

/**
 * Create a new setting
 */
export async function createSetting(data: CreateSettingData): Promise<Setting> {
  try {
    const sql = `
      INSERT INTO settings (
        key,
        value,
        description,
        metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `

    const valueJson = JSON.stringify(data.value)
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null

    const result = await query<any[]>(sql, [
      data.key,
      valueJson,
      data.description || null,
      metadataJson,
      data.createdBy
    ])

    if (!result || result.length === 0) {
      throw new Error('Failed to create setting - no ID returned')
    }

    const insertId = result[0].id
    const newSetting = await getSettingById(insertId)

    if (!newSetting) {
      throw new Error('Failed to retrieve created setting')
    }

    return newSetting
  } catch (error: any) {
    console.error('Error creating setting:', error)

    // Check for duplicate entry error (Postgres: 23505, MySQL: ER_DUP_ENTRY)
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
      throw new Error(`A setting with key "${data.key}" already exists`)
    }

    throw new Error('Failed to create setting')
  }
}

/**
 * Update an existing setting
 */
export async function updateSetting(id: number, data: UpdateSettingData): Promise<Setting> {
  try {
    const updates: string[] = []
    const params: any[] = []

    if (data.value !== undefined) {
      params.push(JSON.stringify(data.value))
      updates.push(`value = $${params.length}`)
    }

    if (data.description !== undefined) {
      params.push(data.description)
      updates.push(`description = $${params.length}`)
    }

    if (data.metadata !== undefined) {
      params.push(data.metadata ? JSON.stringify(data.metadata) : null)
      updates.push(`metadata = $${params.length}`)
    }

    if (data.isActive !== undefined) {
      params.push(data.isActive)
      updates.push(`is_active = $${params.length}`)
    }

    if (updates.length === 0) {
      throw new Error('No fields to update')
    }

    params.push(id)

    const sql = `
      UPDATE settings
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
    `

    await query(sql, params)

    const updatedSetting = await getSettingById(id)

    if (!updatedSetting) {
      throw new Error('Failed to retrieve updated setting')
    }

    return updatedSetting
  } catch (error: any) {
    console.error('Error updating setting:', error)

    throw new Error('Failed to update setting')
  }
}

/**
 * Update setting by key
 */
export async function updateSettingByKey(key: string, value: any): Promise<Setting | null> {
  try {
    const sql = `
      UPDATE settings
      SET value = $1
      WHERE key = $2
    `

    await query(sql, [JSON.stringify(value), key])

    return await getSettingByKey(key)
  } catch (error) {
    console.error(`Error updating setting with key "${key}":`, error)
    throw new Error(`Failed to update setting with key "${key}"`)
  }
}

/**
 * Delete a setting (soft delete by setting isActive to false)
 */
export async function deleteSetting(id: number): Promise<boolean> {
  try {
    const sql = `
      UPDATE settings
      SET is_active = FALSE
      WHERE id = $1
    `

    await query(sql, [id])
    return true
  } catch (error) {
    console.error('Error deleting setting:', error)
    throw new Error('Failed to delete setting')
  }
}

/**
 * Delete setting by key (soft delete)
 */
export async function deleteSettingByKey(key: string): Promise<boolean> {
  try {
    const sql = `
      UPDATE settings
      SET is_active = FALSE
      WHERE key = $1
    `

    await query(sql, [key])
    return true
  } catch (error) {
    console.error(`Error deleting setting with key "${key}":`, error)
    throw new Error(`Failed to delete setting with key "${key}"`)
  }
}

/**
 * Permanently delete a setting (hard delete)
 */
export async function permanentlyDeleteSetting(id: number): Promise<boolean> {
  try {
    const sql = 'DELETE FROM settings WHERE id = $1'
    await query(sql, [id])
    return true
  } catch (error) {
    console.error('Error permanently deleting setting:', error)
    throw new Error('Failed to permanently delete setting')
  }
}

// ============================================================================
// LEGACY API (for backward compatibility)
// ============================================================================

/**
 * Get settings grouped by type (LEGACY - for backward compatibility)
 * Maps new structure to old structure
 * @deprecated Use getDropdownSettings() instead
 */
export async function getSettingsByType(
  companyId?: string | null
): Promise<Record<SettingType, string[]>> {
  try {
    const dropdowns = await getDropdownSettings(companyId)

    // Map new keys to old SettingType keys
    const keyMapping: Record<string, SettingType> = {
      'departments': 'department',
      'severities': 'severity',
      'priorities': 'priority',
      'categories': 'category',
      'platforms': 'platform',
      'task_priorities': 'task_priority',
      'task_statuses': 'task_status',
      'bug_statuses': 'bug_status',
      'bug_types': 'bug_type'
    }

    const result: Record<string, string[]> = {}

    Object.entries(dropdowns).forEach(([key, values]) => {
      const legacyKey = keyMapping[key]
      if (legacyKey) {
        result[legacyKey] = values
      }
    })

    return result as Record<SettingType, string[]>
  } catch (error) {
    console.error('Error fetching settings by type (legacy):', error)
    throw new Error('Failed to fetch settings by type')
  }
}

/**
 * Get all settings (LEGACY - for backward compatibility)
 * @deprecated Use getAllSettings() instead
 */
export async function getSettings(
  settingType?: SettingType,
  activeOnly: boolean = true
): Promise<LegacySetting[]> {
  try {
    // This is a compatibility shim - the new structure doesn't support this query pattern
    // Return empty array for now
    console.warn('getSettings() is deprecated. Use getAllSettings() or getSettingsByKeys() instead.')
    return []
  } catch (error) {
    console.error('Error fetching settings (legacy):', error)
    throw new Error('Failed to fetch settings')
  }
}

