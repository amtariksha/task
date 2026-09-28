import React from 'react'

export interface AuthResult {
  success: boolean
  user?: any
  error?: string
  maskedPhone?: string
}

export const AuthContext = React.createContext({
  // Admin/service break-glass password login (kept for fallback)
  signIn: async (employeeId: string, password: string): Promise<AuthResult> => ({ success: false, error: '' }),
  // OTP login (primary): request a code, then verify it
  requestOtp: async (employeeId: string): Promise<AuthResult> => ({ success: false, error: '' }),
  verifyOtp: async (employeeId: string, otp: string): Promise<AuthResult> => ({ success: false, error: '' }),
  // Restore an existing stored session (used by biometric login) without re-authenticating
  restoreSession: async (): Promise<AuthResult> => ({ success: false, error: '' }),
  signOut: async () => { },
  signUp: async () => { },
  /**
   * Called after the session has been re-scoped to another company. Everything
   * loaded for the previous company has to go: the Apollo cache, the saved
   * project filter, the founder flag and the navigation stack. Without this only
   * the screen hosting the switcher reloaded and every other tab kept showing the
   * previous company's data.
   */
  onCompanySwitched: async () => { },
})
