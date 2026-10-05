'use client'

import { User } from './types'

const CURRENT_USER_KEY = 'jsr_current_user'

export async function initializeUsers(): Promise<void> {
  try {
    // Initialize user system by checking if users can be loaded
    await getAllUsers()
    console.log('User authentication system initialized with database')
  } catch (error) {
    console.error('Failed to initialize users from database:', error)
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    // Get users from API
    const response = await fetch('/api/users')
    if (!response.ok) {
      throw new Error('Failed to fetch users')
    }

    const result = await response.json()
    return result.data || []
  } catch (error) {
    console.error('Failed to get all users from API:', error)
    return []
  }
}

export async function getUserByEmployeeId(employeeId: string): Promise<User | null> {
  try {
    // Get user from API
    const response = await fetch(`/api/users/${employeeId}`)
    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error('Failed to fetch user')
    }

    const result = await response.json()
    return result.data || null
  } catch (error) {
    console.error('Failed to get user by employee ID:', error)
    return null
  }
}

export async function authenticateUser(employeeId: string, password: string): Promise<User | null> {
  try {
    // Get user from API and validate password
    const user = await getUserByEmployeeId(employeeId)
    if (!user) return null

    // Password check
    if (user.password === password) {
      return user
    }

    return null
  } catch (error) {
    console.error('Failed to authenticate user:', error)
    return null
  }
}

export async function login(employeeId: string, password: string): Promise<boolean> {
  try {
    // Call the login API endpoint to get JWT token and set cookie
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Important: allows cookies to be set
      body: JSON.stringify({ employeeId, password })
    })

    if (!response.ok) {
      return false
    }

    const result = await response.json()

    if (result.success && result.data) {
      // Store user in localStorage for client-side access
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(result.data))
      // Cookie is automatically set by the API response
      return true
    }

    return false
  } catch (error) {
    console.error('Failed to login:', error)
    return false
  }
}

export interface OtpRequestResult {
  success: boolean
  maskedPhone?: string
  error?: string
  retryAfterSeconds?: number
}

/** Request an OTP for the given employee ID (sent to their registered phone). */
export async function requestOtp(employeeId: string): Promise<OtpRequestResult> {
  try {
    const response = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId }),
    })
    const result = await response.json()
    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to send OTP', retryAfterSeconds: result.retryAfterSeconds }
    }
    return { success: true, maskedPhone: result.maskedPhone }
  } catch (error) {
    console.error('Failed to request OTP:', error)
    return { success: false, error: 'Network error while requesting OTP' }
  }
}

/** Verify an OTP; on success stores the user and sets the auth cookie. */
export async function verifyOtp(employeeId: string, otp: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ employeeId, otp }),
    })
    if (!response.ok) return false

    const result = await response.json()
    if (result.success && result.data) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(result.data))
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to verify OTP:', error)
    return false
  }
}

export async function logout(): Promise<void> {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CURRENT_USER_KEY)
  // Clear filter persistence on logout
  localStorage.removeItem('taskFilters')
  localStorage.removeItem('bugFilters')

  // Clear global window cache
  if (typeof window !== 'undefined') {
    delete (window as any).__DASHBOARD_DATA
  }

  // Clear HTTP cookie by calling API
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch (error) {
    console.error('Failed to clear token cookie on server:', error)
  }
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  
  const userStr = localStorage.getItem(CURRENT_USER_KEY)
  return userStr ? JSON.parse(userStr) : null
}

// Fetch with timeout to prevent hanging
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000 // 15 second timeout for user operations
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout: ${url} took longer than ${timeoutMs}ms`)
    }
    throw error
  }
}

export async function updateUser(updatedUser: User): Promise<boolean> {
  try {
    // Cannot update admin user
    if (updatedUser.employeeId === 'admin-001') {
      return false
    }

    // Update user via API with timeout
    const response = await fetchWithTimeout(
      `/api/users/${updatedUser.employeeId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedUser)
      },
      15000 // 15 second timeout
    )

    const success = response.ok

    if (success) {
      // Update current user if it's the same user
      const currentUser = getCurrentUser()
      if (currentUser && currentUser.employeeId === updatedUser.employeeId) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser))
      }
    }

    return success
  } catch (error) {
    console.error('Failed to update user:', error)
    return false
  }
}

export interface AddUserResult {
  success: boolean
  /** The created user, including the employee ID the server allocated. */
  user?: User
  /** Present on success — the plaintext password to email. Never stored. */
  initialPassword?: string
  passwordWasGenerated?: boolean
  error?: string
}

/**
 * Create a user. Returns the server's actual error message rather than a bare
 * boolean — the old version discarded it, which is why a duplicate employee ID
 * surfaced to admins as an invented "Google Sheets quota" message.
 */
export async function addUser(
  newUser: Omit<User, 'createdAt' | 'updatedAt'>
): Promise<AddUserResult> {
  try {
    const response = await fetchWithTimeout(
      '/api/users',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser)
      },
      15000 // 15 second timeout
    )

    const result = await response.json().catch(() => ({}))

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || `Request failed (${response.status})` }
    }

    return {
      success: true,
      user: result.data,
      initialPassword: result.initialPassword,
      passwordWasGenerated: result.passwordWasGenerated,
    }
  } catch (error) {
    console.error('Failed to add user:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error while creating the user',
    }
  }
}

export function getRoleDisplayName(role: string): string {
  const roleNames = {
    'amtarikshian': 'Employee',
    'management': 'Management',
    'top_management': 'Top Management',
    'admin': 'Administrator'
  }
  return roleNames[role as keyof typeof roleNames] || 'User'
}

export async function getUserNameByEmployeeId(employeeId: string): Promise<string> {
  try {
    const user = await getUserByEmployeeId(employeeId)
    return user ? user.name : employeeId
  } catch (error) {
    console.error('Failed to get user name by employee ID:', error)
    return employeeId
  }
}

// Get manager of a user
export async function getUserManager(employeeId: string): Promise<User | null> {
  try {
    const user = await getUserByEmployeeId(employeeId)
    if (!user || !user.managerId) return null

    return await getUserByEmployeeId(user.managerId)
  } catch (error) {
    console.error('Failed to get user manager:', error)
    return null
  }
}

// Get all team members for a manager (users who report to this manager)
export async function getTeamMembers(managerId: string, recursive = true): Promise<User[]> {
  try {
    // Resolved server-side via a recursive CTE. The old implementation pulled
    // every user and kept those with managerId === managerId — one level only,
    // so a manager's manager saw nothing below their direct reports. It also
    // depended on getAllUsers(), which is now company-scoped.
    const response = await fetch(
      `/api/users/team/${encodeURIComponent(managerId)}${recursive ? '?recursive=true' : ''}`
    )
    if (!response.ok) return []
    const result = await response.json()
    return result.data || []
  } catch (error) {
    console.error('Failed to get team members:', error)
    return []
  }
}

// Check if user can approve for another user (is their manager)
export async function canApproveFor(approverId: string, employeeId: string): Promise<boolean> {
  try {
    const employee = await getUserByEmployeeId(employeeId)
    if (!employee) return false

    // Admin and Top Management can approve for anyone
    const approver = await getUserByEmployeeId(approverId)
    if (approver?.role === 'admin' || approver?.role === 'top_management') return true

    // Manager can approve for their direct reports
    return employee.managerId === approverId
  } catch (error) {
    console.error('Failed to check approval permissions:', error)
    return false
  }
}

// JWT verification is server-only and lives in ./auth-server (verifyToken,
// getAuthUser). Keep it out of this 'use client' module so the signing key can
// never be pulled into a browser bundle.
