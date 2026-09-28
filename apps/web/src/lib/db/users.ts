// MySQL User Service
// Server-side only - do not use 'use client'

import bcrypt from 'bcryptjs'
import { query, queryOne, withRetry, execute } from './config'
import { User } from '../types'

const BCRYPT_ROUNDS = 10

// A stored value is a bcrypt hash if it has the $2a$/$2b$/$2y$ prefix.
function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$/.test(value || '')
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

interface UserRow {
  id: number
  employee_id: string
  name: string
  email: string
  phone: string
  telegram_token: string | null
  department: string
  manager_email: string | null
  manager_id: string | null
  is_today_task: number
  warning_count: number
  role: string
  password: string
  status: string
  hours_log: string | null
  id_card_photo: string | null
  created_at: string
  updated_at: string
  tab_permissions: string[] | null
  is_system_admin?: number
  is_platform_admin?: boolean
}

// Convert database row to User object
function rowToUser(row: UserRow): User {
  return {
    employeeId: row.employee_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    telegramToken: row.telegram_token || undefined,
    // department is nullable since migration 061; keep the User type's `string`
    // contract honest so callers never see null.
    department: row.department || '',
    managerEmail: row.manager_email || undefined,
    managerId: row.manager_id || undefined,
    isTodayTask: Boolean(row.is_today_task),
    warningCount: row.warning_count,
    role: row.role as User['role'],
    // SECURITY: never expose the stored password through API responses.
    // Auth uses a direct SQL comparison (authenticateUser); admin-only flows
    // that genuinely need it use getUserPasswordByEmployeeId().
    password: '',
    status: row.status as User['status'],
    hoursLog: row.hours_log || undefined,
    idCardPhoto: row.id_card_photo || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tabPermissions: row.tab_permissions || undefined,
    isSystemAdmin: row.is_system_admin,
    isPlatformAdmin: Boolean(row.is_platform_admin)
  }
}

// Admin-only: read a user's stored password directly (bypasses rowToUser which
// now blanks it). Only call from routes that have verified admin authorization.
export async function getUserPasswordByEmployeeId(employee_id: string): Promise<string | null> {
  return withRetry(async () => {
    const row = await queryOne<{ password: string }>(
      'SELECT password FROM users WHERE employee_id = $1',
      [employee_id]
    )
    return row?.password ?? null
  })
}

// Get all active users
export async function getAllUsers(): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users WHERE status = $1 ORDER BY name',
      ['active']
    )
    return rows.map(rowToUser)
  })
}

/**
 * Users belonging to one company.
 *
 * getAllUsers() returns EVERY user in the deployment, which was fine as an
 * internal tool but leaks across tenants now that several companies share it.
 * Anything user-facing should go through here; getAllUsers is reserved for
 * platform-admin views.
 */
export async function getUsersByCompany(companyId: string, includeInactive = false): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      `SELECT u.*
         FROM users u
         JOIN user_companies uc ON uc.employee_id = u.employee_id
        WHERE uc.company_id = $1
          ${includeInactive ? '' : `AND u.status = 'active'`}
        ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END, u.name`,
      [companyId]
    )
    return rows.map(rowToUser)
  })
}

// Get all users including inactive (active first, then inactive, alphabetically)
export async function getAllUsersIncludingInactive(): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users ORDER BY CASE WHEN status = $1 THEN 0 ELSE 1 END, name',
      ['active']
    )
    return rows.map(rowToUser)
  })
}

// Get user by employee ID
export async function getUserByEmployeeId(employee_id: string): Promise<User | null> {
  return withRetry(async () => {
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE employee_id = $1',
      [employee_id]
    )
    return row ? rowToUser(row) : null
  })
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  return withRetry(async () => {
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )
    return row ? rowToUser(row) : null
  })
}

// Get users by manager ID (DIRECT reports only)
export async function getUsersByManagerId(managerId: string): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users WHERE manager_id = $1 AND status = $2 ORDER BY name',
      [managerId, 'active']
    )
    return rows.map(rowToUser)
  })
}

/** Guards against a cycle in manager_id, which is otherwise unbounded recursion. */
const MAX_MANAGER_DEPTH = 10

/**
 * Everyone below a manager in the reporting tree — direct reports, their
 * reports, and so on. Managers can themselves have managers, so visibility has
 * to be transitive; the previous single-level filter meant a senior manager
 * could not see their skip-level reports' work.
 */
export async function getReportsRecursive(managerId: string): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      `WITH RECURSIVE chain AS (
         SELECT u.*, 1 AS depth
           FROM users u
          WHERE u.manager_id = $1 AND u.status = 'active'
         UNION ALL
         SELECT u.*, c.depth + 1
           FROM users u
           JOIN chain c ON u.manager_id = c.employee_id
          WHERE u.status = 'active'
            AND c.depth < ${MAX_MANAGER_DEPTH}
       )
       SELECT DISTINCT ON (employee_id) *
         FROM chain
        ORDER BY employee_id, depth`,
      [managerId]
    )
    return rows.map(rowToUser)
  })
}

/** Employee IDs of everyone below a manager, plus the manager themselves. */
export async function getVisibleEmployeeIds(managerId: string): Promise<string[]> {
  const reports = await getReportsRecursive(managerId)
  return [managerId, ...reports.map((user) => user.employeeId)]
}

/**
 * Is `managerId` anywhere above `employeeId` in the reporting chain?
 * Walks upward from the employee, which is cheaper than expanding the whole
 * subtree when all we need is a yes/no.
 */
export async function isInManagerChain(managerId: string, employeeId: string): Promise<boolean> {
  if (managerId === employeeId) return false
  return withRetry(async () => {
    const row = await queryOne<{ found: boolean }>(
      `WITH RECURSIVE chain AS (
         SELECT employee_id, manager_id, 1 AS depth
           FROM users WHERE employee_id = $2
         UNION ALL
         SELECT u.employee_id, u.manager_id, c.depth + 1
           FROM users u
           JOIN chain c ON u.employee_id = c.manager_id
          WHERE c.depth < ${MAX_MANAGER_DEPTH}
       )
       SELECT TRUE AS found FROM chain WHERE manager_id = $1 LIMIT 1`,
      [managerId, employeeId]
    )
    return Boolean(row?.found)
  })
}

// Get users by department
export async function getUsersByDepartment(department: string): Promise<User[]> {
  return withRetry(async () => {
    const rows = await query<UserRow[]>(
      'SELECT * FROM users WHERE department = $1 AND status = $2 ORDER BY name',
      [department, 'active']
    )
    return rows.map(rowToUser)
  })
}

// Get users by a list of employee IDs (batch)
export async function getUsersByEmployeeIds(employeeIds: string[]): Promise<User[]> {
  return withRetry(async () => {
    if (!employeeIds || employeeIds.length === 0) return []
    // Deduplicate IDs to avoid SQL errors and reduce result size
    const ids = Array.from(new Set(employeeIds)).filter(Boolean)
    if (ids.length === 0) return []

    // Use PostgreSQL's = ANY($1) syntax with array parameter
    const rows = await query<UserRow[]>(
      `SELECT * FROM users WHERE employee_id = ANY($1) AND status = $2 ORDER BY name`,
      [ids, 'active']
    )
    return rows.map(rowToUser)
  })
}

export const EMPLOYEE_ID_PREFIX = process.env.EMPLOYEE_ID_PREFIX || 'AM'

/**
 * Next free employee ID, computed in the database across ALL users — active and
 * inactive alike. The old client-side generator only saw active users, so once
 * the highest-numbered employees were deactivated it handed back an ID that was
 * already taken (and rewound all the way to AM-0001 when the list was empty),
 * which surfaced as a unique-violation the UI reported as a Google Sheets quota
 * error.
 */
export async function getNextEmployeeId(prefix: string = EMPLOYEE_ID_PREFIX): Promise<string> {
  const row = await queryOne<{ max_num: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(employee_id FROM '^' || $1 || '-([0-9]+)$') AS INTEGER)) AS max_num
       FROM users
      WHERE employee_id ~ ('^' || $1 || '-[0-9]+$')`,
    [prefix]
  )
  const next = (row?.max_num ?? 0) + 1
  return `${prefix}-${String(next).padStart(4, '0')}`
}

/**
 * The prefix of an existing employee ID ('AM-0007' -> 'AM'). Employee IDs are
 * prefixed per company (companies.code), so a collision retry has to renumber
 * within the same company rather than falling back to the default prefix.
 */
function employeeIdPrefix(employeeId: string): string {
  const match = /^(.+)-\d+$/.exec(employeeId)
  return match ? match[1] : EMPLOYEE_ID_PREFIX
}

const UNIQUE_VIOLATION = '23505'

// Create a new user
export async function createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
  if (typeof user.password !== 'string' || user.password.trim() === '') {
    throw new Error('A password is required to create a user')
  }

  // Store the password as a bcrypt hash, never plaintext.
  const hashedPassword = await hashPassword(user.password)

  const insertWithId = async (employeeId: string): Promise<void> => {
    await query<any>(
      `INSERT INTO users (
        employee_id, name, email, phone, telegram_token, department,
        manager_email, manager_id, is_today_task, warning_count, role,
        password, status, hours_log, tab_permissions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        employeeId,
        user.name,
        user.email,
        user.phone,
        user.telegramToken || null,
        user.department || null,
        user.managerEmail || null,
        user.managerId || null,
        user.isTodayTask ? 1 : 0,
        user.warningCount,
        user.role,
        hashedPassword,
        user.status,
        user.hoursLog || null,
        JSON.stringify(user.tabPermissions || [])
      ]
    )
  }

  // Allocate the ID here rather than trusting the client. Two admins creating a
  // user at the same moment still race, so retry on a unique violation with a
  // freshly computed ID. Note this is deliberately NOT wrapped in withRetry —
  // that helper blindly retries deterministic constraint failures.
  let employeeId = user.employeeId?.trim() || (await getNextEmployeeId())
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await insertWithId(employeeId)
      const createdUser = await getUserByEmployeeId(employeeId)
      if (!createdUser) throw new Error('Failed to retrieve created user')
      return createdUser
    } catch (error) {
      const code = (error as { code?: string })?.code
      const detail = String((error as { detail?: string })?.detail || '')
      // Only an employee_id collision is retryable. A duplicate email is a real
      // input error and must surface to the admin unchanged.
      if (code === UNIQUE_VIOLATION && detail.includes('employee_id')) {
        // Renumber within the SAME company: retrying with the default prefix
        // moved the new user into the 'AM' run no matter which company they
        // belonged to.
        employeeId = await getNextEmployeeId(employeeIdPrefix(employeeId))
        continue
      }
      throw error
    }
  }
  throw new Error('Could not allocate a unique employee ID after several attempts')
}

// Update user
export async function updateUser(employee_id: string, updates: Partial<User>): Promise<User> {
  return withRetry(async () => {
    // Check if user is system admin
    const user = await getUserByEmployeeId(employee_id)
    if (user && user.isSystemAdmin === 1) {
      // System admin can only update certain fields (not role or status)
      if (updates.role !== undefined && updates.role !== 'admin') {
        throw new Error('Cannot change system admin role')
      }
      if (updates.status !== undefined && updates.status !== 'active') {
        throw new Error('Cannot deactivate system admin')
      }
    }

    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1 // PostgreSQL uses $1, $2, $3, etc.

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`)
      values.push(updates.name)
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`)
      values.push(updates.email)
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`)
      values.push(updates.phone)
    }
    if (updates.telegramToken !== undefined) {
      fields.push(`telegram_token = $${paramIndex++}`)
      values.push(updates.telegramToken || null)
    }
    if (updates.department !== undefined) {
      fields.push(`department = $${paramIndex++}`)
      values.push(updates.department)
    }
    if (updates.managerEmail !== undefined) {
      fields.push(`manager_email = $${paramIndex++}`)
      values.push(updates.managerEmail || null)
    }
    if (updates.managerId !== undefined) {
      fields.push(`manager_id = $${paramIndex++}`)
      values.push(updates.managerId || null)
    }
    if (updates.isTodayTask !== undefined) {
      fields.push(`is_today_task = $${paramIndex++}`)
      values.push(updates.isTodayTask ? 1 : 0)
    }
    if (updates.warningCount !== undefined) {
      fields.push(`warning_count = $${paramIndex++}`)
      values.push(updates.warningCount)
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${paramIndex++}`)
      values.push(updates.role)
    }
    // A blank/whitespace password means "leave the password alone", never "set it
    // to the empty string". The UI sends the whole user object back on save and
    // rowToUser blanks the password on read, so without this guard an ordinary
    // edit stored bcrypt('') and locked the user out of their own account.
    if (typeof updates.password === 'string' && updates.password.trim() !== '') {
      fields.push(`password = $${paramIndex++}`)
      values.push(await hashPassword(updates.password))
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`)
      values.push(updates.status)
    }
    if (updates.hoursLog !== undefined) {
      fields.push(`hours_log = $${paramIndex++}`)
      values.push(updates.hoursLog || null)
    }
    if (updates.idCardPhoto !== undefined) {
      fields.push(`id_card_photo = $${paramIndex++}`)
      values.push(updates.idCardPhoto || null)
    }
    if (updates.tabPermissions !== undefined) {
      fields.push(`tab_permissions = $${paramIndex++}`)
      values.push(JSON.stringify(updates.tabPermissions))
    }

    if (fields.length === 0) {
      const user = await getUserByEmployeeId(employee_id)
      if (!user) throw new Error('User not found')
      return user
    }

    // Add employee_id as the last parameter
    values.push(employee_id)
    await query(
      `UPDATE users SET ${fields.join(', ')} WHERE employee_id = $${paramIndex}`,
      values
    )

    const updatedUser = await getUserByEmployeeId(employee_id)
    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user')
    }
    return updatedUser
  })
}

// Delete user (soft delete by setting status to inactive)
export async function deleteUser(employee_id: string): Promise<boolean> {
  return withRetry(async () => {
    // Prevent deletion of system admin
    const user = await getUserByEmployeeId(employee_id)
    if (user && user.isSystemAdmin === 1) {
      throw new Error('Cannot delete system admin user')
    }

    const affected = await execute(
      'UPDATE users SET status = $1 WHERE employee_id = $2',
      ['inactive', employee_id]
    )
    return affected > 0
  })
}

// Increment warning count
export async function incrementWarningCount(employee_id: string): Promise<User> {
  return withRetry(async () => {
    await query(
      'UPDATE users SET warning_count = warning_count + 1 WHERE employee_id = $1',
      [employee_id]
    )
    const user = await getUserByEmployeeId(employee_id)
    if (!user) throw new Error('User not found')
    return user
  })
}

// Reset warning count
export async function resetWarningCount(employee_id: string): Promise<User> {
  return withRetry(async () => {
    await query(
      'UPDATE users SET warning_count = 0 WHERE employee_id = $1',
      [employee_id]
    )
    const user = await getUserByEmployeeId(employee_id)
    if (!user) throw new Error('User not found')
    return user
  })
}

// Authenticate user by identifier (employee ID or email) + password.
// The identifier parameter accepts either an employee ID (e.g., "AM-0001")
// or an email address. Email matching is case-insensitive; employee ID is exact.
// (Parameter named `employee_id` retained for backward compatibility with callers.)
export async function authenticateUser(employee_id: string, password: string): Promise<User | null> {
  return withRetry(async () => {
    const identifier = (employee_id || '').trim()
    if (!identifier) return null

    // Never authenticate on an empty password. Accounts whose hash was corrupted
    // to bcrypt('') by the old update path would otherwise accept a blank
    // password, and the only guard was client-side in LoginForm.
    if (typeof password !== 'string' || password === '') return null

    const row = await queryOne<UserRow>(
      `SELECT * FROM users
       WHERE (employee_id = $1 OR LOWER(email) = LOWER($1))
         AND status = $2
       LIMIT 1`,
      [identifier, 'active']
    )
    if (!row) return null

    const stored = row.password || ''
    let valid = false

    if (isBcryptHash(stored)) {
      valid = await bcrypt.compare(password, stored)
    } else {
      // Legacy plaintext password: compare directly, then upgrade it to a bcrypt
      // hash on success so existing accounts keep working but stop living in
      // plaintext. Existing users are never locked out by the migration.
      valid = stored.length > 0 && stored === password
      if (valid) {
        try {
          const hash = await hashPassword(password)
          await execute('UPDATE users SET password = $1 WHERE employee_id = $2', [hash, row.employee_id])
        } catch (e) {
          console.error('Failed to backfill password hash:', e)
        }
      }
    }

    return valid ? rowToUser(row) : null
  })
}

