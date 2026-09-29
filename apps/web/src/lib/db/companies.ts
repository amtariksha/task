// Company / tenant service
// Server-side only - do not use 'use client'

import { query, queryOne, withRetry, execute } from './config'

export type CompanyRole = 'company_admin' | 'member'

export interface Company {
  companyId: string
  name: string
  /** Employee-ID prefix for this company, e.g. 'AM' -> AM-0001. */
  code: string
  logoUrl?: string
  status: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface CompanyMembership extends Company {
  companyRole: CompanyRole
  isDefault: boolean
}

interface CompanyRow {
  company_id: string
  name: string
  code: string
  logo_url: string | null
  status: string
  created_at?: string
  updated_at?: string
  company_role?: string
  is_default?: boolean
}

function rowToCompany(row: CompanyRow): Company {
  return {
    companyId: row.company_id,
    name: row.name,
    code: row.code,
    logoUrl: row.logo_url || undefined,
    status: row.status as Company['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getAllCompanies(includeInactive = false): Promise<Company[]> {
  return withRetry(async () => {
    const rows = await query<CompanyRow[]>(
      includeInactive
        ? 'SELECT * FROM companies ORDER BY name'
        : `SELECT * FROM companies WHERE status = 'active' ORDER BY name`
    )
    return rows.map(rowToCompany)
  })
}

export async function getCompanyById(companyId: string): Promise<Company | null> {
  return withRetry(async () => {
    const row = await queryOne<CompanyRow>('SELECT * FROM companies WHERE company_id = $1', [companyId])
    return row ? rowToCompany(row) : null
  })
}

/** Every company a user belongs to, with their role in each. */
export async function getUserCompanies(employeeId: string): Promise<CompanyMembership[]> {
  return withRetry(async () => {
    const rows = await query<CompanyRow[]>(
      `SELECT c.*, uc.company_role, uc.is_default
         FROM user_companies uc
         JOIN companies c ON c.company_id = uc.company_id
        WHERE uc.employee_id = $1
          AND c.status = 'active'
        ORDER BY uc.is_default DESC, c.name`,
      [employeeId]
    )
    return rows.map((row) => ({
      ...rowToCompany(row),
      companyRole: (row.company_role as CompanyRole) || 'member',
      isDefault: Boolean(row.is_default),
    }))
  })
}

/**
 * The company a session should start in: the user's default, else any company
 * they belong to. Returns null for a user with no memberships — the caller must
 * treat that as "no access" rather than "all access".
 */
export async function getDefaultCompanyId(employeeId: string): Promise<string | null> {
  return withRetry(async () => {
    const row = await queryOne<{ company_id: string }>(
      `SELECT uc.company_id
         FROM user_companies uc
         JOIN companies c ON c.company_id = uc.company_id
        WHERE uc.employee_id = $1 AND c.status = 'active'
        ORDER BY uc.is_default DESC, c.name
        LIMIT 1`,
      [employeeId]
    )
    return row?.company_id ?? null
  })
}

/** A user's role in one company, or null when they are not a member. */
export async function getCompanyRole(employeeId: string, companyId: string): Promise<CompanyRole | null> {
  return withRetry(async () => {
    const row = await queryOne<{ company_role: string }>(
      'SELECT company_role FROM user_companies WHERE employee_id = $1 AND company_id = $2',
      [employeeId, companyId]
    )
    return (row?.company_role as CompanyRole) ?? null
  })
}

export async function isMemberOfCompany(employeeId: string, companyId: string): Promise<boolean> {
  return (await getCompanyRole(employeeId, companyId)) !== null
}

/**
 * Every employee ID belonging to a company. Used to scope list endpoints in one
 * query rather than asking `canViewUser` per row.
 */
export async function getCompanyMemberIds(companyId: string): Promise<string[]> {
  return withRetry(async () => {
    const rows = await query<Array<{ employee_id: string }>>(
      'SELECT employee_id FROM user_companies WHERE company_id = $1',
      [companyId]
    )
    return rows.map((row) => row.employee_id)
  })
}

export interface CompanyMember {
  employeeId: string
  name: string
  email: string
  department: string | null
  /** Global users.role, shown for context — not what grants company authority. */
  globalRole: string
  status: string
  companyRole: CompanyRole
  isDefault: boolean
  isPlatformAdmin: boolean
  joinedAt?: string
}

/**
 * Everyone in a company, with the detail the Company admin page needs. Ordered
 * admins first so the people who can change things are at the top.
 */
export async function getCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  return withRetry(async () => {
    const rows = await query<Array<{
      employee_id: string
      name: string
      email: string
      department: string | null
      global_role: string
      status: string
      company_role: string
      is_default: boolean
      is_platform_admin: boolean
      created_at?: string
    }>>(
      `SELECT u.employee_id, u.name, u.email, u.department,
              u.role AS global_role, u.status,
              uc.company_role, uc.is_default, uc.created_at,
              COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin
         FROM user_companies uc
         JOIN users u ON u.employee_id = uc.employee_id
        WHERE uc.company_id = $1
        ORDER BY (uc.company_role = 'company_admin') DESC,
                 CASE WHEN u.status = 'active' THEN 0 ELSE 1 END,
                 u.name`,
      [companyId]
    )
    return rows.map((row) => ({
      employeeId: row.employee_id,
      name: row.name,
      email: row.email,
      department: row.department || null,
      globalRole: row.global_role,
      status: row.status,
      companyRole: row.company_role as CompanyRole,
      isDefault: Boolean(row.is_default),
      isPlatformAdmin: Boolean(row.is_platform_admin),
      joinedAt: row.created_at,
    }))
  })
}

/**
 * Change an existing member's company role. Returns false when they are not a
 * member — deliberately NOT an upsert, so a typo in an employee ID cannot quietly
 * add someone to a company.
 */
export async function setCompanyRole(
  employeeId: string,
  companyId: string,
  companyRole: CompanyRole
): Promise<boolean> {
  return withRetry(async () => {
    const affected = await execute(
      `UPDATE user_companies SET company_role = $1, updated_at = NOW()
        WHERE employee_id = $2 AND company_id = $3`,
      [companyRole, employeeId, companyId]
    )
    return affected > 0
  })
}

/** How many company_admins a company has. Used to refuse removing the last one. */
export async function countCompanyAdmins(companyId: string): Promise<number> {
  return withRetry(async () => {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_companies
        WHERE company_id = $1 AND company_role = 'company_admin'`,
      [companyId]
    )
    return row?.n ?? 0
  })
}

export async function addUserToCompany(
  employeeId: string,
  companyId: string,
  companyRole: CompanyRole = 'member',
  makeDefault = false
): Promise<void> {
  return withRetry(async () => {
    // The partial unique index allows only one default per user, so clear the
    // previous one first rather than letting the insert fail.
    if (makeDefault) {
      await execute('UPDATE user_companies SET is_default = FALSE WHERE employee_id = $1', [employeeId])
    }
    await execute(
      `INSERT INTO user_companies (employee_id, company_id, company_role, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, company_id)
       DO UPDATE SET company_role = EXCLUDED.company_role,
                     is_default = EXCLUDED.is_default,
                     updated_at = NOW()`,
      [employeeId, companyId, companyRole, makeDefault]
    )
  })
}

export async function removeUserFromCompany(employeeId: string, companyId: string): Promise<boolean> {
  return withRetry(async () => {
    const affected = await execute(
      'DELETE FROM user_companies WHERE employee_id = $1 AND company_id = $2',
      [employeeId, companyId]
    )
    return affected > 0
  })
}

/** Switch which company a user lands in next session. */
export async function setDefaultCompany(employeeId: string, companyId: string): Promise<boolean> {
  return withRetry(async () => {
    const member = await isMemberOfCompany(employeeId, companyId)
    if (!member) return false
    await execute('UPDATE user_companies SET is_default = FALSE WHERE employee_id = $1', [employeeId])
    await execute(
      'UPDATE user_companies SET is_default = TRUE, updated_at = NOW() WHERE employee_id = $1 AND company_id = $2',
      [employeeId, companyId]
    )
    return true
  })
}

export async function isPlatformAdmin(employeeId: string): Promise<boolean> {
  return withRetry(async () => {
    const row = await queryOne<{ is_platform_admin: boolean }>(
      'SELECT is_platform_admin FROM users WHERE employee_id = $1',
      [employeeId]
    )
    return Boolean(row?.is_platform_admin)
  })
}

/** Next company id, e.g. COMP-002. Mirrors getNextEmployeeId. */
export async function getNextCompanyId(): Promise<string> {
  const row = await queryOne<{ max_num: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(company_id FROM '^COMP-([0-9]+)$') AS INTEGER)) AS max_num
       FROM companies
      WHERE company_id ~ '^COMP-[0-9]+$'`
  )
  return `COMP-${String((row?.max_num ?? 0) + 1).padStart(3, '0')}`
}

export async function createCompany(input: {
  name: string
  code: string
  logoUrl?: string
  createdBy: string
}): Promise<Company> {
  const companyId = await getNextCompanyId()
  await execute(
    `INSERT INTO companies (company_id, name, code, logo_url, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, input.name, input.code.toUpperCase(), input.logoUrl || null, input.createdBy]
  )
  const created = await getCompanyById(companyId)
  if (!created) throw new Error('Failed to retrieve created company')
  return created
}

export async function updateCompany(
  companyId: string,
  updates: Partial<Pick<Company, 'name' | 'code' | 'logoUrl' | 'status'>>
): Promise<Company | null> {
  const fields: string[] = []
  const values: any[] = []
  let i = 1

  if (updates.name !== undefined) { fields.push(`name = $${i++}`); values.push(updates.name) }
  if (updates.code !== undefined) { fields.push(`code = $${i++}`); values.push(updates.code.toUpperCase()) }
  if (updates.logoUrl !== undefined) { fields.push(`logo_url = $${i++}`); values.push(updates.logoUrl || null) }
  if (updates.status !== undefined) { fields.push(`status = $${i++}`); values.push(updates.status) }

  if (fields.length === 0) return getCompanyById(companyId)

  fields.push('updated_at = NOW()')
  values.push(companyId)
  await execute(`UPDATE companies SET ${fields.join(', ')} WHERE company_id = $${i}`, values)
  return getCompanyById(companyId)
}
